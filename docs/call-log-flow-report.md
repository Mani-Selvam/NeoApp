# Call Log Flow Report (Current)

Date: 2026-04-01

## What this feature is used for

- Track phone-call activity against CRM **Enquiries** (who called / who we called / when / duration / result).
- Auto-update enquiry fields like `lastContactedAt`, `callCount`, and sometimes set enquiry status to `Contacted`.
- Show team activity and a quick dashboard-style summary (Today / Week).
- Keep privacy: only numbers that match an enquiry are saved; personal calls are ignored.

## Current runtime configuration (dev)

- Mobile API base URL comes from `.env` → `EXPO_PUBLIC_API_URL`.
  - Example in this repo: `EXPO_PUBLIC_API_URL=http://192.168.1.33:5000/api`
  - The app uses `src/services/apiConfig.js` to normalize the URL and derive `SOCKET_URL`.

## Main components

### Mobile (Expo / React Native)

- Call monitoring + auto logging: `src/services/CallMonitorService.js`
- Call-log API client: `src/services/callLogService.js`
- Call log UI + manual sync: `src/screens/CallLogScreen.js`
- Real-time updates: `src/services/socketService.js`
- Starts/stops monitoring on login/logout: `src/navigation/AppNavigator.tsx`

### Server (Node / Express / MongoDB)

- Routes: `server/routes/callLogRoutes.js` mounted at `/api/calllogs`
- Models:
  - `server/models/CallLog.js` (saved call history)
  - `server/models/CallSession.js` (live/active call UI state + events)
- Real-time (Socket.IO):
  - Server emits to rooms like `user:<userId>` (see `server/server.js` + `server/routes/callLogRoutes.js`)
  - Mobile listens and re-emits via `DeviceEventEmitter` (`src/services/socketService.js`)

## Permissions / build mode behavior (important)

- `app.config.js` defaults to **Play Store safe mode** (`EXPO_PUBLIC_PLAY_STORE_SAFE_MODE` defaults to `true`).
  - When safe mode is `true`, Android call-log permissions like `READ_CALL_LOG` are **not** requested in the manifest.
  - When safe mode is `false` (custom dev client / EAS build), extra permissions are enabled and device call-log sync works.
- `src/services/CallMonitorService.js` also checks:
  - Android-only restrictions
  - Expo Go vs production build (Expo Go cannot use native call-log modules)

## Duplicate protection (current)

- Primary de-dupe key is **device call log id**:
  - Mobile sends `deviceCallId` to `POST /api/calllogs`.
  - Server stores it in `CallLog.id` and de-dupes by `(userId, id)`.
  - MongoDB has a **partial unique index** on `(userId, id)` so the same device call can’t be inserted twice.
- Fallback de-dupe still exists:
  - Server also checks a ±2 minute window for near-duplicates when `deviceCallId` is missing.

## Current end-to-end flows

### Flow A — View call logs (UI)

1. `CallLogScreen` calls:
   - `GET /api/calllogs` (list, filters: `type`, `filter`, `search`, `enquiryId`)
   - `GET /api/calllogs/stats` (summary counts + staff activity)
2. UI listens for `CALL_LOG_CREATED` events and refreshes the list.
   - Events come from:
     - local save (`DeviceEventEmitter.emit("CALL_LOG_CREATED", saved)`)
     - server socket push (`socket.on("CALL_LOG_CREATED" | "CALL_LOG_REFRESH")`)

### Flow B — Auto-log a call (background / incoming / missed cases)

1. `CallMonitorService` listens to native call-state events (Android).
2. On call end, it emits a JS event:
   - `DeviceEventEmitter.emit("CALL_ENDED", { phoneNumber, callType, duration, note, callTime, deviceCallId })`
3. If **no screen claims** the call end event (`global.__callClaimedByScreen` is not set), it auto-saves:
   - `POST /api/calllogs` with detected call data (includes `deviceCallId` when available).
4. Server **ignores** the call log if it can’t map the number to an enquiry (`202` with `{ ignored: true, reason: "NO_ENQUIRY_MATCH" }`).

### Flow C — Call initiated from UI (claimed by screen, then saved)

1. `CallLogScreen` initiates a call (`tel:` / `react-native-immediate-phone-call`) and stores `pendingCall`.
2. When `CALL_ENDED` arrives:
   - the screen checks whether the ended number matches the pending call
   - it sets `global.__callClaimedByScreen = true` so `CallMonitorService` won’t double-log
3. The screen tries to enrich the record using device call logs when available:
   - `getLatestDeviceCallLogForNumber(...)`
4. The screen saves:
   - `POST /api/calllogs` (linked to enquiry when possible, includes `deviceCallId`)

### Flow D — Manual device call-log sync (batch import)

1. `CallLogScreen` “Sync logs” uses `react-native-call-log` to load recent device logs (last ~7 days).
2. Mobile sends them in one request:
   - `POST /api/calllogs/sync-batch` with `{ logs: [...] }`
3. Server filters aggressively:
   - skips logs that don’t match an enquiry number
   - de-dupes using device log id (`CallLog.id`) and the unique index on `(userId, id)`
4. Server emits one real-time refresh event:
   - `CALL_LOG_REFRESH` (to avoid flooding the UI with individual events)

### Flow E — External provider webhook (Twilio/Evolution/etc.)

- `POST /api/calllogs/webhook` is unauthenticated and intended for external call platforms.
- It saves only if the tenant can be determined safely via an enquiry → `userId`.
- On save, it emits `CALL_LOG_CREATED` to the owner/staff room.

## Storage rules & “why it behaves like this”

- **Privacy / noise reduction:** server saves call logs only when the phone number matches an `Enquiry`.
  - This prevents personal calls from being synced into the CRM.
- **Deduplication:** server de-dupes primarily by `deviceCallId` (saved as `CallLog.id`), and falls back to a ±2 minute window when no device id is provided.
- **Tenant isolation (Admin vs Staff):**
  - If the user is `Staff`, server derives `ownerId = parentUserId` and typically keeps `staffId = staff userId`.
  - Socket emits to both `user:<ownerId>` and `user:<staffId>` so both views refresh.

## Quick “purpose mapping” (why each endpoint exists)

- `GET /api/calllogs` → list/search/filter/history modal
- `GET /api/calllogs/stats` → top summary cards + staff activity counts
- `POST /api/calllogs` → create one call log (from screen save or auto-log)
- `POST /api/calllogs/sync-batch` → batch import device logs (enquiry-only)
- `GET /api/calllogs/identify/:phoneNumber` → instant lookup: does this number match an enquiry?
- `POST /api/calllogs/session` + `PATCH /api/calllogs/session/:id/control` + `POST /api/calllogs/session/:id/end`
  → “live call session” state (mute/speaker/hold/keypad history) for the in-call UI

## Production preflight (2 checks)

### 1) Android permissions + Play Store policy

- Device call-log features require an Android build that includes sensitive permissions:
  - `READ_CALL_LOG`, `READ_PHONE_STATE` (and `READ_CONTACTS` only if you truly need contact-name lookup)
- In this repo, those permissions are enabled only when `EXPO_PUBLIC_PLAY_STORE_SAFE_MODE=false` in `app.config.js`.
- Important: Google Play has strict policies for call log / phone permissions. Ensure your release channel and Play listing comply before enabling these in a public Play Store build.

### 2) Background reliability testing (OEM)

- Call monitoring + sync reliability varies by OEM battery/background restrictions.
- Test on at least: Xiaomi, Oppo, Vivo, Realme, Samsung.
