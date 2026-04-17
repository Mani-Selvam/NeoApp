# Google Play Submission Checklist

Last updated: March 24, 2026

## Before Upload

- Host [privacy-policy.md](/e:/NeoApp/docs/privacy-policy.md) at a public `https://` URL.
- Replace the placeholder privacy policy URL in environment config:
  `EXPO_PUBLIC_PRIVACY_POLICY_URL=https://yourdomain.com/privacy-policy`
- Set the account deletion/support URL in environment config:
  `EXPO_PUBLIC_ACCOUNT_DELETION_URL=https://yourdomain.com/account-deletion`
- Replace placeholder contact details inside the privacy policy with real company details.
- Prepare a 512x512 Play Store icon.
- Prepare a 1024x500 feature graphic.
- Prepare phone screenshots for key flows:
  - Home
  - Enquiry
  - Follow-up
  - Team Chat
  - Call Log

## Play Console Forms

- Data safety:
  - Account info: collected
  - CRM/enquiry/follow-up records: collected
  - Diagnostic/device data: collected
  - Notifications: used for reminders
  - Phone call intent: used only when user taps call
- Content rating:
  - Business / productivity app
  - No gambling
  - No sexual content
  - No user-generated public social feed
- App access:
  - Provide demo login or test credentials if Play review needs app access

## Android Release Notes

- Upload format: `.aab`
- Release version baseline:
  - `versionCode=2`
  - `versionName=1.0.1`
- Native build flags:
  - `targetSdkVersion=36`
  - `minSdkVersion=24` (Android 7.0+ technically; app requirement target remains Android 8+ for testing)
  - `newArchEnabled=true`
- Current manifest keeps only these active Android permissions:
  - `CALL_PHONE`
  - `ACCESS_FINE_LOCATION`
  - `ACCESS_COARSE_LOCATION`
  - `INTERNET`
  - `MODIFY_AUDIO_SETTINGS`
  - `VIBRATE`

## Important Review Risk Notes

- The codebase still contains optional call-monitoring and call-log related logic.
- The Play-safe app configuration blocks restricted call-log permissions from the published Android manifest.
- If you plan to publish the advanced call-log monitoring feature later, review Google Play restricted permissions policy before enabling it.

## Recommended Upload Flow

1. Build release AAB.
2. Upload to Internal testing first.
3. Verify login, calls, follow-up reminders, chat, notifications, and media upload on Android 8, 10, 13, and 14+ devices.
4. Complete Data safety and App content forms.
5. Submit for closed testing or production.

## Local Release Build

```powershell
cd E:\NeoApp\android
$env:GRADLE_USER_HOME='e:\NeoApp\.gradle-local'
$env:NODE_ENV='production'
cmd /c gradlew.bat bundleRelease
```
