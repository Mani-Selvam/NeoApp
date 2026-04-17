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
 * Custom hook for managing paginated list data with manual + auto-refresh
 * Features:
 * - Infinite scroll / pagination support
 * - Manual refresh (pull to refresh - resets to page 1)
 * - Auto-refresh at intervals (keeps current page)
 * - Smart cache management per page
 * - Background app detection
 * - Request deduplication
 */
export const useAutoRefreshList = ({
    queryKey = [], // Cache key parts: ['enquiries', status]
    queryFn = async ({ page, limit, signal }) => {}, // Data fetching function
    ttlMs = 60000, // Cache TTL in milliseconds
    autoRefreshIntervalMs = 0, // 0 = disabled, 5000+ = enabled
    tags = [], // Cache tags for invalidation
    initialPage = 1,
    initialLimit = 20,
    enabled = true,
    staleOnFocus = false,
    staleOnAppStateChange = "active",
} = {}) => {
    // Pagination state
    const [page, setPage] = useState(initialPage);
    const [limit, setLimit] = useState(initialLimit);
    const [items, setItems] = useState([]);
    const [totalItems, setTotalItems] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Loading state
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    // Refs
    const fetchAbortController = useRef(null);
    const autoRefreshTimer = useRef(null);
    const appStateSubscription = useRef(null);
    const isFetching = useRef(false);
    const itemsCacheRef = useRef({});
    const lastRefreshTimeRef = useRef({});

    /**
     * Generate cache key for a specific page
     */
    const getCacheKeyForPage = useCallback(
        (pageNum) => {
            return buildCacheKey(
                "useAutoRefreshList:v1",
                ...(Array.isArray(queryKey) ? queryKey : [queryKey]),
                `page:${pageNum}`,
                `limit:${limit}`,
            );
        },
        [queryKey, limit],
    );

    /**
     * Fetch data for a specific page
     */
    const fetchPage = useCallback(
        async ({
            pageNum = 1,
            skipCache = false,
            isRefresh = false,
            isLoadMore = false,
        } = {}) => {
            // Prevent simultaneous requests for same page
            const fetchKey = `page:${pageNum}`;
            if (isFetching.current && !isRefresh && !isLoadMore) {
                return null;
            }

            try {
                isFetching.current = true;

                if (isRefresh) {
                    setRefreshing(true);
                } else if (isLoadMore) {
                    setLoadingMore(true);
                } else {
                    setLoading(true);
                }
                setError(null);

                const cacheKey = getCacheKeyForPage(pageNum);

                // Check cache first
                if (!skipCache) {
                    const cached = await getCacheEntry(cacheKey).catch(
                        () => null,
                    );
                    if (cached?.value && isFresh(cached, ttlMs)) {
                        const result = cached.value;
                        if (pageNum === 1) {
                            setItems(result.data || []);
                            setTotalItems(
                                result.pagination?.total ||
                                    result.data?.length ||
                                    0,
                            );
                            setHasMore(
                                result.pagination?.hasMore ??
                                    result.data?.length >= limit,
                            );
                        } else {
                            setItems((prev) => [
                                ...prev,
                                ...(result.data || []),
                            ]);
                            setHasMore(
                                result.pagination?.hasMore ??
                                    result.data?.length >= limit,
                            );
                        }
                        setLoading(false);
                        setRefreshing(false);
                        setLoadingMore(false);
                        isFetching.current = false;
                        return result;
                    }
                }

                // Abort previous request
                fetchAbortController.current?.abort?.();
                fetchAbortController.current = new AbortController();

                // Fetch from source
                const result = await queryFn({
                    page: pageNum,
                    limit,
                    signal: fetchAbortController.current.signal,
                });

                if (!result) {
                    throw new Error("No data returned");
                }

                // Normalize response
                const data = Array.isArray(result) ? result : result.data || [];
                const pagination = result.pagination || {
                    total: data.length,
                    hasMore: data.length >= limit,
                };

                const normalizedResult = { data, pagination };

                // Cache the result
                await setCacheEntry(cacheKey, normalizedResult, {
                    tags: Array.isArray(tags) ? tags : [],
                }).catch(() => {});

                // Update state based on request type
                if (pageNum === 1) {
                    setItems(data);
                    setTotalItems(pagination.total);
                    setHasMore(pagination.hasMore);
                } else {
                    setItems((prev) => [...prev, ...data]);
                    setHasMore(pagination.hasMore);
                }

                lastRefreshTimeRef.current[pageNum] = Date.now();
                return normalizedResult;
            } catch (err) {
                // Ignore abort errors
                if (err.name !== "AbortError") {
                    setError(err);
                    console.error(
                        "[useAutoRefreshList] Fetch error:",
                        err.message,
                    );
                }
            } finally {
                setLoading(false);
                setRefreshing(false);
                setLoadingMore(false);
                isFetching.current = false;
            }
        },
        [queryFn, limit, ttlMs, tags, getCacheKeyForPage],
    );

    /**
     * Manual refresh (pull-to-refresh) - resets to page 1
     */
    const onRefresh = useCallback(async () => {
        if (Array.isArray(tags) && tags.length > 0) {
            await invalidateCacheTags(tags).catch(() => {});
        }
        setPage(1);
        await fetchPage({ pageNum: 1, skipCache: true, isRefresh: true });
    }, [tags, fetchPage]);

    /**
     * Load more (infinite scroll)
     */
    const onLoadMore = useCallback(async () => {
        if (!hasMore || loadingMore || loading) {
            return;
        }
        const nextPage = page + 1;
        setPage(nextPage);
        await fetchPage({
            pageNum: nextPage,
            skipCache: false,
            isLoadMore: true,
        });
    }, [page, hasMore, loadingMore, loading, fetchPage]);

    /**
     * Reset to first page
     */
    const resetPagination = useCallback(() => {
        setPage(1);
        setItems([]);
        setTotalItems(0);
        setHasMore(true);
    }, []);

    /**
     * Initial data fetch
     */
    useEffect(() => {
        if (!enabled) {
            return;
        }

        fetchPage({ pageNum: 1, skipCache: false, isRefresh: false });
    }, [enabled, fetchPage]);

    /**
     * Setup auto-refresh polling (refreshes current page)
     */
    useEffect(() => {
        if (
            !enabled ||
            !autoRefreshIntervalMs ||
            autoRefreshIntervalMs < 5000
        ) {
            return;
        }

        autoRefreshTimer.current = setInterval(() => {
            // Auto-refresh current page without changing pagination
            fetchPage({ pageNum: 1, skipCache: false, isRefresh: false });
        }, autoRefreshIntervalMs);

        return () => {
            if (autoRefreshTimer.current) {
                clearInterval(autoRefreshTimer.current);
            }
        };
    }, [enabled, autoRefreshIntervalMs, fetchPage]);

    /**
     * Invalidate cache on screen focus
     */
    useFocusEffect(
        useCallback(() => {
            if (!enabled || !staleOnFocus) {
                return;
            }

            Promise.resolve(invalidateCacheTags(tags || []))
                .then(() =>
                    fetchPage({
                        pageNum: 1,
                        skipCache: true,
                        isRefresh: false,
                    }),
                )
                .catch(() => {});

            return () => {};
        }, [enabled, staleOnFocus, tags, fetchPage]),
    );

    /**
     * Handle app state changes
     */
    useEffect(() => {
        if (!enabled || !staleOnAppStateChange) {
            return;
        }

        const handleAppStateChange = (state) => {
            if (state === staleOnAppStateChange) {
                Promise.resolve(invalidateCacheTags(tags || []))
                    .then(() =>
                        fetchPage({
                            pageNum: 1,
                            skipCache: true,
                            isRefresh: false,
                        }),
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
    }, [enabled, staleOnAppStateChange, tags, fetchPage]);

    /**
     * Cleanup on unmount
     */
    useEffect(() => {
        return () => {
            fetchAbortController.current?.abort?.();
            if (autoRefreshTimer.current) {
                clearInterval(autoRefreshTimer.current);
            }
            appStateSubscription.current?.remove?.();
        };
    }, []);

    return {
        // Data
        items,
        totalItems,
        hasMore,
        currentPage: page,
        currentLimit: limit,

        // State
        loading,
        refreshing,
        loadingMore,
        error,

        // Handlers
        onRefresh, // For RefreshControl (pull-to-refresh)
        onLoadMore, // For FlatList onEndReached (infinite scroll)
        resetPagination, // Manual reset
        refetch: () =>
            fetchPage({ pageNum: 1, skipCache: true, isRefresh: false }),
        setLimit, // Change page size
    };
};
