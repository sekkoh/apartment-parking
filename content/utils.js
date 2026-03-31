/**
 * 駐車場代表示 Chrome拡張 - 共通ユーティリティ
 */
(function (global) {
  'use strict';
  const ParkingExt = global.ParkingExt || {};

  /**
   * 全角数字を半角に変換する
   * 例: "２万円" → "2万円"
   */
  function toHalfWidth(str) {
    return String(str).replace(/[０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    );
  }

  /**
   * 駐車場代テキストを数値（円）に変換する
   * フィルターの比較用。サイト共通のパースロジック。アダプターで override 可能
   * 例: "2万円" → 20000, "近隣100m" → null（距離表記は除外）
   */
  function parseParkingToNumber(str) {
    if (
      !str ||
      str === '取得待ち' ||
      str === '取得中...' ||
      str === '取得失敗'
    )
      return null;
    const s = String(str).trim();
    if (s === '-' || s === 'なし' || s === '—' || s === '要問合せ') return null;
    if (s === '無料' || s === '0円') return 0;
    const hasPrice = s.includes('円') || s.includes('万');
    const hasDistance =
      /[0-9０-９]+\s*m\b/i.test(s) || /[0-9０-９]+\s*km\b/i.test(s);
    if (hasDistance && !hasPrice) return null;
    if (!hasPrice) return null;
    const m1 = s.match(/([0-9０-９.．,，]+)\s*万\s*([0-9０-９,，]+)\s*円/);
    if (m1) {
      const man = parseFloat(toHalfWidth(m1[1].replace(/[,，]/g, '')));
      const sen = parseInt(toHalfWidth(m1[2].replace(/[,，]/g, '')), 10);
      return Math.round(man * 10000 + sen);
    }
    const m2 = s.match(/([0-9０-９.．,，]+)\s*万?\s*円/);
    if (m2) {
      const numStr = m2[1].replace(/[,，]/g, '');
      let n = parseFloat(toHalfWidth(numStr));
      if (isNaN(n)) return null;
      if (m2[0].includes('万')) n *= 10000;
      return Math.round(n);
    }
    const m3 = s.match(/([0-9０-９.．,，]+)\s*万\b/);
    if (m3) {
      const numStr = m3[1].replace(/[,，]/g, '');
      const n = parseFloat(toHalfWidth(numStr));
      return isNaN(n) ? null : Math.round(n * 10000);
    }
    return null;
  }

  /**
   * 物件詳細 HTML をストリーム読みし、parse が非 null になった時点で読み取りを打ち切る。
   * フッターや重い末尾まで落とさず済む場合がある（gzip 転送はサーバー都合で打ち切り不可のこともある）。
   * `<body` が現れるまでパースしない（head 内の誤検出を避ける）。
   */
  async function fetchHtmlWithEarlyParse(url, init, parseFn, options) {
    const stride =
      options && typeof options.parseStrideBytes === 'number'
        ? options.parseStrideBytes
        : 65536;
    const res = await fetch(url, init);
    if (!res.ok) return null;
    if (!res.body || typeof res.body.getReader !== 'function') {
      const text = await res.text();
      return text ? parseFn(text) : null;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let nextParseAt = 0;
    const bodyRe = /<body[\s>]/i;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }
        if (value) buffer += decoder.decode(value, { stream: true });

        const inBody = bodyRe.test(buffer);
        if (!inBody) continue;

        const shouldTry =
          buffer.length >= nextParseAt || buffer.length >= 524288;
        if (!shouldTry) continue;

        const parsed = parseFn(buffer);
        if (parsed !== null) {
          await reader.cancel().catch(function () {});
          return parsed;
        }
        nextParseAt = buffer.length + stride;
      }
      return parseFn(buffer);
    } catch (e) {
      try {
        await reader.cancel();
      } catch (e2) {
        /* ignore */
      }
      return null;
    }
  }

  ParkingExt.utils = {
    toHalfWidth,
    parseParkingToNumber,
    fetchHtmlWithEarlyParse,
  };
})(typeof window !== 'undefined' ? window : this);
