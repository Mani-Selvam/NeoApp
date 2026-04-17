# Data Refresh & Cache Management Guide

Complete guide for implementing manual and auto-refresh functionality in your React Native app.

## Table of Contents

1. [Client-Side Hooks](#client-side-hooks)
2. [Server-Side Cache Headers](#server-side-cache-headers)
3. [Screen Implementation Examples](#screen-implementation-examples)
4. [Configuration](#configuration)
5. [Best Practices](#best-practices)

---

## Client-Side Hooks

### 1. `useAutoRefresh` - Simple Data Fetching

For screens that fetch single datasets (non-paginated).

**Features:**

- Manual refresh (pull-to-refresh)
- Auto-refresh at intervals
- Automatic cache management
- Smart background detection
- Request deduplication

**Basic Usage:**

```javascript
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import * as dashboardService from "../services/dashboardService";

export function HomeScreen() {
    const { data, loading, refreshing, onRefresh } = useAutoRefresh({
        queryKey: ["dashboard", userId], // Cache key
        queryFn: async ({ signal }) => {
            return dashboardService.getDashboardData(userId, { signal });
        },
        ttlMs: 60000, // Cache for 1 minute
        autoRefreshIntervalMs: 5 * 60 * 1000, // Auto-refresh every 5 minutes
        tags: ["dashboard"], // For cache invalidation
        staleOnFocus: true, // Refresh when screen is focused
        staleOnAppStateChange: "active", // Refresh when app comes to foreground
    });

    return (
        <ScrollView
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }>
            {loading ? <Skeleton /> : <DashboardContent data={data} />}
        </ScrollView>
    );
}
```

**Advanced Options:**

```javascript
const {
    data, // The fetched data
    loading, // Initial loading state
    error, // Any errors that occurred
    refreshing, // Pull-to-refresh in progress
    onRefresh, // For RefreshControl
    refetch, // Manual refetch function
} = useAutoRefresh({
    queryKey: ["dashboard"],
    queryFn: async ({ signal }) => {
        /* ... */
    },
    ttlMs: 60000, // Cache TTL in milliseconds
    autoRefreshIntervalMs: 0, // 0 = disabled, 5000+ = enabled
    tags: ["dashboard"], // Cache invalidation tags
    enabled: true, // Whether to fetch
    staleOnFocus: true, // Invalidate on screen focus
    staleOnAppStateChange: "active", // Invalidate on app state change
});
```

---

### 2. `useAutoRefreshList` - Paginated Lists

For screens with infinite scroll and pagination.

**Features:**

- Infinite scroll with pagination
- Manual refresh (resets to page 1)
- Auto-refresh (keeps current page)
- Per-page caching
- Smart loading states
- Request deduplication

**Basic Usage:**

```javascript
import { useAutoRefreshList } from "../hooks/useAutoRefreshList";
import * as enquiryService from "../services/enquiryService";

export function EnquiryScreen() {
    const {
        items,
        loading,
        refreshing,
        loadingMore,
        onRefresh,
        onLoadMore,
        hasMore,
    } = useAutoRefreshList({
        queryKey: ["enquiries", filters], // Cache key
        queryFn: async ({ page, limit, signal }) => {
            return enquiryService.getAllEnquiries(page, limit, "", "", "", "", {
                signal,
            });
        },
        ttlMs: 60000, // Cache for 1 minute
        autoRefreshIntervalMs: 5 * 60 * 1000, // Auto-refresh every 5 minutes
        tags: ["enquiries"], // For cache invalidation
        initialPage: 1,
        initialLimit: 20,
        staleOnFocus: true, // Refresh when screen is focused
    });

    const renderItem = ({ item }) => <EnquiryCard enquiry={item} />;

    return (
        <FlatList
            data={items}
            renderItem={renderItem}
            keyExtractor={(item) => item._id}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.5}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={loading ? <Skeleton /> : <EmptyState />}
            ListFooterComponent={loadingMore ? <ActivityIndicator /> : null}
        />
    );
}
```

**Advanced Options:**

```javascript
const {
    items, // Array of list items
    totalItems, // Total count from server
    hasMore, // Whether more items available
    currentPage, // Current page number
    currentLimit, // Current page size

    loading, // Initial loading state
    refreshing, // Pull-to-refresh in progress
    loadingMore, // Load-more in progress
    error, // Any errors

    onRefresh, // For RefreshControl (resets to page 1)
    onLoadMore, // For FlatList onEndReached
    refetch, // Manual refetch
    resetPagination, // Reset to page 1
    setLimit, // Change page size dynamically
} = useAutoRefreshList({
    queryKey: ["enquiries", status], // Cache key
    queryFn: async ({ page, limit, signal }) => {
        /* ... */
    },
    ttlMs: 60000, // Cache TTL
    autoRefreshIntervalMs: 0, // 0 = disabled, 5000+ = enabled
    tags: ["enquiries"], // Cache invalidation tags
    initialPage: 1,
    initialLimit: 20,
    enabled: true,
    staleOnFocus: false, // Usually false for lists
    staleOnAppStateChange: "active",
});
```

---

## Server-Side Cache Headers

### Add Cache Headers to API Responses

**Update your server routes:**

```javascript
const express = require("express");
const { apiCacheHeaders } = require("../middleware/cacheHeaders");

const enquiryRouter = express.Router();

// Apply cache headers to all GET requests
enquiryRouter.use(
    apiCacheHeaders({
        maxAge: 60, // Cache for 60 seconds
        staleWhileRevalidate: 300, // Allow stale for 5 minutes while refreshing
        staleIfError: 86400, // Allow stale for 1 day on error
        public: false, // Private cache (per-user)
    }),
);

// Your routes...
enquiryRouter.get("/", async (req, res) => {
    // ... fetch data ...
    res.json({ success: true, data: enquiries });
});

module.exports = enquiryRouter;
```

**In server.js:**

```javascript
const { apiCacheHeaders } = require("./middleware/cacheHeaders");

// Apply to specific routes
app.use("/api/enquiries", apiCacheHeaders({ maxAge: 60 }), enquiryRoutes);
app.use("/api/followups", apiCacheHeaders({ maxAge: 60 }), followupRoutes);
app.use("/api/dashboard", apiCacheHeaders({ maxAge: 120 }), dashboardRoutes);

// Different cache times for different endpoints
app.use("/api/users", apiCacheHeaders({ maxAge: 300 }), userRoutes);
app.use("/api/reports", apiCacheHeaders({ maxAge: 600 }), reportRoutes);
```

---

## Screen Implementation Examples

### HomeScreen - Auto-Refresh Every 5 Minutes

```javascript
import { useAutoRefresh } from "../hooks/useAutoRefresh";

export default function HomeScreen() {
    const { user } = useAuth();

    const {
        data: dashboard,
        loading,
        refreshing,
        onRefresh,
        error,
    } = useAutoRefresh({
        queryKey: ["dashboard", user?.company_id],
        queryFn: async ({ signal }) => {
            const response = await dashboardService.getDashboardData(
                user?.company_id,
                { signal },
            );
            return response;
        },
        ttlMs: 60000, // Cache for 1 minute
        autoRefreshIntervalMs: 5 * 60 * 1000, // Auto-refresh every 5 minutes
        tags: ["dashboard", "enquiries", "followups"],
        enabled: !!user?.company_id,
        staleOnFocus: true, // Fresh data when returning to app
        staleOnAppStateChange: "active", // Fresh data when app comes to foreground
    });

    if (error) {
        return <ErrorScreen error={error} onRetry={onRefresh} />;
    }

    return (
        <ScrollView
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={["#2563EB"]}
                />
            }>
            {loading ? (
                <HomeSkeleton />
            ) : (
                <>
                    <StatsCard data={dashboard.stats} />
                    <RecentEnquiries data={dashboard.recentEnquiries} />
                    <UpcomingFollowups data={dashboard.upcomingFollowups} />
                </>
            )}
        </ScrollView>
    );
}
```

### EnquiryScreen - Paginated List with Auto-Refresh

```javascript
import { useAutoRefreshList } from "../hooks/useAutoRefreshList";

export default function EnquiryScreen() {
    const { user } = useAuth();
    const [filters, setFilters] = useState({ status: "" });

    const {
        items: enquiries,
        loading,
        refreshing,
        loadingMore,
        onRefresh,
        onLoadMore,
        hasMore,
        currentPage,
        error,
    } = useAutoRefreshList({
        queryKey: ["enquiries", filters.status],
        queryFn: async ({ page, limit, signal }) => {
            const response = await enquiryService.getAllEnquiries(
                page,
                limit,
                "",
                filters.status,
                "",
                "",
                { signal },
            );
            return response;
        },
        ttlMs: 60000,
        autoRefreshIntervalMs: 5 * 60 * 1000, // Auto-refresh every 5 minutes
        tags: ["enquiries"],
        initialLimit: 20,
        enabled: !!user?.company_id,
        staleOnFocus: false, // Usually false for lists to avoid constant reloads
        staleOnAppStateChange: "active",
    });

    const renderItem = ({ item, index }) => (
        <EnquiryCard
            enquiry={item}
            index={index}
            onPress={() => navigation.push("EnquiryDetail", { enquiry: item })}
        />
    );

    return (
        <View style={styles.container}>
            <FilterBar
                filters={filters}
                onFilterChange={(newFilters) => {
                    setFilters(newFilters);
                    // Filter change will trigger new query via queryKey
                }}
            />

            <FlatList
                data={enquiries}
                renderItem={renderItem}
                keyExtractor={(item) => item._id}
                onEndReached={onLoadMore}
                onEndReachedThreshold={0.5}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={["#2563EB"]}
                    />
                }
                ListEmptyComponent={
                    loading ? (
                        <EnquirySkeleton />
                    ) : (
                        <EmptyState message="No enquiries found" />
                    )
                }
                ListFooterComponent={
                    loadingMore ? (
                        <View style={styles.loadingMore}>
                            <ActivityIndicator size="large" color="#2563EB" />
                        </View>
                    ) : null
                }
                scrollEventThrottle={16}
            />

            {error && (
                <ErrorBar
                    message="Failed to load enquiries"
                    onRetry={onRefresh}
                />
            )}
        </View>
    );
}
```

### FollowUpScreen - Similar to EnquiryScreen

```javascript
import { useAutoRefreshList } from "../hooks/useAutoRefreshList";

export default function FollowUpScreen() {
    const { user } = useAuth();

    const {
        items: followups,
        loading,
        refreshing,
        loadingMore,
        onRefresh,
        onLoadMore,
        hasMore,
        error,
    } = useAutoRefreshList({
        queryKey: ["followups", user?.company_id],
        queryFn: async ({ page, limit, signal }) => {
            return followupService.getFollowups(page, limit, { signal });
        },
        ttlMs: 60000,
        autoRefreshIntervalMs: 5 * 60 * 1000,
        tags: ["followups"],
        initialLimit: 20,
        enabled: !!user?.company_id,
        staleOnFocus: false,
    });

    // Similar FlatList structure as EnquiryScreen
    // ...
}
```

---

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Client-side cache TTL (milliseconds)
EXPO_PUBLIC_CACHE_TTL_ENQUIRIES_MS=60000
EXPO_PUBLIC_CACHE_TTL_FOLLOWUPS_MS=60000
EXPO_PUBLIC_CACHE_TTL_DASHBOARD_MS=60000
EXPO_PUBLIC_CACHE_TTL_REPORTS_MS=120000

# Auto-refresh intervals (milliseconds)
# 0 = disabled, 5000+ = enabled
EXPO_PUBLIC_AUTO_REFRESH_ENQUIRIES_MS=300000
EXPO_PUBLIC_AUTO_REFRESH_FOLLOWUPS_MS=300000
EXPO_PUBLIC_AUTO_REFRESH_DASHBOARD_MS=600000
```

### Using Environment Variables in Hooks

```javascript
const AUTO_REFRESH_ENQUIRIES = Number(
  process.env.EXPO_PUBLIC_AUTO_REFRESH_ENQUIRIES_MS || 0
);
const CACHE_TTL_ENQUIRIES = Number(
  process.env.EXPO_PUBLIC_CACHE_TTL_ENQUIRIES_MS || 60000
);

// In your component
const { ... } = useAutoRefreshList({
  queryKey: ["enquiries"],
  queryFn: async ({ page, limit, signal }) => { /* ... */ },
  ttlMs: CACHE_TTL_ENQUIRIES,
  autoRefreshIntervalMs: AUTO_REFRESH_ENQUIRIES,
  // ...
});
```

---

## Best Practices

### 1. **Cache TTL Selection**

- **Fast-changing data (enquiries, followups):** 30-60 seconds
- **Moderate-changing data (user profile):** 5-10 minutes
- **Slow-changing data (settings, reports):** 10-30 minutes

### 2. **Auto-Refresh Intervals**

- **Real-time critical (leads, calls):** 30-60 seconds
- **Important updates (followups):** 5 minutes
- **Non-critical (reports, stats):** 10+ minutes
- **Disabled by default:** Set `autoRefreshIntervalMs: 0`

### 3. **Cache Invalidation**

```javascript
// When data changes (user creates/updates)
import { invalidateCacheTags } from "../services/appCache";

// After creating enquiry
await createEnquiry(data);
await invalidateCacheTags(["enquiries", "dashboard", "reports"]);

// After updating followup
await updateFollowup(id, data);
await invalidateCacheTags(["followups", "dashboard"]);
```

### 4. **Screen Focus Behavior**

```javascript
// Use staleOnFocus for important data that users check
staleOnFocus: true,

// Keep staleOnFocus: false for lists (avoid constant reloading)
staleOnFocus: false,
```

### 5. **Error Handling**

```javascript
const { data, error, refreshing, onRefresh } = useAutoRefresh({
    // ...
});

if (error) {
    return (
        <ErrorScreen
            error={error}
            onRetry={onRefresh}
            message="Failed to load data"
        />
    );
}
```

### 6. **Debugging Cache**

```javascript
// Check what's cached
import AsyncStorage from "@react-native-async-storage/async-storage";

const debugCache = async () => {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter((k) => k.startsWith("APP_CACHE:"));
    const entries = await AsyncStorage.multiGet(cacheKeys);
    console.log("Cached entries:", entries);
};
```

### 7. **Testing Cache Behavior**

```javascript
// Manual cache invalidation in testing
import { invalidateCacheTags } from "../services/appCache";

// Clear all data
await invalidateCacheTags(["enquiries", "followups", "dashboard"]);

// Or refetch with force skip cache
const { refetch } = useAutoRefresh({
    // ...
});
await refetch(); // Skips cache
```

---

## Summary

| Feature           | Hook                 | Method                            |
| ----------------- | -------------------- | --------------------------------- |
| Simple data       | `useAutoRefresh`     | Single fetch                      |
| Paginated lists   | `useAutoRefreshList` | Pagination + infinite scroll      |
| Manual refresh    | Both                 | `onRefresh` with `RefreshControl` |
| Auto-refresh      | Both                 | `autoRefreshIntervalMs`           |
| Cache management  | Both                 | `ttlMs` + `tags`                  |
| Focus refresh     | Both                 | `staleOnFocus`                    |
| App state refresh | Both                 | `staleOnAppStateChange`           |
| Error handling    | Both                 | `error` state                     |
| Server caching    | Middleware           | `apiCacheHeaders`                 |

---

**Ready to implement? Start with HomeScreen, then EnquiryScreen, then FollowUpScreen.**
