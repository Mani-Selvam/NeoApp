# Data Refresh System - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         REACT NATIVE APP                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       SCREENS                                    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │  HomeScreen ──────┐                                             │   │
│  │  (useAutoRefresh) │                                             │   │
│  │                   │    ┌──────────────────────────────────┐    │   │
│  │                   ├─→  │  CUSTOM HOOKS (Client-Side)      │    │   │
│  │  EnquiryScreen ──┤    ├──────────────────────────────────┤    │   │
│  │ (useAutoRefreshList)   │  useAutoRefresh                 │    │   │
│  │                   │    │  useAutoRefreshList             │    │   │
│  │  FollowUpScreen ─┤    │                                  │    │   │
│  │ (useAutoRefreshList)   │  ✨ Features:                   │    │   │
│  │                   │    │  • Manual refresh              │    │   │
│  │                   │    │  • Auto-refresh                │    │   │
│  │                   │    │  • Smart caching              │    │   │
│  │                   └─→  │  • App state detection        │    │   │
│  │                        │  • Request cancellation       │    │   │
│  │                        │  • Error handling             │    │   │
│  │                        └──────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    CACHE LAYER                                   │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │  AsyncStorage (appCache.js)                                    │   │
│  │  • setCacheEntry()     - Store with TTL + tags                │   │
│  │  • getCacheEntry()     - Retrieve from cache                  │   │
│  │  • isFresh()          - Check if cache is fresh              │   │
│  │  • invalidateCacheTags() - Batch invalidation                │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   API SERVICES                                   │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │  enquiryService.getAllEnquiries(page, limit, {..., signal})    │   │
│  │  followupService.getFollowups(page, limit, {..., signal})      │   │
│  │  dashboardService.getDashboardData(companyId, {..., signal})   │   │
│  │                                                                  │   │
│  │  ✨ All accept 'signal' for request cancellation              │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
                    HTTP REQUESTS
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXPRESS.JS SERVER                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │              CACHE HEADERS MIDDLEWARE                          │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │                                                                │    │
│  │  app.use("/api/enquiries", apiCacheHeaders(...), routes)     │    │
│  │                                                                │    │
│  │  Sets HTTP Headers:                                           │    │
│  │  • Cache-Control: private, max-age=60                        │    │
│  │  • stale-while-revalidate=300                                │    │
│  │  • stale-if-error=86400                                      │    │
│  │  • ETag                                                       │    │
│  │  • Vary: Authorization, Accept-Encoding                      │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                  API ROUTES                                    │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │                                                                │    │
│  │  GET  /api/enquiries         → List with pagination          │    │
│  │  GET  /api/enquiries/:id     → Single enquiry                │    │
│  │  POST /api/enquiries         → Create                        │    │
│  │  PUT  /api/enquiries/:id     → Update (invalidates cache)    │    │
│  │                                                                │    │
│  │  GET  /api/followups         → List with pagination          │    │
│  │  GET  /api/dashboard/:id     → Dashboard data                │    │
│  │                                                                │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                 DATABASE (MongoDB)                             │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │  Enquiries, Followups, Users, Companies, etc.                 │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### Pull-to-Refresh Flow

```
┌────────────────────┐
│ User Swipes Down   │
└────────┬───────────┘
         │
         ▼
┌────────────────────────────────────┐
│ RefreshControl.onRefresh() Called   │
└────────┬───────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ Hook: onRefresh()                        │
│ 1. invalidateCacheTags(["enquiries"])    │
│ 2. fetchData({ skipCache: true })       │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ Service Call with Signal                 │
│ getEnquiries(page, limit, { signal })    │
└────────┬───────────────────────────────┘
         │ HTTP Request
         ▼
┌──────────────────────────────────────────┐
│ Server API                               │
│ GET /api/enquiries?page=1&limit=20      │
└────────┬───────────────────────────────┘
         │ HTTP Response + Cache Headers
         ▼
┌──────────────────────────────────────────┐
│ Client: Cache Response                   │
│ setCacheEntry(key, data, { tags: ... })  │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ Update UI State                          │
│ setItems(data)                           │
│ setRefreshing(false)                     │
└────────┬───────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│ UI Re-renders with New Data              │
└──────────────────────────────────────────┘
```

### Auto-Refresh Flow

```
┌─────────────────────────────────┐
│ Component Mounts                 │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Fetch Initial Data                              │
│ 1. Check cache (fresh?)                         │
│ 2. If fresh: return cached data                 │
│ 3. If stale: fetch from server                  │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Start Auto-Refresh Interval                     │
│ setInterval(() => { fetch() }, 5min)            │
└────────┬────────────────────────────────────────┘
         │
         ├─────────────────────────────────────┐
         │ Every 5 Minutes                     │
         │                                     │
         │ 1. Check if cache is stale         │
         │ 2. If stale: fetch new data        │
         │ 3. Update cache                     │
         │ 4. Silent UI update                │
         │ (user doesn't see loading state)   │
         │                                     │
         └─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ User Leaves Screen                              │
│ clearInterval() + AbortController.abort()       │
└─────────────────────────────────────────────────┘
```

