## Notification voice audio (production)

Expo TTS (`expo-speech`) cannot speak when the app is background/killed.
For production "voice while closed", use **custom notification sounds**.

Put your recorded audio files in this folder structure and keep filenames stable.
You can record both English + Tamil variants per activity type.

### Folder structure

- `assets/notification_audio/en/phone/`
- `assets/notification_audio/en/whatsapp/`
- `assets/notification_audio/en/email/`
- `assets/notification_audio/en/meeting/`
- `assets/notification_audio/ta/phone/`
- `assets/notification_audio/ta/whatsapp/`
- `assets/notification_audio/ta/email/`
- `assets/notification_audio/ta/meeting/`

### Recommended naming (examples)

Phone:
- `soon_5.wav`, `soon_4.wav`, `soon_3.wav`, `soon_2.wav`, `soon_1.wav`
- `due.wav`
- `missed.wav`

WhatsApp / Email / Meeting:
- `soon_5.wav` ... `soon_1.wav`
- `due.wav`
- `missed.wav`

### IMPORTANT (Android)

Android notification channels require the sound to be a **raw resource**.
That means in a real build you must include the files in the native project
and reference the **resource name** (usually filename without extension).

This repo currently stores audio under `assets/` for convenience; wiring them
into Android/iOS build output depends on whether you use:
- Expo prebuild + EAS build (recommended for production), or
- Bare React Native.

### Phrase scripts (EN/TA)

Use these scripts when recording audio:
- `assets/notification_audio/scripts/en.json`
- `assets/notification_audio/scripts/ta.json`
