package com.donkicodelab.minitvphotos

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {
    private val bg = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val store by lazy { TransferStore.get(this) }
    private val vault by lazy { CredentialVault(this) }
    private lateinit var address: TextView
    private lateinit var access: TextView
    private lateinit var status: TextView
    private lateinit var percent: TextView
    private lateinit var counts: TextView
    private lateinit var progress: ProgressBar
    private lateinit var current: TextView
    private lateinit var recent: TextView
    private lateinit var primary: Button
    private lateinit var fresh: Button
    private lateinit var scan: Button
    private lateinit var paste: Button
    private lateinit var permissions: Button
    private var localBusy = false
    private var startAfterPermission = false
    private var previousDone = -1
    private var previousSession = ""
    private val ticker = object : Runnable { override fun run() { refresh(); main.postDelayed(this, 1000) } }

    private val scanner = registerForActivityResult(ScanContract()) { result -> result.contents?.let { acceptLink(it) } }
    private val photosPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        refresh()
        if (startAfterPermission) { startAfterPermission = false; if (PhotoMedia.hasAccess(this)) prepareNew() else problem("Permite el acceso a las fotos que quieras subir.") }
    }
    private val notificationsPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { startTransfer() }
    private val report = registerForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) bg.execute {
            try { contentResolver.openOutputStream(uri)?.bufferedWriter(Charsets.UTF_8)?.use { store.writeReport(it) } ?: throw UserProblem("No se puede guardar el informe.") }
            catch (e: Exception) { runOnUiThread { problem(e.message.orEmpty()) } }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
        buildScreen()
        if (savedInstanceState == null) intent.dataString?.let { acceptLink(it) }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); intent.dataString?.let { acceptLink(it) } }
    override fun onResume() {
        super.onResume()
        if (store.stats().enabled && !TransferRuntime.active && !TransferScheduler.hasScheduledWork(this))
            store.enabled(false, "La subida se interrumpió. Pulsa Continuar para recuperar los pendientes.")
        main.post(ticker)
    }
    override fun onPause() { main.removeCallbacks(ticker); super.onPause() }
    override fun onDestroy() { main.removeCallbacks(ticker); bg.shutdown(); super.onDestroy() }

    private fun buildScreen() {
        val scroll = ScrollView(this).apply { setBackgroundColor(NAVY); isFillViewport = true }
        val page = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(24), dp(24), dp(32)) }
        scroll.addView(page)
        scroll.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val edges = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
                v.setPadding(edges.left, edges.top, edges.right, edges.bottom)
            } else v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            insets
        }
        setContentView(scroll)
        page.addView(text("MINITV  /  ANDROID", 12, YELLOW, true).apply { letterSpacing = .15f })
        page.addView(text("Tus fotos.\nEn tu MiniTV.", 36, WHITE, true), margin(12, 12))
        page.addView(text("Sin cables. Sin duplicados. También con la pantalla bloqueada.", 16, MUTED), margin(0, 24))

        val connection = card(page)
        connection.addView(text("01  ·  CONECTAR", 12, YELLOW, true))
        address = text("Escanea el QR de Subidas → Fotos", 19, WHITE, true)
        connection.addView(address, margin(12, 8))
        connection.addView(text("Conecta el móvil y la MiniTV a la misma Wi-Fi.", 14, MUTED))
        scan = button("Escanear QR", true) { scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Escanea el QR de tu MiniTV").setBeepEnabled(false).setOrientationLocked(false)) }
        connection.addView(scan, margin(12, 0))
        paste = button("Pegar enlace") {
            val input = EditText(this).apply { hint = "minitvphotos://pair?…"; setSingleLine(false); inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI }
            AlertDialog.Builder(this).setTitle("Enlace del QR").setView(input).setPositiveButton("Revisar") { _, _ -> acceptLink(input.text.toString()) }.setNegativeButton("Cancelar", null).show()
        }
        connection.addView(paste)

        val transfer = card(page)
        transfer.addView(text("02  ·  SUBIR TU GALERÍA", 12, YELLOW, true))
        percent = text("0%", 52, WHITE, true)
        transfer.addView(percent, margin(14, 0))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progressTintList = ColorStateList.valueOf(YELLOW); progressBackgroundTintList = ColorStateList.valueOf(Color.parseColor("#354256")) }
        transfer.addView(progress, LinearLayout.LayoutParams(-1, dp(8)))
        counts = text("0 nuevas  ·  0 ya estaban  ·  0 errores", 15, WHITE)
        transfer.addView(counts, margin(16, 8))
        status = text("", 15, MUTED); transfer.addView(status)
        current = text("", 13, MUTED); transfer.addView(current, margin(8, 4))
        primary = button("Subir mis fotos", true) {
            val stats = store.stats()
            when { stats.enabled -> TransferScheduler.pause(this)
                stats.pending > 0 -> requestStart()
                else -> beginNew() }
            refresh()
        }
        transfer.addView(primary, margin(12, 0))
        fresh = button("Volver a revisar toda la galería") {
            if (store.stats().pending > 0) AlertDialog.Builder(this).setTitle("¿Preparar otra importación?")
                .setMessage("Se sustituirá la lista pendiente y su informe. Las fotos que ya llegaron a la MiniTV se conservarán y se detectarán como existentes.")
                .setPositiveButton("Preparar") { _, _ -> beginNew() }.setNegativeButton("Cancelar", null).show()
            else beginNew()
        }
        transfer.addView(fresh)
        transfer.addView(button("Guardar informe CSV") { report.launch("MiniTV-fotos.csv") })

        val library = card(page)
        library.addView(text("TÚ ELIGES EL ACCESO", 12, YELLOW, true))
        access = text("", 14, MUTED); library.addView(access, margin(10, 8))
        permissions = button("Permisos de fotos") { askPhotos(false) }; library.addView(permissions)
        library.addView(text("Si autorizas la ubicación de las fotos, enviaremos los originales con sus datos GPS. Solo se leen imágenes disponibles en la galería del dispositivo; las fotos que estén únicamente en la nube deben descargarse antes.", 13, MUTED))
        page.addView(text("Últimos resultados", 20, WHITE, true), margin(16, 10))
        recent = text("Aquí verás qué fotos son nuevas y cuáles ya estaban.", 14, MUTED); page.addView(recent)
        page.addView(text("Puedes salir de la app. La notificación permite pausar. Si fuerzas su detención, vuelve a abrirla y pulsa Continuar.", 13, MUTED), margin(24, 0))
    }

    private fun refresh() {
        if (!::address.isInitialized) return
        val stats = store.stats()
        val connection = vault.read()
        address.text = connection?.server ?: "Escanea el QR de Subidas → Fotos"
        access.text = when {
            PhotoMedia.fullAccess(this) -> "Acceso a todas las imágenes del dispositivo."
            PhotoMedia.hasAccess(this) -> "Acceso limitado: solo se subirán las fotos que hayas autorizado. Puedes ampliar la selección."
            else -> "Para empezar, autoriza las fotos que quieres enviar."
        }
        percent.text = "${stats.percent}%"
        progress.progress = stats.percent
        counts.text = "${stats.imported} nuevas  ·  ${stats.duplicates} ya estaban  ·  ${stats.failed} errores"
        status.text = when {
            localBusy || TransferRuntime.indexing.get() -> "Preparando…"
            stats.session.isEmpty() && connection?.valid() == true -> "MiniTV enlazada. Ya puedes subir tus fotos."
            else -> stats.message
        }
        current.text = if (TransferRuntime.current.isNotEmpty()) "${TransferRuntime.current} · ${TransferRuntime.filePercent}% del envío" else if (stats.total > 0) "${stats.done} de ${stats.total} fotos revisadas" else ""
        val busy = localBusy || TransferRuntime.indexing.get()
        primary.text = when { stats.enabled -> "Pausar subida"; stats.pending > 0 -> "Continuar subida"; stats.total > 0 -> "Revisar nuevas fotos"; else -> "Subir mis fotos" }
        primary.isEnabled = !busy && (stats.enabled || (!TransferRuntime.active && connection?.valid() == true))
        fresh.isEnabled = !busy && !stats.enabled && !TransferRuntime.active && connection?.valid() == true
        scan.isEnabled = !busy && !stats.enabled && !TransferRuntime.active
        paste.isEnabled = scan.isEnabled; permissions.isEnabled = scan.isEnabled
        fresh.visibility = if (stats.total > 0) View.VISIBLE else View.GONE
        if (stats.done != previousDone || stats.session != previousSession) {
            previousDone = stats.done; previousSession = stats.session
            recent.text = store.recent().joinToString("\n\n").ifBlank { "Aquí verás qué fotos son nuevas y cuáles ya estaban." }
        }
    }

    private fun acceptLink(value: String) {
        if (store.stats().enabled || TransferRuntime.active || TransferRuntime.indexing.get() || localBusy) { problem("Pausa la subida antes de enlazar una MiniTV."); return }
        try {
            val pairing = Pairing.parse(value)
            AlertDialog.Builder(this).setTitle("Enlazar esta MiniTV")
                .setMessage("Servidor:\n${pairing.server}\n\nComprueba que coincide con tu web. Después podrás iniciar la subida.")
                .setPositiveButton("Enlazar") { _, _ -> claim(pairing) }.setNegativeButton("Cancelar", null).show()
        } catch (e: Exception) { problem(e.message.orEmpty()) }
    }
    private fun claim(pairing: Pairing) {
        localBusy = true; refresh()
        bg.execute {
            try {
                val network = LocalNetwork.wifi(this) ?: throw UserProblem("Conéctate a la misma Wi-Fi que la MiniTV.")
                val connection = PhotoAPI(pairing.server, builder = LocalNetwork.client(network)).claim(pairing.code, vault.clientId(), "${Build.MANUFACTURER} ${Build.MODEL}", StopSignal())
                vault.save(connection)
                runOnUiThread { localBusy = false; refresh() }
            } catch (e: Exception) { runOnUiThread { localBusy = false; refresh(); problem(e.message ?: "No se puede conectar con la MiniTV.") } }
        }
    }
    private fun askPhotos(start: Boolean) {
        startAfterPermission = start
        val requested = mutableListOf(if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_IMAGES else Manifest.permission.READ_EXTERNAL_STORAGE)
        if (Build.VERSION.SDK_INT >= 34) requested.add(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
        requested.add(Manifest.permission.ACCESS_MEDIA_LOCATION)
        photosPermission.launch(requested.toTypedArray())
    }
    private fun beginNew() { if (PhotoMedia.hasAccess(this)) prepareNew() else askPhotos(true) }
    private fun prepareNew() {
        val connection = vault.read()
        if (connection == null || !connection.valid()) { problem("Escanea un QR nuevo antes de continuar."); return }
        if (TransferRuntime.active || !TransferRuntime.indexing.compareAndSet(false, true)) return
        localBusy = true; refresh()
        bg.execute {
            try {
                PhotoMedia.snapshot(applicationContext, store, connection.server)
                runOnUiThread {
                    TransferRuntime.indexing.set(false); localBusy = false; refresh()
                    if (store.stats().total == 0) problem("No se han encontrado imágenes con el permiso actual.") else requestStart()
                }
            } catch (e: Exception) { TransferRuntime.indexing.set(false); runOnUiThread { localBusy = false; refresh(); problem(e.message.orEmpty()) } }
        }
    }
    private fun requestStart() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            notificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        else startTransfer()
    }
    private fun startTransfer() {
        try {
            val connection = vault.read() ?: throw UserProblem("Escanea primero el QR de tu MiniTV.")
            if (!connection.valid()) throw UserProblem("El enlace ha caducado. Escanea otro QR.")
            if (store.stats().server != connection.server) throw UserProblem("La lista pendiente pertenece a otra MiniTV. Usa «Volver a revisar toda la galería» para preparar una lista para este servidor.")
            if (!PhotoMedia.hasAccess(this)) { askPhotos(false); return }
            TransferScheduler.start(this); refresh()
        } catch (e: Exception) { problem(e.message.orEmpty()); refresh() }
    }

    private fun problem(message: String) { if (!isFinishing && !isDestroyed) AlertDialog.Builder(this).setTitle("MiniTV Fotos").setMessage(message).setPositiveButton("Entendido", null).show() }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun margin(top: Int, bottom: Int) = LinearLayout.LayoutParams(-1, -2).apply { setMargins(0, dp(top), 0, dp(bottom)) }
    private fun text(value: String, size: Int, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = value; textSize = size.toFloat(); setTextColor(color); setLineSpacing(dp(3).toFloat(), 1f)
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }
    private fun card(page: LinearLayout) = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(20), dp(20), dp(16))
        background = GradientDrawable().apply { setColor(PANEL); cornerRadius = dp(22).toFloat(); setStroke(dp(1), Color.parseColor("#2B3748")) }
        page.addView(this, margin(0, 16))
    }
    private fun button(value: String, accent: Boolean = false, action: () -> Unit) = Button(this).apply {
        text = value; isAllCaps = false; textSize = 15f; minHeight = dp(52); gravity = Gravity.CENTER
        setTextColor(if (accent) NAVY else YELLOW)
        backgroundTintList = ColorStateList.valueOf(if (accent) YELLOW else Color.parseColor("#283548"))
        setOnClickListener { action() }
    }
    companion object {
        private val NAVY = Color.parseColor("#101827")
        private val PANEL = Color.parseColor("#1A2536")
        private val YELLOW = Color.parseColor("#F7D657")
        private val WHITE = Color.parseColor("#F4F6FA")
        private val MUTED = Color.parseColor("#B7C2D3")
    }
}
