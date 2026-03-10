/**
 * 駐車場代表示 Chrome拡張 - 設定
 */
(function (global) {
  'use strict';
  global.ParkingExt = global.ParkingExt || {};
  global.ParkingExt.config = {
    DELAY_MS: 500, // 詳細ページ取得のリクエスト間隔（ミリ秒）
    CACHE_EXPIRE_DAYS: 7, // 駐車場代キャッシュの有効期限（日）
    CACHE_KEY_PREFIX: 'parking-ext-cache-', // キャッシュの localStorage キー接頭辞
    FILTER_STATE_KEY: 'parking-ext-filter-state', // フィルター設定の localStorage キー
    PARKING_FEE_CLASS: 'parking-ext-fee', // 駐車場代表示用 span のクラス名
    PARKING_WRAPPER_CLASS: 'parking-ext-in-rent', // 賃料セル内のラッパー div のクラス名
    PROCESSED_ATTR: 'data-parking-ext-processed', // 処理済み行を示す data 属性
    PARKING_NUM_ATTR: 'data-parking-ext-num', // パース済み駐車場代（数値）を格納する data 属性
  };
})(typeof window !== 'undefined' ? window : this);
