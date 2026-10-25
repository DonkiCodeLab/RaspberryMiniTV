package com.donkicodelab.minitvphotos

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.time.Instant

object PhotoMedia {
    fun fullAccess(context: Context) = context.checkSelfPermission(if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    fun hasAccess(context: Context) = fullAccess(context) || (Build.VERSION.SDK_INT >= 34 && context.checkSelfPermission(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) == PackageManager.PERMISSION_GRANTED)

    fun snapshot(context: Context, store: TransferStore, server: String) {
        if (!hasAccess(context)) throw UserProblem("Permite el acceso a tus fotos para preparar la subida.")
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        val columns = mutableListOf("_id", "_display_name", "_size", "datetaken", "date_added")
        if (Build.VERSION.SDK_INT >= 30) columns.add("is_favorite")
        val selection = if (Build.VERSION.SDK_INT >= 30) "is_pending=0 AND is_trashed=0" else "is_pending=0"
        val cursor = context.contentResolver.query(collection, columns.toTypedArray(), selection, null, "_id ASC")
            ?: throw UserProblem("No se ha podido leer la galería.")
        cursor.use { rows ->
            store.replace(server, sequence {
                var position = 0L
                while (rows.moveToNext()) {
                    val id = rows.getLong(0)
                    yield(PhotoItem(position++, ContentUris.withAppendedId(collection, id).toString(),
                        rows.getString(1) ?: "foto-$id.jpg", rows.getLong(2).coerceAtLeast(0),
                        rows.getLong(3).takeIf { it > 0 } ?: rows.getLong(4) * 1000,
                        Build.VERSION.SDK_INT >= 30 && rows.getInt(5) == 1))
                }
            })
        }
    }

    fun export(context: Context, item: PhotoItem, target: File, signal: StopSignal): String {
        if (item.name.substringAfterLast('.', "").lowercase() !in PhotoBytes.extensions) throw UserProblem("Formato no compatible: ${item.name.substringAfterLast('.', "sin extensión")}.")
        if (item.size > PhotoBytes.MAX) throw UserProblem("Esta foto supera el límite de 50 MB.")
        var uri = Uri.parse(item.uri)
        if (context.checkSelfPermission(Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED) uri = MediaStore.setRequireOriginal(uri)
        val input = context.contentResolver.openInputStream(uri) ?: throw FileNotFoundException("La foto ya no está disponible.")
        val partial = File(target.parentFile, target.name + ".part")
        try {
            val digest = input.use { PhotoBytes.copy(it, partial, signal) }
            signal.check()
            if (!partial.renameTo(target)) throw java.io.IOException("No se ha podido guardar la foto preparada.")
            return digest
        } finally { partial.delete() }
    }
    fun metadata(item: PhotoItem): JSONObject = JSONObject().apply {
        put("androidId", item.uri); put("androidFavorite", item.favorite)
        put("albums", JSONArray()); put("people", JSONArray()); put("keywords", JSONArray())
        if (item.takenAt > 0) put("takenAt", Instant.ofEpochMilli(item.takenAt).toString())
    }
}
