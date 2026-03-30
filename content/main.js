/**
 * 駐車場代表示 Chrome拡張 - メインエントリ
 * URL に応じてアダプターを取得し、抽象化された処理を実行
 */
(function (global) {
  'use strict';
  const ParkingExt = global.ParkingExt || {};
  const config = ParkingExt.config || {};
  const core = ParkingExt.core || {};
  const registry = ParkingExt.adapterRegistry || {};

  const DELAY_MS = config.DELAY_MS || 500;
  const processedAttr = config.PROCESSED_ATTR || 'data-parking-ext-processed';
  const queuedAttr = config.QUEUE_ATTR || 'data-parking-ext-queued';

  let fetchTotal = 0;
  let fetchDone = 0;

  function isParkingCacheHit(adapter, detailUrl) {
    return (
      typeof adapter.isParkingCached === 'function' &&
      adapter.isParkingCached(detailUrl)
    );
  }

  function bumpProgressAndFilter(adapter) {
    fetchDone += 1;
    core.setFetchProgress(fetchDone, fetchTotal);
    core.applyFilter(adapter);
  }

  /**
   * メイン処理。URL に合うアダプターを取得し、初期化・フィルターUI作成・各部屋の駐車場代取得を実行する
   */
  function run() {
    const adapter = registry.getAdapterForUrl(location.href);
    if (!adapter) return;

    adapter.init();
    core.createFilterUI(adapter, () => core.applyFilter(adapter));

    const entries = adapter.getRoomEntries();
    fetchTotal = entries.length;
    fetchDone = 0;
    core.setFetchProgress(fetchDone, fetchTotal);

    let delay = 0;
    entries.forEach(({ row, url }) => {
      row.setAttribute(queuedAttr, '1');
      const hit = isParkingCacheHit(adapter, url);
      const scheduleAt = hit ? 0 : delay;
      if (!hit) delay += DELAY_MS;
      setTimeout(() => {
        adapter.processRoomRow(row, url, () => bumpProgressAndFilter(adapter));
      }, scheduleAt);
    });
  }

  /**
   * 動的コンテンツ（無限スクロール等）対応。DOM 変更時に新規表示された部屋行を処理する
   */
  function observeDynamicContent() {
    const adapter = registry.getAdapterForUrl(location.href);
    if (!adapter) return;

    adapter.init();
    let delay = 0;
    adapter.getRoomEntries().forEach(({ row, url }) => {
      if (!row.getAttribute(processedAttr) && !row.getAttribute(queuedAttr)) {
        row.setAttribute(queuedAttr, '1');
        fetchTotal += 1;
        core.setFetchProgress(fetchDone, fetchTotal);
        const hit = isParkingCacheHit(adapter, url);
        const scheduleAt = hit ? 0 : delay;
        if (!hit) delay += DELAY_MS;
        setTimeout(() => {
          adapter.processRoomRow(row, url, () => bumpProgressAndFilter(adapter));
        }, scheduleAt);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  if (document.body) {
    const observer = new MutationObserver(observeDynamicContent);
    observer.observe(document.body, { childList: true, subtree: true });
  }
})(typeof window !== 'undefined' ? window : this);
