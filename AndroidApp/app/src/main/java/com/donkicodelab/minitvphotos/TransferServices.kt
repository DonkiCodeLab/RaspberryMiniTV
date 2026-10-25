package com.donkicodelab.minitvphotos

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

object TransferScheduler {
    const val JOB = 7421
    fun hasScheduledWork(context: Context): Boolean = if (Build.VERSION.SDK_INT >= 34)
        context.getSystemService(JobScheduler::class.java).getPendingJob(JOB) != null
    else LegacyTransferService.scheduled
    fun start(context: Context) {
        val store = TransferStore.get(context)
        val stats = store.stats()
        if (stats.pending <= 0) throw UserProblem("No hay fotos pendientes. Prepara una nueva importación.")
        store.enabled(true, "Esperando Wi-Fi para subir tus fotos…")
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                val network = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
                val job = JobInfo.Builder(JOB, ComponentName(context, TransferJobService::class.java))
                    .setUserInitiated(true).setRequiredNetwork(network).setPersisted(true)
                    .setEstimatedNetworkBytes(JobInfo.NETWORK_BYTES_UNKNOWN.toLong(), stats.remainingBytes.coerceAtLeast(1))
                    .setBackoffCriteria(30_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build()
                if (context.getSystemService(JobScheduler::class.java).schedule(job) != JobScheduler.RESULT_SUCCESS)
                    throw UserProblem("Android no ha podido iniciar la subida. Mantén la app abierta y pulsa Continuar.")
            } else {
                LegacyTransferService.scheduled = true
                context.startForegroundService(Intent(context, LegacyTransferService::class.java))
            }
        } catch (e: Exception) { LegacyTransferService.scheduled = false; store.enabled(false, "No se ha podido iniciar la subida. Pulsa Continuar."); throw e }
    }
    fun pause(context: Context) {
        TransferStore.get(context).enabled(false, "En pausa. El progreso está guardado.")
        TransferRuntime.cancel()
        context.getSystemService(JobScheduler::class.java).cancel(JOB)
        context.stopService(Intent(context, LegacyTransferService::class.java))
        LegacyTransferService.scheduled = false
        context.getSystemService(NotificationManager::class.java).cancel(TransferNotification.ID)
    }
}

class PauseReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { TransferScheduler.pause(context) }
}

object TransferNotification {
    const val ID = 7422
    private const val CHANNEL = "photo-transfer"
    fun build(context: Context): Notification {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Subida de fotos", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val pause = PendingIntent.getBroadcast(context, 0, Intent(context, PauseReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val stats = TransferStore.get(context).stats()
        return Notification.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_upload)
            .setContentTitle("MiniTV Fotos · ${stats.percent}%")
            .setContentText("${stats.imported} nuevas · ${stats.duplicates} ya estaban · ${stats.done}/${stats.total}")
            .setStyle(Notification.BigTextStyle().bigText("${stats.message}\n${stats.imported} nuevas · ${stats.duplicates} ya estaban · ${stats.failed} errores"))
            .setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true).setCategory(Notification.CATEGORY_PROGRESS)
            .setProgress(100, stats.percent, stats.total == 0)
            .addAction(Notification.Action.Builder(null, "Pausar", pause).build()).build()
    }
}

class TransferJobService : JobService() {
    private val handler = Handler(Looper.getMainLooper())
    private var running: StopSignal? = null
    private var lastUpdate = 0L
    override fun onStartJob(params: JobParameters): Boolean {
        if (Build.VERSION.SDK_INT < 34) return false
        if (!TransferStore.get(this).stats().enabled) return false
        setNotification(params, TransferNotification.ID, TransferNotification.build(this), JOB_END_NOTIFICATION_POLICY_REMOVE)
        val stop = StopSignal(); running = stop
        TransferRuntime.run(applicationContext, stop, changed = {
            val now = System.currentTimeMillis()
            if (now - lastUpdate >= 1000) {
                lastUpdate = now
                handler.post { if (running === stop) setNotification(params, TransferNotification.ID, TransferNotification.build(this), JOB_END_NOTIFICATION_POLICY_REMOVE) }
            }
        }, finished = { retry -> handler.post {
            if (running === stop) { running = null; jobFinished(params, retry) }
        } })
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean {
        running?.cancel(); running = null
        return TransferStore.get(this).stats().enabled
    }
    override fun onDestroy() { running?.cancel(); running = null; super.onDestroy() }
}

/** Android 10–13: the user starts a visible foreground service with a persistent notification. */
class LegacyTransferService : Service() {
    companion object { @Volatile var scheduled = false }
    private var running: StopSignal? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var lastUpdate = 0L
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (Build.VERSION.SDK_INT >= 34 || !TransferStore.get(this).stats().enabled) { stopSelf(); return START_NOT_STICKY }
        scheduled = true
        startForeground(TransferNotification.ID, TransferNotification.build(this))
        if (running != null) return START_STICKY
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MiniTVFotos:transfer").apply { acquire(6 * 60 * 60 * 1000L) }
        val stop = StopSignal(); running = stop
        TransferRuntime.run(applicationContext, stop, changed = {
            val now = System.currentTimeMillis()
            if (now - lastUpdate >= 1000) {
                lastUpdate = now
                handler.post { if (running === stop) getSystemService(NotificationManager::class.java).notify(TransferNotification.ID, TransferNotification.build(this)) }
            }
        }, finished = { handler.post { if (running === stop) { running = null; stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() } } })
        return START_STICKY
    }
    override fun onDestroy() {
        scheduled = false
        running?.cancel(); running = null
        wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
        super.onDestroy()
    }
}
