package com.donkicodelab.minitvphotos

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

class PhotoAPI(private val server: String, private val token: String = "", builder: OkHttpClient.Builder = OkHttpClient.Builder()) {
    private val http = builder.followRedirects(false).followSslRedirects(false)
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS).callTimeout(10, TimeUnit.MINUTES).build()

    private fun post(path: String, body: RequestBody, signal: StopSignal): JSONObject {
        signal.check()
        val request = Request.Builder().url("$server/$path").post(body)
        if (token.isNotEmpty()) request.header("Authorization", "Bearer $token")
        val call = http.newCall(request.build())
        signal.cancelRequest = { call.cancel() }
        try {
            signal.check()
            call.execute().use { response ->
                val source = response.body?.source() ?: throw IOException("Respuesta vacía de la MiniTV.")
                source.request(1024L * 1024 + 1)
                if (source.buffer.size > 1024L * 1024) throw IOException("Respuesta de la MiniTV demasiado grande.")
                val text = source.readUtf8()
                val json = runCatching { JSONObject(text) }.getOrNull()
                if (!response.isSuccessful) throw ServerProblem(response.code, json?.optString("error")?.takeIf { it.isNotEmpty() }
                    ?: "La MiniTV ha respondido HTTP ${response.code}.")
                return json ?: throw IOException("La MiniTV no ha devuelto JSON válido.")
            }
        } finally { signal.cancelRequest = null }
    }

    private fun json(path: String, data: JSONObject, signal: StopSignal) =
        post(path, data.toString().toRequestBody("application/json".toMediaType()), signal)

    fun claim(code: String, clientId: String, name: String, signal: StopSignal): Connection {
        val response = json("pictures/mobile/claim", JSONObject().put("code", code).put("clientId", clientId).put("deviceName", name.take(80)), signal)
        val credential = response.getString("token")
        val expiry = response.getLong("expiresAt")
        if (!credential.matches(Regex("[A-Za-z0-9_-]{43}")) || expiry <= System.currentTimeMillis() / 1000)
            throw UserProblem("El servidor ha devuelto un enlace inválido.")
        return Connection(server, credential, expiry)
    }

    fun missing(digest: String, signal: StopSignal): Boolean {
        val values = json("pictures/import/check", JSONObject().put("digests", JSONArray().put(digest)), signal).getJSONArray("missing")
        if (values.length() == 0) return false
        if (values.length() == 1 && values.getInt(0) == 0) return true
        throw UserProblem("Respuesta inválida al comprobar duplicados.")
    }

    fun upload(name: String, file: File, metadata: String, signal: StopSignal, progress: (Int) -> Unit): UploadResult {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("metadata", "metadata.json", metadata.toRequestBody("application/json".toMediaType()))
        if (JSONObject(metadata).getJSONArray("fileIndices").length() > 0) {
            body.addFormDataPart("files", name.replace(Regex("[\"\r\n]"), "_"), file.asRequestBody("application/octet-stream".toMediaType()))
        }
        val multipart = body.build()
        val reporting = object : RequestBody() {
            override fun contentType() = multipart.contentType()
            override fun contentLength() = multipart.contentLength()
            override fun writeTo(sink: BufferedSink) {
                var written = 0L
                val total = contentLength()
                val tracked = object : ForwardingSink(sink) {
                    override fun write(source: Buffer, byteCount: Long) {
                        signal.check()
                        super.write(source, byteCount)
                        written += byteCount
                        progress(((written * 100) / total.coerceAtLeast(1)).coerceIn(0, 100).toInt())
                    }
                }.buffer()
                multipart.writeTo(tracked); tracked.flush()
            }
        }
        return UploadResult.parse(post("pictures/upload", reporting, signal))
    }
}
