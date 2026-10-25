package com.donkicodelab.minitvphotos

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

class UserProblem(message: String) : Exception(message)
class ServerProblem(val status: Int, message: String) : Exception(message)
class Stopped : Exception()
class StopSignal {
    private val stopped = AtomicBoolean(false)
    @Volatile var cancelRequest: (() -> Unit)? = null
    fun cancel() { stopped.set(true); cancelRequest?.invoke() }
    fun check() { if (stopped.get() || Thread.currentThread().isInterrupted) throw Stopped() }
}

data class Pairing(val server: String, val code: String) {
    companion object {
        fun parse(text: String): Pairing = try {
            require(text.length <= 2048)
            val uri = URI(text.trim())
            require(uri.scheme == "minitvphotos" && uri.rawAuthority == "pair")
            require(uri.path.isNullOrEmpty() && uri.fragment == null)
            val parts = (uri.rawQuery ?: "").split('&').map {
                val pair = it.split('=', limit = 2)
                require(pair.size == 2)
                URLDecoder.decode(pair[0], "UTF-8") to URLDecoder.decode(pair[1], "UTF-8")
            }
            val values = parts.toMap()
            require(parts.size == 3 && values.keys == setOf("v", "server", "code") && values["v"] == "1")
            val code = values.getValue("code")
            require(code.matches(Regex("[A-Za-z0-9_-]{43}")))
            Pairing(origin(values.getValue("server")), code)
        } catch (_: Exception) { throw UserProblem("Este QR no es un enlace válido de MiniTV Fotos. Genera otro desde Subidas → Fotos.") }

        fun origin(text: String): String {
            val uri = URI(text)
            require(uri.scheme in listOf("http", "https") && !uri.host.isNullOrBlank())
            require(uri.userInfo == null && uri.query == null && uri.fragment == null)
            require(uri.path.isNullOrEmpty() || uri.path == "/")
            require(uri.port == -1 || uri.port in 1..65535)
            val host = uri.host.lowercase().removePrefix("[").removeSuffix("]").trimEnd('.')
            require(host !in listOf("localhost", "0.0.0.0", "::", "::1", "0:0:0:0:0:0:0:1") && !host.startsWith("127.") && !host.startsWith("::ffff:127."))
            return URI(uri.scheme, null, uri.host, uri.port, null, null, null).toASCIIString()
        }
    }
}

class Connection(val server: String, val token: String, val expiresAt: Long) {
    fun valid() = expiresAt > System.currentTimeMillis() / 1000
}

data class UploadResult(val state: String, val detail: String = "") {
    companion object {
        fun parse(json: JSONObject): UploadResult {
            val imported = json.getInt("imported")
            val duplicates = json.getInt("duplicates")
            val rejected = json.optJSONArray("rejected") ?: JSONArray()
            if (imported !in 0..1 || duplicates !in 0..1 || imported + duplicates + rejected.length() != 1)
                throw UserProblem("La MiniTV no ha confirmado correctamente esta foto.")
            return when {
                imported == 1 -> UploadResult("imported")
                duplicates == 1 -> UploadResult("duplicate")
                else -> UploadResult("failed", rejected.getJSONObject(0).optString("error", "Foto rechazada"))
            }
        }
    }
}

object PhotoBytes {
    const val MAX = 50L * 1024 * 1024
    val extensions = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif")
    fun copy(input: InputStream, target: File, signal: StopSignal): String {
        val hash = MessageDigest.getInstance("SHA-256")
        var size = 0L
        try {
            target.outputStream().use { out ->
                val buffer = ByteArray(128 * 1024)
                while (true) {
                    signal.check()
                    val count = input.read(buffer)
                    if (count < 0) break
                    size += count
                    if (size > MAX) throw UserProblem("Esta foto supera el límite de 50 MB.")
                    out.write(buffer, 0, count); hash.update(buffer, 0, count)
                }
                if (size == 0L) throw UserProblem("La foto está vacía.")
                out.fd.sync()
            }
            return hash.digest().joinToString("") { "%02x".format(it) }
        } catch (e: Exception) { target.delete(); throw e }
    }
}

fun manifest(session: String, index: Long, digest: String, missing: Boolean, metadata: JSONObject): String {
    val record = JSONObject().put("metadata", if (missing) metadata else JSONObject.NULL)
        .put("raw", if (missing) metadata else JSONObject.NULL)
    return JSONObject().put("session", session).put("batch", "$index-$digest")
        .put("digests", JSONArray().put(digest)).put("fileIndices", if (missing) JSONArray().put(0) else JSONArray())
        .put("records", JSONArray().put(record)).put("continueOnError", true).put("preserveAlbums", false).toString()
}

fun csvCell(value: String): String {
    val safe = if (value.trimStart().firstOrNull() in listOf('=', '+', '-', '@', '\t', '\r')) "'$value" else value
    return "\"${safe.replace("\"", "\"\"")}\""
}
