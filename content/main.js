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

  /**
   * メイン処理。URL に合うアダプターを取得し、初期化・フィルターUI作成・各部屋の駐車場代取得を実行する
   */
  function run() {
    const adapter = registry.getAdapterForUrl(location.href);
    if (!adapter) return;

    adapter.init();
    core.createFilterUI(adapter, () => core.applyFilter(adapter));

    const entries = adapter.getRoomEntries();
    let delay = 0;
    entries.forEach(({ row, url }) => {
      setTimeout(() => {
        adapter.processRoomRow(row, url, () => core.applyFilter(adapter));
      }, delay);
      delay += DELAY_MS;
    });
  }

  /**
   * 動的コンテンツ（無限スクロール等）対応。DOM 変更時に新規表示された部屋行を処理する
   */
  function observeDynamicContent() {
    const adapter = registry.getAdapterForUrl(location.href);
    if (!adapter) return;

    adapter.init();
    adapter.getRoomEntries().forEach(({ row, url }) => {
      if (!row.getAttribute(processedAttr)) {
        adapter.processRoomRow(row, url, () => core.applyFilter(adapter));
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