### App State Change Flow

```
┌──────────────────────────┐
│ App in Foreground        │
│ User Working             │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ User Minimizes App       │
│ (Home button)            │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ App State → Background           │
│ (Auto-refresh continues, but     │
│  requests skipped)               │
└──────────┬───────────────────────┘
           │
           ▼ (seconds/minutes later)
┌──────────────────────────────────┐
│ User Returns to App              │
│ (Taps app icon)                  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ App State → Active                           │
│ AppState.addEventListener('change', ...)    │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ Trigger Cache Invalidation                   │
│ invalidateCacheTags(["enquiries"])           │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ Fetch Fresh Data                             │
│ fetchData({ skipCache: true })               │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ User Sees Latest Data                        │
│ (Usually within 1-2 seconds)                 │
└──────────────────────────────────────────────┘
```

### Cache Lookup Flow

```
┌─────────────────────────────────┐
│ Hook Called: useAutoRefresh()    │
└────────┬────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ Build Cache Key                        │
│ buildCacheKey("dashboard", userId)    │
└────────┬─────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ Check AsyncStorage                     │
│ getCacheEntry(key)                     │
└────────┬─────────────────────────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
┌────────┐  ┌──────────┐
│ Found  │  │ Not Found│
└───┬────┘  └────┬─────┘
    │            │
    ▼            ▼
 ┌──────────┐  ┌──────────────┐
 │ Check    │  │ Fetch from   │
 │ isFresh()│  │ API Server   │
 └────┬─────┘  └────┬─────────┘
      │             │
   ┌──┴──┐          │
   │     │          │
   ▼     ▼          ▼
 Fresh Stale   ┌──────────┐
   │     │     │ Response │
   │     ├────→└────┬─────┘
   │     │          │
   │     │          ▼
   │     │     ┌──────────┐
   │     │     │ Cache it │
   │     │     │setCacheEntry()
   │     │     └────┬─────┘
   │     │          │
   └─┬───┴──────────┤
     │              │
     ▼              ▼
  Return      Return to UI
  Cached      with Fresh Data
  Data
```

### Request Cancellation Flow

```
┌──────────────────────────────────┐
│ New Data Required                │
│ User navigates/swaps screens     │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ New Hook Instance Created            │
│ useAutoRefresh({ ... })              │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ Old AbortController.abort()                  │
│ Cancels previous pending request             │
└────────┬─────────────────────────────────────┘
         │
         ▼ (On Server)
┌──────────────────────────────────────────────┐
│ Request Cancelled                            │
│ Response not sent                            │
│ Network resources freed                      │
└────────┬─────────────────────────────────────┘
         │ (On Client)
         ▼
┌──────────────────────────────────────────────┐
│ Catch AbortError                             │
│ if (error.name === 'AbortError') return null │
└────────┬─────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│ UI Not Updated (Request was cancelled)       │
│ No memory leak, no stale state updates       │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ New Request Starts                           │
│ service.fetch({ signal: newAbortController })
└──────────────────────────────────────────────┘
```

---

## Component Integration

```
┌─────────────────────────────────────────────┐
│          HomeScreen                         │
│  ┌───────────────────────────────────────┐ │
│  │ useAutoRefresh({                      │ │
│  │   queryKey: ["dashboard"]             │ │
│  │   queryFn: getDashboardData           │ │
│  │   ttlMs: 60000                        │ │
│  │   autoRefreshIntervalMs: 300000       │ │
│  │   tags: ["dashboard"]                 │ │
│  │   staleOnFocus: true                  │ │
│  │ })                                    │ │
│  │                                       │ │
│  │ ↓ Returns                             │ │
│  │ {data, loading, refreshing, onRefresh}│ │
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ <ScrollView                           │ │
│  │   refreshControl={                    │ │
│  │     <RefreshControl                   │ │
│  │       refreshing={refreshing}         │ │
│  │       onRefresh={onRefresh}           │ │
│  │     />                                │ │
│  │   }                                   │ │
│  │ >                                     │ │
│  │   {loading ? <Skeleton/> : <Data/>}   │ │
│  │ </ScrollView>                         │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## Summary

**The system provides:**

- ✅ Manual refresh via pull-to-refresh
- ✅ Automatic periodic refresh
- ✅ Smart caching with TTL
- ✅ Background app detection
- ✅ Request cancellation
- ✅ Proper error handling
- ✅ Server-side cache headers

**All components work together seamlessly to provide:**

- **Fast loading** (from cache)
- **Fresh data** (auto-refresh)
- **Smart updates** (silent background refreshes)
- **Low battery** (minimal polling)
- **Better UX** (no loading spinners on auto-refresh)
