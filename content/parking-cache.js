/**
 * 駐車場代 localStorage キャッシュ（サイト別 storageKey ごとに物件 ID → 値）
 */
(function (global) {
  'use strict';
  const ParkingExt = global.ParkingExt || {};
  const config = ParkingExt.config || {};

  function getTtlMs() {
    return config.CACHE_TTL_MS != null
      ? config.CACHE_TTL_MS
      : 60 * 60 * 1000;
  }

  function getMaxEntries() {
    return config.CACHE_MAX_ENTRIES != null ? config.CACHE_MAX_ENTRIES : 400;
  }

  function readCache(storageKey) {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}');
    } catch (_) {
      return {};
    }
  }

  function writeCache(storageKey, cache) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(cache));
    } catch (_) {}
  }

  function evictOldestIfNeeded(cache) {
    const max = getMaxEntries();
    const keys = Object.keys(cache);
    if (keys.length <= max) return cache;
    const sorted = keys
      .map((k) => ({
        k,
        ts: cache[k] && typeof cache[k].timestamp === 'number' ? cache[k].timestamp : 0,
      }))
      .sort((a, b) => a.ts - b.ts);
    const toRemove = keys.length - max;
    const next = { ...cache };
    for (let i = 0; i < toRemove; i++) {
      delete next[sorted[i].k];
    }
    return next;
  }

  /**
   * TTL 内の値のみ返す。無効・なしは null
   * @param {string} storageKey localStorage キー（サイト別）
   * @param {string} id 物件キャッシュキー
   * @returns {string|null}
   */
  function getValid(storageKey, id) {
    if (!id || !storageKey) return null;
    const cache = readCache(storageKey);
    const item = cache[id];
    const ttl = getTtlMs();
    if (item && Date.now() - item.timestamp < ttl) {
      return item.value;
    }
    return null;
  }

  /**
   * @param {string} storageKey
   * @param {string} id
   * @param {string} value
   */
  function set(storageKey, id, value) {
    if (!id || !storageKey) return;
    let cache = readCache(storageKey);
    cache[id] = { value, timestamp: Date.now() };
    cache = evictOldestIfNeeded(cache);
    writeCache(storageKey, cache);
  }

  ParkingExt.parkingCache = {
    getValid,
    set,
  };
})(typeof window !== 'undefined' ? window : this);
