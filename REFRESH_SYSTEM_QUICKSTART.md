# Quick Start: Manual + Auto Refresh Guide

**TL;DR** - Implement 2 custom hooks + 1 server middleware to get manual & auto-refresh working everywhere.

---

## 🚀 What's New?

### Two Custom Hooks Created:

1. **`useAutoRefresh`** - For simple, non-paginated screens (HomeScreen, Dashboard, Settings)
2. **`useAutoRefreshList`** - For paginated lists with infinite scroll (EnquiryScreen, FollowUpScreen)

### One Server Middleware Created:

**`apiCacheHeaders`** - Adds proper HTTP cache headers to API responses

---

## 📋 Quick Implementation (5 minutes)

### Step 1: Add to HomeScreen

**Current Implementation (What You Have):**

```javascript
const [refreshing, setRefreshing] = useState(false);
// manual code for fetching...
```

**New Implementation (10 lines):**

```javascript
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import * as dashboardService from "../services/dashboardService";

const { data, loading, refreshing, onRefresh } = useAutoRefresh({
    queryKey: ["dashboard", userId],
    queryFn: async ({ signal }) =>
        dashboardService.getDashboardData(userId, { signal }),
    ttlMs: 60000, // Cache 1 minute
    autoRefreshIntervalMs: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    tags: ["dashboard"],
    staleOnFocus: true, // Fresh data when returning
});
```

### Step 2: Update RefreshControl

```javascript
<ScrollView
    refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
    }>
    {loading ? <Skeleton /> : <Content data={data} />}
</ScrollView>
```

### Step 3: Add to EnquiryScreen

```javascript
import { useAutoRefreshList } from "../hooks/useAutoRefreshList";

const {
    items: enquiries,
    loading,
    refreshing,
    onRefresh,
    onLoadMore,
    loadingMore,
    hasMore,
} = useAutoRefreshList({
    queryKey: ["enquiries", status],
    queryFn: async ({ page, limit, signal }) =>
        enquiryService.getAllEnquiries(page, limit, "", status, "", "", {
            signal,
        }),
    ttlMs: 60000,
    autoRefreshIntervalMs: 5 * 60 * 1000,
    tags: ["enquiries"],
});
```

### Step 4: Update Server (Optional but Recommended)

In `server.js`:

```javascript
const { apiCacheHeaders } = require("./middleware/cacheHeaders");

app.use("/api/enquiries", apiCacheHeaders({ maxAge: 60 }), enquiryRoutes);
app.use("/api/followups", apiCacheHeaders({ maxAge: 60 }), followupRoutes);
app.use("/api/dashboard", apiCacheHeaders({ maxAge: 120 }), dashboardRoutes);
```

---

## ✅ Features You Get

| Feature                   | Manual | Auto |
| ------------------------- | ------ | ---- |
| Pull-to-refresh           | ✅     | ✅   |
| Auto-refresh at intervals | ❌     | ✅   |
| Smart caching             | ✅     | ✅   |
| Stale-while-revalidate    | ✅     | ✅   |
| Background app detection  | ✅     | ✅   |
| Request deduplication     | ✅     | ✅   |
| Infinite scroll (lists)   | ✅     | ✅   |
| Error handling            | ✅     | ✅   |

---

## 🔧 Configuration

### Default Settings

```javascript
// HomeScreen - Auto-refresh every 5 minutes
useAutoRefresh({
    autoRefreshIntervalMs: 5 * 60 * 1000, // 5 minutes
    ttlMs: 60000, // Cache 1 minute
    staleOnFocus: true, // Fresh data on focus
    staleOnAppStateChange: "active", // Fresh data on app foreground
});

// Lists - Auto-refresh every 5 minutes
useAutoRefreshList({
    autoRefreshIntervalMs: 5 * 60 * 1000, // 5 minutes
    ttlMs: 60000, // Cache 1 minute
    staleOnFocus: false, // Keep loading page 1 on focus
    staleOnAppStateChange: "active",
});
```

### Customize via Environment Variables

In `.env`:

```env
# Cache TTL (milliseconds)
EXPO_PUBLIC_CACHE_TTL_DASHBOARD_MS=60000
EXPO_PUBLIC_CACHE_TTL_ENQUIRIES_MS=60000
EXPO_PUBLIC_CACHE_TTL_FOLLOWUPS_MS=60000

# Auto-refresh intervals (0 = disabled)
EXPO_PUBLIC_AUTO_REFRESH_DASHBOARD_MS=300000
EXPO_PUBLIC_AUTO_REFRESH_ENQUIRIES_MS=300000
EXPO_PUBLIC_AUTO_REFRESH_FOLLOWUPS_MS=300000
```

Then use in component:

```javascript
const CACHE_TTL = Number(
    process.env.EXPO_PUBLIC_CACHE_TTL_DASHBOARD_MS || 60000,
);
const AUTO_REFRESH = Number(
    process.env.EXPO_PUBLIC_AUTO_REFRESH_DASHBOARD_MS || 0,
);

useAutoRefresh({
    ttlMs: CACHE_TTL,
    autoRefreshIntervalMs: AUTO_REFRESH,
    // ...
});
```

---

## 🎯 How It Works

### Client Side

```
User pulls to refresh
        ↓
onRefresh() called
        ↓
Cache invalidated (via tags)
        ↓
Data refetched from server
        ↓
Response cached with TTL
        ↓
UI updates
```

### Auto-Refresh

```
Component mounts
        ↓
Initial data fetch (from cache if fresh)
        ↓
Set interval based on autoRefreshIntervalMs
        ↓
Every interval:
  - Check if cache is stale
  - If stale, fetch new data
  - Update cache
  - UI updates (silent)
        ↓
Component unmounts
        ↓
Clear interval + abort requests
```

