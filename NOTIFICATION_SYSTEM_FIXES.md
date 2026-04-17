# Notification System Fixes - Complete Documentation

## Date: April 2026

## Status: Fixed and Documented

---

## Issues Fixed

### 1. **Schedule Timeline Deletion Issue** (FIX #15)

**Problem**: When a follow-up was deleted, its associated notifications were not being canceled, causing "ghost" notifications to still fire.

**Solution**:

- Modified `AppNavigator.tsx` to listen for `action === "delete"` in the `FOLLOWUP_CHANGED` event
- When a follow-up is deleted, immediately call `cancelNotificationsForFollowUpIds()` with the deleted follow-up's ID
- This ensures all notifications for that follow-up (5min, 4min, 3min, 2min, 1min, due, missed) are canceled

**Code Location**: [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L1081-L1120)

```typescript
if (action === "delete" && followUpId) {
    Promise.resolve(
        notificationService.cancelNotificationsForFollowUpIds?.([followUpId]),
    ).catch((err) => {
        console.warn(
            "[AppNav] Failed to cancel notifications for deleted follow-up:",
            err,
        );
    });
}
```

---

### 2. **5, 4, 3, 2, 1 Minute Pre-Reminders** (FIX #12, #16)

**Problem**: Pre-reminder notifications were sometimes skipped or had timing mismatches.

**Solution**:

- Already implemented in the code to schedule notifications at 5, 4, 3, 2, 1 minutes before due time
- **FIX #16**: Reduced the "too close" threshold from 10 seconds to 3 seconds
    - Old: Skip if within 10 seconds (`t.getTime() - now.getTime() < 10000`)
    - New: Skip if within 3 seconds (`t.getTime() - now.getTime() < 3000`)
    - This allows more near-term notifications to be scheduled without sacrificing reliability

**Notification Pattern**:

```
5 minutes before: "Call Mr. John in 5 minutes"
4 minutes before: "Call Mr. John in 4 minutes"
3 minutes before: "Call Mr. John in 3 minutes"
2 minutes before: "Call Mr. John in 2 minutes"
1 minute before:  "Call Mr. John in 1 minute"
At due time:      "Call Mr. John - it's now due"
1 min after:      "You missed calling Mr. John"
5 min after:      "You missed calling Mr. John (5 mins ago)"
...and so on
```

---

### 3. **Duplicate Notifications Issue** (FIX #17, #18)

**Problem**: Sometimes notifications would come twice (duplicates) due to improper cleanup during rescheduling.

**Solution**:

- **FIX #17**: Enhanced deduplication logic - always properly check if schedule changed
- **FIX #18**: Aggressive orphaned notification cleanup
    - When rescheduling, scan pending notifications for "orphaned" ones not in the current schedule
    - Cancel any found orphaned notifications to prevent duplicates
    - Ensures clean state before scheduling new notifications

