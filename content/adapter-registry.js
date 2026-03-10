/**
 * 駐車場代表示 Chrome拡張 - アダプター登録・取得
 * URL に応じて適切なサイトアダプターを返す
 *
 * 新規サイト対応: content/adapters/ に新規ファイルを作成し、
 * アダプターオブジェクトを registry.register(adapter) で登録。
 * manifest.json の matches と host_permissions に該当URLを追加すること。
 */
(function (global) {
  'use strict';
  const ParkingExt = global.ParkingExt || {};
  const adapters = [];

  /**
   * サイト用アダプターを登録する。URL マッチ時にこのアダプターが使われる
   * @param {Object} adapter - サイト固有の実装
   * @param {string} adapter.name - アダプター名
   * @param {RegExp[]} adapter.urlPatterns - マッチするURLパターン
   * @param {Function} adapter.init - 初期化（ヘッダー更新等）
   * @param {Function} adapter.getRoomEntries - 部屋エントリ取得
   * @param {Function} adapter.processRoomRow - 部屋行の処理
   * @param {Function} adapter.getRowAndItem - 行と対応要素の取得
   * @param {Function} adapter.getBuildingContainers - 建物コンテナの取得（絞り込み用）
   */
  function registerAdapter(adapter) {
    if (adapter && adapter.urlPatterns && adapter.urlPatterns.length > 0) {
      adapters.push(adapter);
    }
  }

  /**
   * 指定 URL に適合するアダプターを取得する。複数登録時は先に登録されたものを返す
   * @param {string} url - ページURL
   * @returns {Object|null} アダプターまたは null
   */
  function getAdapterForUrl(url) {
    const targetUrl = url || location.href;
    return adapters.find((a) =>
      a.urlPatterns.some((pattern) => pattern.test(targetUrl))
    );
  }

  ParkingExt.adapterRegistry = {
    register: registerAdapter,
    getAdapterForUrl,
  };
})(typeof window !== 'undefined' ? window : this);