### App State Detection

```
User leaves app (App State = background)
        ↓
Auto-refresh interval continues but doesn't fetch
        ↓
User returns to app (App State = active)
        ↓
staleOnAppStateChange: "active" invalidates cache
        ↓
Fresh data refetched
        ↓
UI updates
```

---

## 📝 API Usage Examples

### HomeScreen

```javascript
const {
    data: dashboard,
    loading,
    refreshing,
    onRefresh,
} = useAutoRefresh({
    queryKey: ["dashboard"],
    queryFn: async ({ signal }) =>
        dashboardService.getDashboardData({ signal }),
    ttlMs: 60000,
    autoRefreshIntervalMs: 5 * 60 * 1000,
    tags: ["dashboard", "enquiries", "followups"],
    staleOnFocus: true,
});
```

### EnquiryScreen (Paginated)

```javascript
const {
    items: enquiries,
    onRefresh,
    onLoadMore,
    loading,
    refreshing,
    loadingMore,
} = useAutoRefreshList({
    queryKey: ["enquiries", filter],
    queryFn: async ({ page, limit, signal }) =>
        enquiryService.getAllEnquiries(page, limit, "", filter, "", "", {
            signal,
        }),
    ttlMs: 60000,
    autoRefreshIntervalMs: 5 * 60 * 1000,
    tags: ["enquiries"],
    initialLimit: 20,
});
```

### FollowUpScreen (Paginated)

```javascript
const {
    items: followups,
    onRefresh,
    onLoadMore,
    loading,
    refreshing,
    loadingMore,
} = useAutoRefreshList({
    queryKey: ["followups"],
    queryFn: async ({ page, limit, signal }) =>
        followupService.getFollowups(page, limit, { signal }),
    ttlMs: 60000,
    autoRefreshIntervalMs: 5 * 60 * 1000,
    tags: ["followups"],
    initialLimit: 20,
});
```

---

## 🚨 Important Notes

1. **Add `signal` parameter to all API calls** - This allows cancellation of requests

```javascript
// Good ✅
await enquiryService.getAllEnquiries(..., { signal })

// Bad ❌
await enquiryService.getAllEnquiries(...)
```

2. **Invalidate cache when user creates/updates data**

```javascript
import { invalidateCacheTags } from "../services/appCache";

// After creating enquiry
await createEnquiry(data);
await invalidateCacheTags(["enquiries", "dashboard"]);
```

3. **Use `staleOnFocus: false` for lists** - Avoid constant reloading

```javascript
staleOnFocus: false, // ✅ For lists
staleOnFocus: true,  // ✅ For single data (dashboard, profile)
```

4. **Set auto-refresh to 0 to disable**

```javascript
autoRefreshIntervalMs: 0, // ✅ Disabled
autoRefreshIntervalMs: 5 * 60 * 1000, // ✅ 5 minutes
```

---

## 📚 File Locations

- **Client Hooks:** `src/hooks/useAutoRefresh.js`, `src/hooks/useAutoRefreshList.js`
- **Server Middleware:** `server/middleware/cacheHeaders.js`
- **Cache Service:** `src/services/appCache.js` (already exists)
- **Full Guide:** `DATA_REFRESH_GUIDE.md`
- **Implementation Example:** `HOMESCREEN_IMPLEMENTATION_EXAMPLE.js`

---

## 🧪 Testing

### Test Pull-to-Refresh

```javascript
// Add a button to RefreshControl area
<RefreshControl
    refreshing={refreshing}
    onRefresh={async () => {
        console.log("Refreshing...");
        await onRefresh();
        console.log("Refresh complete!");
    }}
/>
```

### Test Auto-Refresh

```javascript
// Monitor console for auto-refresh logs
const { data, onRefresh } = useAutoRefresh({
    queryFn: async ({ signal }) => {
        console.log("Fetching data...");
        const result = await fetchData({ signal });
        console.log("Data fetched:", result);
        return result;
    },
    autoRefreshIntervalMs: 30 * 1000, // 30 seconds for testing
});
```

### Test Cache

```javascript
// Check cached data
import AsyncStorage from "@react-native-async-storage/async-storage";

const keys = await AsyncStorage.getAllKeys();
const cacheKeys = keys.filter((k) => k.startsWith("APP_CACHE:"));
console.log("Cache keys:", cacheKeys);
```

---

## 🎓 Common Issues & Solutions

| Issue               | Solution                                    |
| ------------------- | ------------------------------------------- |
| Data not refreshing | Check `staleOnFocus: true` for dashboards   |
| Too many requests   | Increase `ttlMs` or `autoRefreshIntervalMs` |
| Slow load           | Check network tab, server response time     |
| Cache not clearing  | Use `invalidateCacheTags()` after mutations |
| Duplicate requests  | Check `signal` parameter is passed          |
| High memory usage   | Reduce `limit` or clear old cache entries   |

---

## 🏁 Next Steps

1. ✅ **Hooks Created** - `useAutoRefresh` & `useAutoRefreshList`
2. ✅ **Middleware Created** - `apiCacheHeaders`
3. ⏳ **Update HomeScreen** - Implement `useAutoRefresh`
4. ⏳ **Update EnquiryScreen** - Implement `useAutoRefreshList`
5. ⏳ **Update FollowUpScreen** - Implement `useAutoRefreshList`
6. ⏳ **Update Server** - Add `apiCacheHeaders` middleware
7. ⏳ **Test & Monitor** - Check logs and performance

---

**Done! You now have enterprise-grade refresh + cache system.** 🎉
