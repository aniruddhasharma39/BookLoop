/**
 * Client-Side Caching Utility for BookLoop
 * Provides lightning-fast responses by combining an in-memory Map
 * with sessionStorage fallback.
 */

import { supabase, isSupabaseConfigured } from './supabase';

const memoryCache = new Map();
const PREFIX = 'bookloop_cache_';

/**
 * Get item from cache if not expired
 * @param {string} key 
 * @returns {any | null}
 */
export function getCache(key) {
  const now = Date.now();

  // 1. Check memory cache first (fastest)
  if (memoryCache.has(key)) {
    const item = memoryCache.get(key);
    if (item.expiresAt > now) {
      return item.data;
    }
    memoryCache.delete(key);
  }

  // 2. Check sessionStorage
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw) {
      const item = JSON.parse(raw);
      if (item.expiresAt > now) {
        // Hydrate memory cache
        memoryCache.set(key, item);
        return item.data;
      }
      sessionStorage.removeItem(PREFIX + key);
    }
  } catch (e) {
    // Ignore storage parse errors
  }

  return null;
}

/**
 * Store data in cache with TTL
 * @param {string} key 
 * @param {any} data 
 * @param {number} ttlMs Time to live in milliseconds (default: 2 minutes)
 */
export function setCache(key, data, ttlMs = 120000) {
  const item = {
    data,
    expiresAt: Date.now() + ttlMs,
    savedAt: Date.now()
  };

  memoryCache.set(key, item);

  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(item));
  } catch (e) {
    // Quota exceeded: clear older items
    try {
      sessionStorage.clear();
      sessionStorage.setItem(PREFIX + key, JSON.stringify(item));
    } catch (_) {}
  }
}

/**
 * Remove a specific key from cache
 */
export function removeCache(key) {
  memoryCache.delete(key);
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch (e) {}
}

/**
 * Invalidate all keys matching a prefix or pattern (e.g. 'listings', 'institutions')
 * @param {string} pattern 
 */
export function invalidateCachePattern(pattern) {
  // Clear from memory
  for (const k of memoryCache.keys()) {
    if (k.includes(pattern)) {
      memoryCache.delete(k);
    }
  }

  // Clear from sessionStorage
  try {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIX) && k.includes(pattern)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => sessionStorage.removeItem(k));
  } catch (e) {}
}

/**
 * Transparent fetch-through-cache helper
 * @param {string} key 
 * @param {() => Promise<any>} fetcherFn 
 * @param {number} ttlMs 
 * @returns {Promise<any>}
 */
export async function fetchWithCache(key, fetcherFn, ttlMs = 120000) {
  const cached = getCache(key);
  if (cached !== null) {
    return cached;
  }

  const freshData = await fetcherFn();
  if (freshData !== undefined && freshData !== null) {
    setCache(key, freshData, ttlMs);
  }
  return freshData;
}

/**
 * Fetch and cache all active institutions (15-minute TTL)
 * Shared across SearchPage, SignupPage, CreateListing, Profile, etc.
 */
export async function fetchCachedInstitutions() {
  const CACHE_KEY = 'institutions_all';
  const TTL_15_MIN = 15 * 60 * 1000;

  return fetchWithCache(CACHE_KEY, async () => {
    if (!isSupabaseConfigured) return [];
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name, city, area, institution_type, is_active')
      .eq('is_active', true)
      .order('name');
    
    if (error) {
      console.warn('Could not fetch institutions from Supabase:', error);
      return [];
    }
    return data || [];
  }, TTL_15_MIN);
}

