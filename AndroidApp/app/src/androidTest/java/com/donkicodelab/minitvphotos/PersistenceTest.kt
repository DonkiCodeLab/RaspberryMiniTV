package com.donkicodelab.minitvphotos

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.StringWriter

@RunWith(AndroidJUnit4::class)
class PersistenceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val store get() = TransferStore.get(context)
    private val first = PhotoItem(0, "content://media/external/images/media/101", "uno.jpg", 40, 0, false)
    private val second = PhotoItem(1, "content://media/external/images/media/102", "=dos.jpg", 40, 0, false)

    @Test fun restartPreservesStagedBatchAndServerReceipt() {
        store.replace("http://tv.local:5050", sequenceOf(first, second))
        val session = store.stats().session
        val payload = manifest(session, 0, "a".repeat(64), true, JSONObject())
        store.file(first).writeText("exact-bytes")
        store.staged(first, "a".repeat(64), payload)
        store.enabled(true, "Subiendo")
        store.close()
        assertEquals(payload, store.next()!!.payload)
        assertEquals(session, store.stats().session)
        assertTrue(store.stats().enabled)
        assertEquals("exact-bytes", store.file(first).readText())
        store.finish(first, UploadResult("imported"))
        store.finish(first, UploadResult("duplicate")) // A late repeated callback must not change the result.
        store.close()
        assertEquals(1, store.stats().imported)
        assertEquals(0, store.stats().duplicates)
        assertEquals(1L, store.next()!!.id)
        assertFalse(store.file(first).exists())
        store.finish(second, UploadResult("duplicate"))
        assertEquals(100, store.stats().percent)
        val report = StringWriter().also { store.writeReport(it) }.toString()
        assertTrue(report.contains("'=dos.jpg"))
        assertTrue(report.contains("Ya estaba"))
        store.enabled(false, "Prueba terminada")
    }
    @Test fun failedSnapshotRollsBackPreviousQueue() {
        store.replace("http://tv.local:5050", sequenceOf(first))
        val session = store.stats().session
        try { store.replace("http://other.local:5050", sequence { yield(second); throw IllegalStateException("interrupted") }); fail() }
        catch (_: IllegalStateException) { }
        assertEquals(session, store.stats().session)
        assertEquals(first.uri, store.next()!!.uri)
    }
    @Test fun credentialUsesKeystoreAndSurvivesRecreation() {
        val vault = CredentialVault(context)
        val credential = "z".repeat(43)
        vault.save(Connection("http://tv.local:5050", credential, System.currentTimeMillis() / 1000 + 600))
        assertEquals(credential, CredentialVault(context).read()!!.token)
        val prefs = context.getSharedPreferences("connection", 0)
        assertFalse(prefs.all.values.any { it.toString().contains(credential) })
        vault.clear()
        assertNull(vault.read())
    }
}
