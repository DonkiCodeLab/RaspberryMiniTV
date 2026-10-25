package com.donkicodelab.minitvphotos

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.File
import java.io.Writer
import java.util.UUID

data class PhotoItem(val id: Long, val uri: String, val name: String, val size: Long,
                     val takenAt: Long, val favorite: Boolean, val digest: String = "", val payload: String = "")
data class TransferStats(val session: String = "", val server: String = "", val enabled: Boolean = false,
                         val message: String = "Escanea el QR de tu MiniTV para empezar.", val total: Int = 0,
                         val imported: Int = 0, val duplicates: Int = 0, val failed: Int = 0, val remainingBytes: Long = 0) {
    val done get() = imported + duplicates + failed
    val pending get() = total - done
    val percent get() = if (total == 0) 0 else (done.toLong() * 100 / total).toInt()
}

class TransferStore private constructor(context: Context) : SQLiteOpenHelper(context, "transfers.db", null, 1) {
    init { setWriteAheadLoggingEnabled(true) }
    val staging = File(context.noBackupFilesDir, "staged").apply { mkdirs() }
    override fun onConfigure(db: SQLiteDatabase) { db.execSQL("PRAGMA synchronous=FULL") }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE job (id INTEGER PRIMARY KEY CHECK(id=1), session TEXT NOT NULL, server TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL)")
        db.execSQL("CREATE TABLE photos (id INTEGER PRIMARY KEY, uri TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, taken INTEGER NOT NULL, favorite INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', detail TEXT NOT NULL DEFAULT '', digest TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '')")
        db.execSQL("CREATE INDEX photo_state ON photos(state,id)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun replace(server: String, photos: Sequence<PhotoItem>) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete("photos", null, null); db.delete("job", null, null)
            db.insertOrThrow("job", null, ContentValues().apply {
                put("id", 1); put("session", UUID.randomUUID().toString()); put("server", server)
                put("enabled", 0); put("message", "Lista preparada. Pulsa Continuar para subirla.")
            })
            photos.forEach { item -> db.insertOrThrow("photos", null, ContentValues().apply {
                put("id", item.id); put("uri", item.uri); put("name", item.name); put("size", item.size)
                put("taken", item.takenAt); put("favorite", if (item.favorite) 1 else 0)
            }) }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
        staging.listFiles()?.forEach { it.delete() }
    }
    fun stats(): TransferStats {
        val db = readableDatabase
        db.rawQuery("SELECT session,server,enabled,message FROM job WHERE id=1", null).use { job ->
            if (!job.moveToFirst()) return TransferStats()
            db.rawQuery("SELECT COUNT(*),COALESCE(SUM(state='imported'),0),COALESCE(SUM(state='duplicate'),0),COALESCE(SUM(state='failed'),0),COALESCE(SUM(CASE WHEN state='pending' THEN size ELSE 0 END),0) FROM photos", null).use { count ->
                count.moveToFirst()
                return TransferStats(job.getString(0), job.getString(1), job.getInt(2) == 1, job.getString(3), count.getInt(0), count.getInt(1), count.getInt(2), count.getInt(3), count.getLong(4))
            }
        }
    }
    fun enabled(value: Boolean, message: String) {
        writableDatabase.update("job", ContentValues().apply { put("enabled", if (value) 1 else 0); put("message", message) }, "id=1", null)
    }
    fun message(value: String) {
        writableDatabase.update("job", ContentValues().apply { put("message", value) }, "id=1", null)
    }
    private fun item(row: Cursor) = PhotoItem(row.getLong(0), row.getString(1), row.getString(2), row.getLong(3), row.getLong(4), row.getInt(5) == 1, row.getString(6), row.getString(7))
    fun next(): PhotoItem? = readableDatabase.rawQuery("SELECT id,uri,name,size,taken,favorite,digest,payload FROM photos WHERE state='pending' ORDER BY id LIMIT 1", null).use { if (it.moveToFirst()) item(it) else null }
    fun staged(item: PhotoItem, digest: String, payload: String) {
        writableDatabase.update("photos", ContentValues().apply { put("digest", digest); put("payload", payload) }, "id=? AND state='pending'", arrayOf(item.id.toString()))
    }
    fun clearStage(item: PhotoItem) {
        writableDatabase.update("photos", ContentValues().apply { put("digest", ""); put("payload", "") }, "id=?", arrayOf(item.id.toString()))
    }
    fun finish(item: PhotoItem, result: UploadResult) {
        // Commit the receipt before deleting the staged bytes. A crash can only replay the same batch.
        writableDatabase.update("photos", ContentValues().apply {
            put("state", result.state); put("detail", result.detail); put("payload", "")
        }, "id=? AND state='pending'", arrayOf(item.id.toString()))
        file(item).delete()
    }
    fun file(item: PhotoItem) = File(staging, "${item.id}.photo")
    fun cleanOrphans() {
        val keep = next()?.id?.toString()?.plus(".photo")
        staging.listFiles()?.filter { it.name != keep }?.forEach { it.delete() }
    }
    fun recent(): List<String> = readableDatabase.rawQuery("SELECT name,state,detail FROM photos WHERE state!='pending' ORDER BY id DESC LIMIT 40", null).use { rows ->
        buildList { while (rows.moveToNext()) add("${label(rows.getString(1))} · ${rows.getString(0)}" + rows.getString(2).takeIf { it.isNotBlank() }?.let { "\n$it" }.orEmpty()) }
    }
    fun writeReport(writer: Writer) {
        writer.write("Archivo,Resultado,Detalle\r\n")
        readableDatabase.rawQuery("SELECT name,state,detail FROM photos ORDER BY id", null).use { rows ->
            while (rows.moveToNext()) writer.write(listOf(rows.getString(0), label(rows.getString(1)), rows.getString(2)).joinToString(",") { csvCell(it) } + "\r\n")
        }
    }
    companion object {
        @Volatile private var instance: TransferStore? = null
        fun get(context: Context): TransferStore = instance ?: synchronized(this) {
            instance ?: TransferStore(context.applicationContext).also { instance = it }
        }
        fun label(state: String) = when (state) { "imported" -> "Nueva"; "duplicate" -> "Ya estaba"; "failed" -> "Error"; else -> "Pendiente" }
    }
}
