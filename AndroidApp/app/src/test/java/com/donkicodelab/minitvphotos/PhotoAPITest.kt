package com.donkicodelab.minitvphotos

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files

class PhotoAPITest {
    @Test fun lostAcknowledgementReplaysIdenticalManifestAndFile() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(503).setBody("{}"))
            server.enqueue(MockResponse().setBody("""{"imported":1,"duplicates":0}"""))
            val api = PhotoAPI(server.url("/").toString().trimEnd('/'), "test-token")
            val file = Files.createTempFile("photo", ".jpg").toFile().apply { writeText("same-photo-bytes") }
            try {
                val payload = manifest("stable-session", 12, "d".repeat(64), true, JSONObject())
                assertThrows(ServerProblem::class.java) { api.upload("foto.jpg", file, payload, StopSignal()) {} }
                assertEquals("imported", api.upload("foto.jpg", file, payload, StopSignal()) {}.state)
                repeat(2) {
                    val request = server.takeRequest()
                    assertEquals("/pictures/upload", request.path)
                    assertEquals("Bearer test-token", request.getHeader("Authorization"))
                    val body = request.body.readUtf8()
                    assertTrue(body.contains(payload)); assertTrue(body.contains("same-photo-bytes"))
                }
            } finally { file.delete() }
        }
    }
    @Test fun preflightAndMetadataOnlyUploadSendNoImageBytes() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setBody("""{"missing":[]}"""))
            server.enqueue(MockResponse().setBody("""{"imported":0,"duplicates":1}"""))
            val api = PhotoAPI(server.url("/").toString().trimEnd('/'), "token")
            assertFalse(api.missing("a".repeat(64), StopSignal()))
            val file = Files.createTempFile("photo", ".jpg").toFile().apply { writeText("never-send-this") }
            try {
                assertEquals("duplicate", api.upload("photo.jpg", file, manifest("session", 0, "a".repeat(64), false, JSONObject()), StopSignal()) {}.state)
                server.takeRequest()
                val body = server.takeRequest().body.readUtf8()
                assertFalse(body.contains("never-send-this")); assertFalse(body.contains("name=\"files\""))
            } finally { file.delete() }
        }
    }
    @Test fun redirectsNeverForwardCredentials() {
        MockWebServer().use { origin -> MockWebServer().use { destination ->
            origin.enqueue(MockResponse().setResponseCode(307).setHeader("Location", destination.url("/steal")))
            val api = PhotoAPI(origin.url("/").toString().trimEnd('/'), "secret")
            assertThrows(ServerProblem::class.java) { api.missing("a".repeat(64), StopSignal()) }
            assertEquals(0, destination.requestCount)
        } }
    }
    @Test fun stalePreflightAndExpiredSessionRemainRecoverable() {
        MockWebServer().use { server ->
            server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"expired"}"""))
            val api = PhotoAPI(server.url("/").toString().trimEnd('/'), "token")
            val error = assertThrows(ServerProblem::class.java) { api.missing("a".repeat(64), StopSignal()) }
            assertEquals(401, error.status)
        }
    }
}
