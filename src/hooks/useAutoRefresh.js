import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
    buildCacheKey,
    getCacheEntry,
    isFresh,
    invalidateCacheTags,
    setCacheEntry,
} from "../services/appCache";

/**
 * Custom hook for managing data fetching with manual + auto-refresh
 * Features:
 * - Manual refresh (pull to refresh)
 * - Auto-refresh at intervals
 * - Smart cache management
 * - Background app detection
 * - Request deduplication
 */
export const useAutoRefresh = ({
    queryKey = [], // Cache key parts: ['enquiries', page, status]
    queryFn = async () => {}, // Data fetching function
    ttlMs = 60000, // Cache TTL in milliseconds
    autoRefreshIntervalMs = 0, // 0 = disabled, 5000+ = enabled
    tags = [], // Cache tags for invalidation: ['enquiries', 'dashboard']
    enabled = true, // Whether to fetch data
    staleOnFocus = false, // Invalidate cache when screen is focused
    staleOnAppStateChange = "active", // Invalidate cache on app state change ('active' | false)
} = {}) => {
    // State management
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    // Refs for cleanup
    const fetchAbortController = useRef(null);
    const autoRefreshTimer = useRef(null);
    const appStateSubscription = useRef(null);
    const lastFetchTime = useRef(0);
    const isFetching = useRef(false);

    // Generate cache key
    const cacheKey = buildCacheKey(
        "useAutoRefresh:v1",
        ...(Array.isArray(queryKey) ? queryKey : [queryKey]),
    );

    /**
     * Fetch data with deduplication and cache handling
     */
    const fetchData = useCallback(
        async ({ skipCache = false, isRefresh = false } = {}) => {
            // Prevent simultaneous requests
            if (isFetching.current && !isRefresh) {
                return;
            }

            try {
                isFetching.current = true;
                if (isRefresh) {
                    setRefreshing(true);
                } else {
                    setLoading(true);
                }
                setError(null);

                // Check cache first (unless forced refresh)
                if (!skipCache && !isRefresh) {
                    const cached = await getCacheEntry(cacheKey).catch(
                        () => null,
                    );
                    if (cached?.value && isFresh(cached, ttlMs)) {
                        setData(cached.value);
                        setLoading(false);
                        isFetching.current = false;
                        return cached.value;
                    }
                }

                // Create new abort controller
                fetchAbortController.current = new AbortController();

                // Fetch from source
                const result = await queryFn({
                    signal: fetchAbortController.current.signal,
                });

                // Cache the result
                if (result !== undefined) {
                    await setCacheEntry(cacheKey, result, {
                        tags: Array.isArray(tags) ? tags : [],
                    }).catch(() => {});
                }

                setData(result);
                lastFetchTime.current = Date.now();
                return result;
            } catch (err) {
                // Ignore abort errors
                if (err.name !== "AbortError") {
                    setError(err);
                    console.error("[useAutoRefresh] Fetch error:", err.message);
                }
            } finally {
                setLoading(false);
                setRefreshing(false);
                isFetching.current = false;
            }
        },
        [queryFn, cacheKey, ttlMs, tags],
    );

    /**
     * Manual refresh handler (pull-to-refresh)
     */
    const onRefresh = useCallback(async () => {
        // Invalidate cache tags for fresh data
        if (Array.isArray(tags) && tags.length > 0) {
            await invalidateCacheTags(tags).catch(() => {});
        }
        await fetchData({ skipCache: true, isRefresh: true });
    }, [fetchData, tags]);

    /**
     * Setup auto-refresh polling
     */
    useEffect(() => {
        if (
            !enabled ||
            !autoRefreshIntervalMs ||
            autoRefreshIntervalMs < 5000
        ) {
            return;
        }

        // Initial fetch
        fetchData({ skipCache: false, isRefresh: false });

        // Setup polling
        autoRefreshTimer.current = setInterval(() => {
            fetchData({ skipCache: false, isRefresh: false });
        }, autoRefreshIntervalMs);

        return () => {
            if (autoRefreshTimer.current) {
                clearInterval(autoRefreshTimer.current);
            }
        };
    }, [enabled, autoRefreshIntervalMs, fetchData]);

    /**
     * Invalidate cache on screen focus
     */
    useFocusEffect(
        useCallback(() => {
            if (!enabled || !staleOnFocus) {
                return;
            }

            // Invalidate cache and refetch
            Promise.resolve(invalidateCacheTags(tags || []))
                .then(() => fetchData({ skipCache: true, isRefresh: false }))
                .catch(() => {});

            return () => {
                // cleanup
            };
        }, [enabled, staleOnFocus, tags, fetchData]),
    );

    /**
     * Handle app state changes (foreground/background)
     */
    useEffect(() => {
        if (!enabled || !staleOnAppStateChange) {
            return;
        }

        const handleAppStateChange = (state) => {
            if (state === staleOnAppStateChange) {
                // App came to foreground - stale the cache and refetch
                Promise.resolve(invalidateCacheTags(tags || []))
                    .then(() =>
                        fetchData({ skipCache: true, isRefresh: false }),
                    )
                    .catch(() => {});
            }
        };

        appStateSubscription.current = AppState.addEventListener(
            "change",
            handleAppStateChange,
        );

        return () => {
            appStateSubscription.current?.remove?.();
        };
    }, [enabled, staleOnAppStateChange, tags, fetchData]);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            // Abort any pending requests
            fetchAbortController.current?.abort?.();

            // Clear auto-refresh timer
            if (autoRefreshTimer.current) {
                clearInterval(autoRefreshTimer.current);
            }

            // Remove app state listener
            appStateSubscription.current?.remove?.();
        };
    }, []);

    return {
        data,
        loading,
        error,
        refreshing,
        refetch: () => fetchData({ skipCache: true, isRefresh: false }),
        onRefresh, // For RefreshControl
    };
};
