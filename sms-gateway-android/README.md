# NeoApp SIM SMS Gateway (Android)

This Android app runs an HTTP server on the phone and sends OTP SMS using the phone SIM card.

## Features

- Foreground background service listening on `http://<phone-ip>:8080`
- API endpoint: `POST /send-otp`
- JSON request body: `{ "phone": "...", "message": "..." }`
- Sends SMS through Android `SmsManager`
- JSON responses:
  - `{ "status": "sent" }`
  - `{ "status": "failed" }`

## Permissions

- `SEND_SMS`
- `INTERNET`
- `FOREGROUND_SERVICE`
- `RECEIVE_BOOT_COMPLETED` (optional auto-start)

## Run

1. Open `sms-gateway-android` in Android Studio.
2. Build and install on an Android phone with SIM.
3. Open app once and grant SMS permission.
4. Keep app running (foreground service notification stays active).
5. Ensure backend can reach phone IP over network.

## API Example

```http
POST /send-otp
Content-Type: application/json

{
  "phone": "+1234567890",
  "message": "Your OTP is 482193"
}
```

Response:

```json
{ "status": "sent" }
```
