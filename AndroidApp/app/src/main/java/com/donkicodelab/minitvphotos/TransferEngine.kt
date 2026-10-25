package com.donkicodelab.minitvphotos

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import okhttp3.OkHttpClient
import java.io.FileNotFoundException
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

object LocalNetwork {
    fun wifi(context: Context): Network? {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        return manager.allNetworks.firstOrNull {
            manager.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
        }
    }
    fun client(network: Network) = OkHttpClient.Builder().socketFactory(network.socketFactory)
        .dns(object : okhttp3.Dns { override fun lookup(hostname: String) = network.getAllByName(hostname).toList() })
}

/** One executor owns preparation and uploads, even when Android replaces a stopped job. */
object TransferRuntime {
    private val executor = Executors.newSingleThreadExecutor()
    val indexing = AtomicBoolean(false)
    @Volatile var active = false; private set
    @Volatile var current = ""; private set
    @Volatile var filePercent = 0; private set
    @Volatile private var signal: StopSignal? = null
    fun cancel() { signal?.cancel() }
    fun run(context: Context, stop: StopSignal, changed: () -> Unit, finished: (Boolean) -> Unit) {
        executor.execute {
            active = true; signal = stop
            var retry = false
            val store = TransferStore.get(context)
            try {
                stop.check()
                store.cleanOrphans()
                var failures = 0
                while (store.stats().enabled) {
                    stop.check()
                    val stats = store.stats()
                    val item = store.next() ?: break
                    current = item.name; filePercent = 0
                    val connection = CredentialVault(context).read()
                    if (connection == null || !connection.valid() || connection.server != stats.server)
                        throw UserProblem("El enlace ha caducado. Escanea otro QR de la misma MiniTV y pulsa Continuar.")
                    if (!PhotoMedia.hasAccess(context)) throw UserProblem("Se ha retirado el permiso de fotos. Concédelo y pulsa Continuar.")
                    val network = LocalNetwork.wifi(context)
                    if (network == null) { store.message("Esperando conexión Wi-Fi…"); changed(); waitRetry(stop, 10); continue }
                    val api = PhotoAPI(connection.server, connection.token, LocalNetwork.client(network))
                    var payload = item.payload
                    try {
                        val file = store.file(item)
                        if (payload.isEmpty() || !file.isFile) {
                            store.clearStage(item)
                            payload = ""
                            store.message("Preparando ${item.name}"); changed()
                            val digest = try { PhotoMedia.export(context, item, file, stop) }
                            catch (e: UserProblem) { store.finish(item, UploadResult("failed", e.message.orEmpty())); continue }
                            catch (_: FileNotFoundException) { store.finish(item, UploadResult("failed", "La foto se ha borrado o ya no está disponible.")); continue }
                            val missing = api.missing(digest, stop)
                            payload = manifest(stats.session, item.id, digest, missing, PhotoMedia.metadata(item))
                            store.staged(item, digest, payload)
                        }
                        stop.check()
                        store.message("Subiendo ${item.name}"); changed()
                        val result = api.upload(item.name, file, payload, stop) { percent ->
                            if (filePercent != percent) { filePercent = percent; changed() }
                        }
                        store.finish(item, result)
                        failures = 0; changed()
                    } catch (e: ServerProblem) {
                        stop.check()
                        when {
                            e.status == 401 || e.status == 403 -> {
                                CredentialVault(context).clear()
                                throw UserProblem("El enlace ya no es válido. Genera otro QR y vuelve a enlazar la misma MiniTV.")
                            }
                            e.status == 409 && org.json.JSONObject(payload.ifEmpty { "{}" }).optJSONArray("fileIndices")?.length() == 0 -> store.clearStage(item)
                            e.status == 400 || e.status == 413 || e.status == 415 || e.status == 422 -> store.finish(item, UploadResult("failed", e.message.orEmpty()))
                            e.status == 429 || e.status >= 500 -> {
                                store.message("MiniTV ocupada. Reintentando…"); changed(); waitRetry(stop, retrySeconds(++failures))
                            }
                            else -> throw UserProblem(e.message ?: "La MiniTV no acepta la transferencia.")
                        }
                    } catch (_: IOException) {
                        stop.check()
                        store.message("Conexión interrumpida o archivo inaccesible. Reintentando…"); changed(); waitRetry(stop, retrySeconds(++failures))
                    }
                }
                if (store.stats().pending == 0) store.enabled(false, "Importación terminada.")
            } catch (_: Stopped) {
                retry = store.stats().enabled
            } catch (_: SecurityException) {
                store.enabled(false, "Falta un permiso de fotos o de red. Revisa los permisos de MiniTV Fotos y pulsa Continuar.")
            } catch (e: Exception) {
                store.enabled(false, e.message ?: "No se ha podido continuar. El progreso se ha conservado.")
            } finally {
                signal = null; active = false; current = ""; filePercent = 0
                changed(); finished(retry)
            }
        }
    }
    private fun retrySeconds(attempt: Int) = (5 * (1 shl attempt.coerceAtMost(6))).coerceAtMost(300)
    private fun waitRetry(stop: StopSignal, seconds: Int) { repeat(seconds) { stop.check(); Thread.sleep(1000) } }
}
