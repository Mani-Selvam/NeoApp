package com.neoapp.smsgateway

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.telephony.SmsManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class SmsGatewayService : Service() {

    private var server: OtpHttpServer? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopGateway()
            else -> startGateway()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopGateway()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun startGateway() {
        startForeground(NOTIFICATION_ID, createNotification())

        if (server != null) return

        server = OtpHttpServer(
            port = PORT,
            sendSmsAction = { phone, message -> sendSms(phone, message) },
            healthAction = {
                val perm = hasSmsPermission()
                "{\"status\":\"ok\",\"smsPermission\":$perm}"
            }
        )

        try {
            server?.start()
            Log.i(TAG, "SMS Gateway server started on port $PORT")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start server", e)
        }
    }

    private fun stopGateway() {
        server?.stop()
        server = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        Log.i(TAG, "SMS Gateway server stopped")
    }

    private fun sendSms(phone: String, message: String): Boolean {
        if (!hasSmsPermission()) {
            Log.e(TAG, "SEND_SMS permission missing. Cannot send SMS.")
            return false
        }
        return try {
            val smsManager = SmsManager.getDefault()
            val parts = smsManager.divideMessage(message)
            smsManager.sendMultipartTextMessage(phone, null, parts, null, null)
            Log.i(TAG, "SMS sent to $phone. Message=$message")
            true
        } catch (e: Exception) {
            Log.e(TAG, "SMS send failed for $phone", e)
            false
        }
    }

    private fun hasSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun createNotification(): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SMS Gateway",
                NotificationManager.IMPORTANCE_LOW
            )
            manager.createNotificationChannel(channel)
        }

        val openIntent = PendingIntent.getActivity(
            this,
            10,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("NeoApp SMS Gateway")
            .setContentText("Listening on port $PORT")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setContentIntent(openIntent)
            .build()
    }

    companion object {
        const val ACTION_START = "com.neoapp.smsgateway.action.START"
        const val ACTION_STOP = "com.neoapp.smsgateway.action.STOP"

        private const val TAG = "SmsGatewayService"
        private const val CHANNEL_ID = "sms_gateway_channel"
        private const val NOTIFICATION_ID = 8080
        private const val PORT = 8080
    }
}
