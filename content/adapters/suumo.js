/**
 * 駐車場代表示 Chrome拡張 - Suumo アダプター
 */
(function (global) {
  'use strict';
  const ParkingExt = global.ParkingExt || {};
  const config = ParkingExt.config || {};
  const utils = ParkingExt.utils || {};
  const registry = ParkingExt.adapterRegistry || {};

  const CACHE_KEY = (config.CACHE_KEY_PREFIX || 'parking-ext-cache-') + 'suumo';
  const CACHE_EXPIRE_DAYS = config.CACHE_EXPIRE_DAYS || 7;
  const feeClass = config.PARKING_FEE_CLASS || 'parking-ext-fee';
  const processedAttr = config.PROCESSED_ATTR || 'data-parking-ext-processed';
  const numAttr = config.PARKING_NUM_ATTR || 'data-parking-ext-num';

  /** localStorage から駐車場代のキャッシュを取得する（有効期限内のみ） */
  function getCachedParking(jncId) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      const item = cache[jncId];
      if (
        item &&
        Date.now() - item.timestamp <
          CACHE_EXPIRE_DAYS * 24 * 60 * 60 * 1000
      ) {
        return item.value;
      }
    } catch (_) {}
    return null;
  }

  /** 駐車場代を localStorage にキャッシュする */
  function setCachedParking(jncId, value) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      cache[jncId] = { value, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  /** 米印（※）以下の注釈文言を削除する（一覧表示用） */
  function stripFootnote(text) {
    if (!text) return text;
    const idx = String(text).indexOf('※');
    return idx >= 0 ? String(text).substring(0, idx).trim() : String(text).trim();
  }

  /** 物件詳細ページの HTML から駐車場代のテキストを抽出する */
  function parseParkingFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const thElements = doc.querySelectorAll('th');
    for (const th of thElements) {
      if (th.textContent.trim() === '駐車場') {
        const nextCell = th.nextElementSibling;
        if (nextCell && nextCell.tagName === 'TD') {
          return stripFootnote(nextCell.textContent.trim()) || '-';
        }
        const td = th.parentElement?.querySelector('td');
        if (td) return stripFootnote(td.textContent.trim()) || '-';
      }
    }
    const m = html.match(/駐車場[\s\S]{0,100}?<t[dh][^>]*>([^<]*)<\/t[dh]>/i);
    if (m) return stripFootnote(m[1].trim()) || '-';
    const m2 = html.match(/駐車場[^0-9]*([0-9０-９万]+円?)/);
    if (m2) return m2[1] + (m2[0].includes('円') ? '' : '円');
    return null;
  }

  /** 物件詳細ページを fetch し、駐車場代を取得する（キャッシュがあればそれを返す） */
  function fetchParkingFee(detailUrl) {
    const match = detailUrl.match(/jnc_(\d+)/);
    const jncId = match ? match[1] : null;
    if (!jncId) return Promise.resolve(null);

    const cached = getCachedParking(jncId);
    if (cached !== null) return Promise.resolve(cached);

    return fetch(detailUrl, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    })
      .then((res) => (res.ok ? res.text() : null))
      .then((html) => {
        if (!html) return null;
        const parking = parseParkingFromHtml(html);
        if (parking !== null) setCachedParking(jncId, parking);
        return parking;
      })
      .catch(() => null);
  }

  /** 賃料/管理費を表示しているセル（td）を取得する。駐車場代を追加する挿入先 */
  function getRentCell(row) {
    if (!row) return null;
    const table = row.closest('table');
    if (!table) return null;
    const headerRow = table.querySelector('tr');
    if (!headerRow) return null;
    const headers = headerRow.querySelectorAll('th, td');
    let rentIdx = -1;
    headers.forEach((h, i) => {
      const t = (h.textContent || '').trim();
      if (t.includes('賃料') || t.includes('家賃')) rentIdx = i;
    });
    if (rentIdx >= 0) {
      const cells = row.querySelectorAll('td');
      if (cells[rentIdx]) return cells[rentIdx];
    }
    const cells = row.querySelectorAll('td');
    return cells[0] || null;
  }

  /** 駐車場代 span が属する行（tr）と、建物ごと表示時の左パネル対応要素（cassetteitem_item）を取得する */
  function getRowAndItem(span) {
    const row = span.closest('tr');
    if (!row) return { row: null, item: null };
    const cassette = row.closest('.cassetteitem, [class*="cassetteitem"]');
    const item =
      cassette?.querySelector('.cassetteitem_item, [class*="cassetteitem_item"]') ||
      row;
    return { row, item };
  }

  const suumoAdapter = {
    name: 'suumo',
    urlPatterns: [
      /suumo\.jp\/chintai\//,
      /suumo\.jp\/j\/chintai\//,
      /suumo\.jp\/jj\/chintai\//,
    ],

    /** 表ヘッダーを「賃料/管理費」→「賃料/管理費」+改行+「駐車場代」に変更する */
    init() {
      document.querySelectorAll('th').forEach((th) => {
        if (
          th.textContent.trim() === '賃料/管理費' &&
          !th.dataset.parkingExtHeaderUpdated
        ) {
          th.innerHTML = '賃料/管理費<br>駐車場代';
          th.dataset.parkingExtHeaderUpdated = '1';
        }
      });
    },

    /** 一覧ページから、各部屋の行要素と詳細ページ URL のペアを取得する
     * 各行に含まれる jnc_ リンクを直接取得し、正しい部屋と詳細ページを対応付ける */
    getRoomEntries() {
      const entries = [];
      const rowSeen = new Set();
      document.querySelectorAll('table').forEach((table) => {
        const headerText = (table.querySelector('tr')?.textContent || '');
        if (!headerText.includes('賃料') && !headerText.includes('家賃'))
          return;
        const dataRows = Array.from(table.querySelectorAll('tr')).filter(
          (r) => r.querySelector('td')
        );
        if (dataRows.length === 0) return;
        const card =
          table.closest('.cassetteitem, [class*="cassetteitem"]') ||
          table.closest('div');
        if (!card) return;
        dataRows.forEach((row) => {
          if (rowSeen.has(row)) return;
          const rentCell = getRentCell(row);
          if (!rentCell) return;
          const link = row.querySelector('a[href*="jnc_"]');
          const m = link ? (link.getAttribute('href') || '').match(/jnc_(\d+)/) : null;
          if (!m) return;
          const jncId = m[1];
          rowSeen.add(row);
          const href = link.getAttribute('href') || '';
          const absUrl = href
            ? new URL(href, location.href).href
            : 'https://suumo.jp/j/chintai/jnc_' + jncId + '/';
          entries.push({ row, url: absUrl });
        });
      });
      return entries;
    },

    /** 部屋行に駐車場代を取得・表示し、取得完了時に onParkingFetched を呼ぶ */
    processRoomRow(row, detailUrl, onParkingFetched) {
      if (row.getAttribute(processedAttr)) return;
      const rentCell = getRentCell(row);
      if (!rentCell) {
        row.setAttribute(processedAttr, '1');
        onParkingFetched();
        return;
      }
      if (rentCell.querySelector(`.${feeClass}`)) {
        row.setAttribute(processedAttr, '1');
        onParkingFetched();
        return;
      }

      const span = document.createElement('span');
      span.className = feeClass;
      span.textContent = '取得中...';
      span.title = '駐車場代（詳細ページから取得）';
      const wrapper = document.createElement('div');
      wrapper.className = config.PARKING_WRAPPER_CLASS || 'parking-ext-in-rent';
      wrapper.appendChild(span);
      rentCell.appendChild(wrapper);

      row.setAttribute(processedAttr, '1');
      fetchParkingFee(detailUrl).then((parking) => {
        span.textContent = parking !== null ? parking : '取得失敗';
        const num =
          (suumoAdapter.parseParkingToNumber || utils.parseParkingToNumber)(
            span.textContent
          );
        span.setAttribute(numAttr, num !== null ? String(num) : '');
        row.setAttribute(numAttr, span.getAttribute(numAttr));
        span.title =
          num !== null
            ? `駐車場代: ${span.textContent} (比較用: ${num}円)`
            : '駐車場代: 不明';
        onParkingFetched();
      });
    },

    getRowAndItem,
    getRentCell,
    parseParkingToNumber: utils.parseParkingToNumber,
  };

  /** 絞り込み表示時に、建物単位で非表示にする対象のコンテナ要素を取得する */
  suumoAdapter.getBuildingContainers = function () {
    const containers = [];
    document
      .querySelectorAll('.cassetteitem, [class*="cassetteitem"]')
      .forEach((c) => {
        if (c.querySelector('table') && !containers.includes(c))
          containers.push(c);
      });
    return containers;
  };

  /** 建物コンテナ内の部屋行（表示/非表示の対象）を取得する */
  suumoAdapter.getRoomElementsInBuilding = function (container) {
    const table = container.querySelector('table');
    if (!table) return [];
    const rows = table.querySelectorAll('tr');
    return Array.from(rows).filter((r) => r.querySelector('td'));
  };

  registry.register(suumoAdapter);
})(typeof window !== 'undefined' ? window : this);
