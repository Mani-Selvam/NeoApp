package com.neoapp.smsgateway

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private val smsPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val statusText = if (granted) {
            startGatewayService()
            "SMS permission granted. Gateway server is running on port 8080."
        } else {
            "SMS permission denied. Please allow SMS permission to send OTP."
        }
        updateStatus(statusText)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val textView = TextView(this).apply {
            textSize = 16f
            setPadding(40, 80, 40, 40)
            text = "Checking SMS permission..."
        }
        setContentView(textView)

        if (hasSmsPermission()) {
            startGatewayService()
            updateStatus("Gateway server is running on port 8080.")
        } else {
            smsPermissionLauncher.launch(Manifest.permission.SEND_SMS)
        }
    }

    private fun hasSmsPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun startGatewayService() {
        val intent = Intent(this, SmsGatewayService::class.java).apply {
            action = SmsGatewayService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, intent)
        } else {
            startService(intent)
        }
    }

    private fun updateStatus(message: String) {
        (findViewById<TextView>(android.R.id.content).rootView as? TextView)?.text = message
    }
}
