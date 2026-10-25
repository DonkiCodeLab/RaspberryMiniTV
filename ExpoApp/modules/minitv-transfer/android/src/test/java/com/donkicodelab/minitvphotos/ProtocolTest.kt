package com.donkicodelab.minitvphotos

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.io.InputStream
import java.net.URLEncoder
import java.nio.file.Files
import java.security.MessageDigest

class ProtocolTest {
    private val code = "a".repeat(43)
    private fun link(server: String = "http://192.168.1.50:5050") = "minitvphotos://pair?v=1&server=${URLEncoder.encode(server, "UTF-8")}&code=$code"
    @Test fun sameQRAsIOSAndWeb() {
        assertEquals(Pairing("http://192.168.1.50:5050", code), Pairing.parse(link()))
        assertEquals("https://photos.example.com", Pairing.parse(link("https://photos.example.com/")).server)
        assertEquals("http://[fd00::1]:5050", Pairing.parse(link("http://[fd00::1]:5050")).server)
    }
    @Test fun rejectsAmbiguousOrUnsafeQR() {
        listOf(link() + "&v=1", link() + "#x", link().replace("v=1", "v=2"), link().replace("pair?", "pair/path?"),
            link("http://localhost:5050"), link("http://127.3.2.1"), link("http://[::1]"), link("http://u:p@tv.local"),
            link("ftp://tv.local"), link("http://tv.local/path"), link("http://tv.local?x=y"), link("http://tv.local:99999"),
            link().replace("code=$code", "code=short"), link().replace("server=", "unexpected="), link() + "&other=1")
            .forEach { bad -> assertThrows("Accepted: $bad", UserProblem::class.java) { Pairing.parse(bad) } }
    }
    @Test fun duplicatesPreserveWebMetadataAndRetriesHaveStableIds() {
        val metadata = JSONObject().put("takenAt", "2024-01-01T00:00:00Z")
        val new = JSONObject(manifest("session", 42, "f".repeat(64), true, metadata))
        val duplicate = JSONObject(manifest("session", 42, "f".repeat(64), false, metadata))
        assertEquals(new.getString("batch"), duplicate.getString("batch"))
        assertEquals(0, new.getJSONArray("fileIndices").getInt(0))
        assertEquals(0, duplicate.getJSONArray("fileIndices").length())
        assertTrue(duplicate.getJSONArray("records").getJSONObject(0).isNull("metadata"))
    }
    @Test fun receiptRequiresExactlyOneConfirmedOutcome() {
        assertEquals("imported", UploadResult.parse(JSONObject("""{"imported":1,"duplicates":0}""")).state)
        assertEquals("duplicate", UploadResult.parse(JSONObject("""{"imported":0,"duplicates":1}""")).state)
        assertEquals(UploadResult("failed", "invalid"), UploadResult.parse(JSONObject("""{"imported":0,"duplicates":0,"rejected":[{"index":0,"error":"invalid"}]}""")))
        listOf("""{"imported":0,"duplicates":0}""", """{"imported":1,"duplicates":1}""", """{"imported":-1,"duplicates":2}""")
            .forEach { assertThrows(UserProblem::class.java) { UploadResult.parse(JSONObject(it)) } }
    }
    @Test fun originalBytesAndDigestAreExact() {
        val dir = Files.createTempDirectory("photo-test").toFile()
        try {
            val bytes = ByteArray(256 * 1024 + 5) { (it % 251).toByte() }
            val target = File(dir, "photo")
            val digest = PhotoBytes.copy(ByteArrayInputStream(bytes), target, StopSignal())
            assertArrayEquals(bytes, target.readBytes())
            assertEquals(MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }, digest)
        } finally { dir.deleteRecursively() }
    }
    @Test fun cancellationEmptyAndOversizeNeverLeavePartialBytes() {
        val dir = Files.createTempDirectory("photo-test").toFile()
        val target = File(dir, "photo")
        try {
            assertThrows(UserProblem::class.java) { PhotoBytes.copy(ByteArrayInputStream(byteArrayOf()), target, StopSignal()) }
            assertFalse(target.exists())
            assertThrows(Stopped::class.java) { PhotoBytes.copy(ByteArrayInputStream(byteArrayOf(1)), target, StopSignal().apply { cancel() }) }
            assertFalse(target.exists())
            val endless = object : InputStream() {
                override fun read() = 1
                override fun read(bytes: ByteArray, offset: Int, length: Int): Int { bytes.fill(1, offset, offset + length); return length }
            }
            assertThrows(UserProblem::class.java) { PhotoBytes.copy(endless, target, StopSignal()) }
            assertFalse(target.exists())
        } finally { dir.deleteRecursively() }
    }
    @Test fun reportEscapesSpreadsheetFormulas() {
        assertEquals("\"'=SUM(A1)\"", csvCell("=SUM(A1)"))
        assertEquals("\"foto, \"\"bonita\"\".jpg\"", csvCell("foto, \"bonita\".jpg"))
    }
}