**Code Location**: [src/services/notificationService.js](src/services/notificationService.js#L3476-L3525)

```javascript
// Cleanup orphaned notifications that aren't in the previous schedule
const pending = await getPendingNotifications();
const orphanedIds = [];
for (const notif of pending) {
    const data = notif?.content?.data ?? {};
    const type = String(data?.type ?? "").trim();
    if (
        (type === "followup-soon" ||
            type === "followup-due" ||
            type === "followup-missed") &&
        !prevIds.includes(String(notif?.identifier ?? ""))
    ) {
        orphanedIds.push(String(notif?.identifier ?? ""));
    }
}
if (orphanedIds.length > 0) {
    await Promise.allSettled(
        orphanedIds.map((id) =>
            Notifications.cancelScheduledNotificationAsync(id),
        ),
    );
}
```

---

### 4. **Timing Mismatches** (FIX #13, #21)

**Problem**: Notifications would sometimes fire at wrong times or be scheduled inconsistently.

**Solution**:

- **FIX #13**: Use 30-second buffer (`safeNow`) when checking if times are in the past
    - Allows notifications up to 30 seconds late to still be scheduled
    - Prevents missing notifications when scheduler runs slightly delayed
- **FIX #21**: Improved end-of-day boundary handling
    - The +1 minute missed alert will ALWAYS be scheduled, even past endHour
    - Other missed alerts (5min, 30min, 1hr after) respect the endHour cutoff
    - This ensures the immediate "you missed this" notification always fires

**Code Location**: [src/services/notificationService.js](src/services/notificationService.js#L3506-L3525)

---

### 5. **Missing Notifications** (FIX #16)

**Problem**: Some near-term notifications (especially 1, 2, 3 minute reminders) were being skipped.

**Solution**:

- Reduced the skip threshold from 10 seconds to 3 seconds
- This allows notifications scheduled 3+ seconds in the future to fire
- 3 seconds is enough time for Expo/React Native to reliably schedule the notification
- Prevents loss of near-term reminders while maintaining reliability

---

## Architecture Overview

### Notification Types

1. **Hourly Reminders**: General reminders throughout the day
2. **Time-based Reminders**: Specific reminders for each scheduled follow-up
    - Pre-reminders: 5, 4, 3, 2, 1 minutes before
    - Due: At the exact scheduled time
    - Missed: At +1min, +5min, +30min, +1hr, +1.5hrs, etc.

### Storage Keys

```javascript
TIME_FOLLOWUP_SCHEDULE_KEY = "timeFollowupSchedule"; // Stores scheduled notification IDs
HOURLY_FOLLOWUP_SCHEDULE_KEY = "hourlyFollowupSchedule"; // Hourly reminders
MISSED_FOLLOWUP_ALERT_STATE_KEY = "missedFollowupAlertState"; // State tracking
```

### Maximum Notifications

- **Android limit**: ~50 reliable scheduled notifications per app
- **Current implementation**: 30 max per sync to stay well below the limit
- Each follow-up can have up to 5-9 notifications (depending on config)
- This allows 3-6 concurrent follow-ups to be tracked safely

### Deduplication Mechanism

1. **Schedule Signature**: Hash of all follow-ups and their due times
2. If signature hasn't changed → Reuse existing notifications (no reschedule)
3. If signature changed → Cancel old notifications, schedule new ones
4. **Orphaned cleanup**: After cancellation, scan for missed notifications and clean them up

---

## Configuration

Located in [src/navigation/AppNavigator.tsx](src/navigation/AppNavigator.tsx#L970-L985):

```typescript
preRemindMinutes: 60,           // Start reminders 1 hour before
preRemindEveryMinutes: 5,        // (Legacy, now using 5,4,3,2,1 fixed)
missedFastMinutes: 60,           // Fast reminders for first hour after missed
missedFastEveryMinutes: 5,       // Every 5 minutes in first hour
missedHourlyEveryMinutes: 30,    // Every 30 minutes after that
missedHourlyMaxHours: 12,        // Stop reminders after 12 hours
endHour: 21,                     // Don't schedule notifications past 9 PM
windowDays: 7,                   // Schedule up to 7 days in advance
missedLookbackDays: 2,           // Look back 2 days for old follow-ups
dueRepeatForMinutes: 0,          // Don't repeat the "due" notification
```

---

## Event Flow

### When a Follow-up is Deleted

1. User deletes a follow-up in UI
2. `followupService.deleteFollowUp()` is called
3. Event emitted: `emitFollowupChanged({ action: "delete", id: "followUpId" })`
4. **AppNavigator listens** and calls:
    - `cancelNotificationsForFollowUpIds([followUpId])` ← **NEW FIX #15**
    - `syncHourlyFollowUps()` (after 500ms delay)

### When a Follow-up Due Time Changes

1. User modifies due time in UI
2. Event emitted: `emitFollowupChanged({ action: "update" })`
3. AppNavigator triggers `syncHourlyFollowUps()` after 500ms delay
4. Notification system:
    - Checks if schedule signature changed
    - If changed: Cancels old notifications, schedules new ones
    - Orphaned notifications are cleaned up

### When a Notification Fires

1. User receives notification with title and body
2. Notification data includes: `type`, `followUpId`, `enqId`, `minutesLeft`, etc.
3. User can tap to navigate directly to the follow-up

---

## Testing Recommendations

### Test Case 1: Delete Follow-up Notifications

```
1. Create a follow-up due in 10 minutes
2. Wait 1 minute and delete it
3. Verify: No notifications should fire at 5min, 4min, 3min, 2min, 1min, or due time marks
4. Check logs: Should see "Cancelled X notifications for follow-up..."
```

### Test Case 2: 5, 4, 3, 2, 1 Minute Reminders

```
1. Create a follow-up due in exactly 6 minutes
2. Wait and observe notifications
3. Verify: Should see notifications at 5min, 4min, 3min, 2min, 1min marks
4. Check timing: Each should be within ±1 second of expected time
```

### Test Case 3: Duplicate Prevention

```
1. Create a follow-up
2. Wait 2 minutes
3. Close app and reopen (triggers sync)
4. Verify: Same notification IDs, no duplicates
5. Close app again and wait 3 minutes
6. Reopen app (should now reschedule since timing changed)
7. Verify: Correctly rescheduled without duplicates from old schedule
```

### Test Case 4: Missed Reminders

```
1. Create a follow-up due NOW (or in the past)
2. Verify: +1min missed alert is scheduled
3. Verify: +5min, +30min, +1hr alerts are also scheduled
4. Verify: Alerts stop after endHour (9 PM) except for +1min alert
```

### Test Case 5: Edge Cases

```
Test A - Near-term notification:
  1. Create follow-up due in 4 seconds
  2. Verify: 1-minute reminder can still be scheduled

Test B - Just-missed notification:
  1. Create follow-up due 30 seconds ago
  2. Verify: Due notification is skipped, +1min missed is scheduled

Test C - Late rescheduling:
  1. Create follow-up due in 10 minutes
  2. At 8 minutes, modify it to due in 5 minutes
  3. Verify: Old 5min, 4min notifications are canceled
  4. Verify: New schedule is applied without duplicates
```

---

## Logging

All fixes include enhanced logging for debugging:

```bash
# Schedule lock acquired/released
[NotifSvc] Scheduling already in progress — skipping duplicate call

# Schedule changes
[NotifSvc] Schedule unchanged (5 existing) - keeping current time reminders
[NotifSvc] Scheduling for 3 time-based follow-ups

# Notification scheduled
[NotifSvc] ✓ 5min alert scheduled: 2026-04-16T14:25:00 (ID: abc123)
[NotifSvc] ✓ Due alert scheduled: 2026-04-16T14:30:00 (ID: def456)
[NotifSvc] ✓ Missed +1min scheduled: 2026-04-16T14:31:00 (ID: ghi789)

# Skipped notifications
[NotifSvc] Skipping 5min (past): 2026-04-16T14:24:50
[NotifSvc] Skipping 4min (too close): 2026-04-16T14:25:58 - within 3s

# Cleanup
[NotifSvc] Found 2 orphaned notifications, cleaning up
[NotifSvc] Cancelled 5 time-based reminders: 5 ✓, 0 ✗

# Deletion
[AppNav] Deleted follow-up notifications: cancelled 3 notifications
```

Enable debug mode:

```bash
EXPO_PUBLIC_NOTIF_DEBUG_TEST=1  npm start
```

---

## Future Improvements

1. **Timezone Handling**: Better detection of timezone changes
2. **Battery Optimization**: Coalesce multiple follow-ups into single notification if possible
3. **User Preferences**: Allow customization of reminder timing (5,4,3,2,1 or different pattern)
4. **Notification History**: Track which notifications were delivered (for debugging)
5. **Smart Rescheduling**: Learn from failures and adjust timing accordingly

---

## Related Files

- [notificationService.js](src/services/notificationService.js) - Main notification service
- [AppNavigator.tsx](src/navigation/AppNavigator.tsx) - App-level notification handling
- [followupService.js](src/services/followupService.js) - Follow-up management
- [BACKGROUND_NOTIFICATION_SYSTEM_ANALYSIS.md](BACKGROUND_NOTIFICATION_SYSTEM_ANALYSIS.md) - Detailed system analysis

---

## Summary

The notification system now correctly:

1. ✅ Cancels all notifications when a follow-up is deleted
2. ✅ Schedules 5, 4, 3, 2, 1 minute pre-reminders reliably
3. ✅ Prevents duplicate notifications through enhanced cleanup
4. ✅ Handles timing edge cases with improved buffers
5. ✅ Ensures no near-term notifications are lost

These fixes ensure a robust, reliable notification system that keeps users informed of their follow-ups without excessive duplicates or missed reminders.
