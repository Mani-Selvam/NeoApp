package com.neoapp.smsgateway

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject

class OtpHttpServer(
    port: Int,
    private val sendSmsAction: (phone: String, message: String) -> Boolean,
    private val healthAction: () -> String
) : NanoHTTPD(port) {

    override fun serve(session: IHTTPSession): Response {
        if (session.uri == "/health") {
            if (session.method != Method.GET) {
                return jsonResponse(Status.METHOD_NOT_ALLOWED, "{\"status\":\"failed\",\"error\":\"method_not_allowed\"}")
            }
            return jsonResponse(Status.OK, healthAction())
        }

        if (session.uri != "/send-otp") {
            return jsonResponse(Status.NOT_FOUND, "{\"status\":\"failed\",\"error\":\"not_found\"}")
        }

        if (session.method != Method.POST) {
            return jsonResponse(Status.METHOD_NOT_ALLOWED, "{\"status\":\"failed\",\"error\":\"method_not_allowed\"}")
        }

        return try {
            val files = HashMap<String, String>()
            session.parseBody(files)
            val body = files["postData"].orEmpty()
            val payload = JSONObject(body)

            val phone = payload.optString("phone").trim()
            val message = payload.optString("message").trim()

            if (phone.isBlank() || message.isBlank()) {
                return jsonResponse(Status.BAD_REQUEST, "{\"status\":\"failed\",\"error\":\"phone_and_message_required\"}")
            }

            val sent = sendSmsAction(phone, message)
            if (sent) {
                Log.i(TAG, "Request success for phone=$phone")
                jsonResponse(Status.OK, "{\"status\":\"sent\"}")
            } else {
                Log.e(TAG, "Request failed for phone=$phone")
                jsonResponse(Status.INTERNAL_ERROR, "{\"status\":\"failed\"}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Request parsing/sending failed", e)
            jsonResponse(Status.INTERNAL_ERROR, "{\"status\":\"failed\"}")
        }
    }

    private fun jsonResponse(status: Status, body: String): Response {
        return newFixedLengthResponse(status, "application/json", body)
    }

    companion object {
        private const val TAG = "OtpHttpServer"
    }
}
