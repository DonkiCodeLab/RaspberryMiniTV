package com.donkicodelab.minitvphotos

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class MiniTVTransferModule : Module() {
    private val context get() = requireNotNull(appContext.reactContext) { "La app todavía no está preparada." }.applicationContext
    private fun idle() {
        check(!TransferRuntime.active && !TransferRuntime.indexing.get() && !TransferStore.get(context).stats().enabled) {
            "Pausa la importación y espera a que termine la foto actual."
        }
    }
    private fun start() {
        check(appContext.currentActivity != null) { "Abre la app y pulsa Continuar." }
        val connection = CredentialVault(context).read()
        check(connection != null && connection.valid()) { "Escanea otro QR para enlazar tu MiniTV." }
        check(TransferStore.get(context).stats().server == connection.server) { "La cola pertenece a otra MiniTV. Prepara una nueva importación." }
        check(PhotoMedia.hasAccess(context)) { "Permite el acceso a tus fotos para continuar." }
        TransferScheduler.start(context)
    }
    override fun definition() = ModuleDefinition {
        Name("MiniTVTransfer")
        OnActivityEntersForeground {
            val store = TransferStore.get(context)
            if (store.stats().enabled && !TransferRuntime.active && !TransferRuntime.indexing.get() && !TransferScheduler.hasScheduledWork(context)) {
                store.enabled(false, "La subida se interrumpió. Pulsa Continuar para recuperar el progreso.")
            }
        }
        AsyncFunction("previewPairing") { text: String -> Pairing.parse(text).server }
        AsyncFunction("connect") { text: String ->
            idle()
            val pair = Pairing.parse(text)
            val network = LocalNetwork.wifi(context) ?: throw UserProblem("Conéctate a la misma Wi-Fi que tu MiniTV.")
            val vault = CredentialVault(context)
            vault.save(PhotoAPI(pair.server, builder = LocalNetwork.client(network)).claim(pair.code, vault.clientId(), "${Build.MANUFACTURER} ${Build.MODEL} · Expo", StopSignal()))
        }
        AsyncFunction("prepare") {
            idle()
            val connection = CredentialVault(context).read()
            check(connection != null && connection.valid()) { "Primero enlaza tu MiniTV." }
            check(TransferRuntime.indexing.compareAndSet(false, true)) { "Ya se está preparando la lista." }
            try {
                PhotoMedia.snapshot(context, TransferStore.get(context), connection.server)
                check(TransferStore.get(context).stats().total > 0) { "No hay fotos accesibles. Revisa los permisos de la galería." }
            } finally { TransferRuntime.indexing.set(false) }
            start()
        }
        AsyncFunction("start") { start() }
        AsyncFunction("pause") { TransferScheduler.pause(context) }
        AsyncFunction("report") {
            val file = File(context.cacheDir, "MiniTV-Fotos.csv")
            file.bufferedWriter().use { TransferStore.get(context).writeReport(it) }
            file.toURI().toString()
        }
        AsyncFunction("getState") {
            val connection = CredentialVault(context).read()
            val stats = TransferStore.get(context).stats()
            mapOf(
                "connected" to (connection?.valid() == true), "server" to (connection?.server ?: ""),
                "running" to stats.enabled, "preparing" to (TransferRuntime.indexing.get() || (!stats.enabled && TransferRuntime.active)),
                "limited" to (PhotoMedia.hasAccess(context) && !PhotoMedia.fullAccess(context)),
                "hasJob" to stats.session.isNotEmpty(), "canResume" to (stats.pending > 0 && connection?.server == stats.server),
                "message" to stats.message, "error" to "", "total" to stats.total,
                "imported" to stats.imported, "existing" to stats.duplicates, "failed" to stats.failed,
                "percentage" to (if (stats.total == 0) 0.0 else stats.done.toDouble() / stats.total),
                "fileName" to TransferRuntime.current, "fileProgress" to TransferRuntime.filePercent / 100.0,
                "recent" to TransferStore.get(context).recent(),
                "backgroundNotice" to "La subida continúa con una notificación y conexión Wi-Fi. Si fuerzas la detención, vuelve a abrir la app y pulsa Continuar."
            )
        }
    }
}
