/**
 * 駐車場代表示 Chrome拡張 - エイブル アダプター
 */
(function (global) {
  'use strict';
  const ParkingExt = global.ParkingExt || {};
  const config = ParkingExt.config || {};
  const utils = ParkingExt.utils || {};
  const registry = ParkingExt.adapterRegistry || {};

  const CACHE_KEY = (config.CACHE_KEY_PREFIX || 'parking-ext-cache-') + 'able';
  const CACHE_EXPIRE_DAYS = config.CACHE_EXPIRE_DAYS || 7;
  const DELAY_MS = config.DELAY_MS || 500;
  const feeClass = config.PARKING_FEE_CLASS || 'parking-ext-fee';
  const processedAttr = config.PROCESSED_ATTR || 'data-parking-ext-processed';
  const numAttr = config.PARKING_NUM_ATTR || 'data-parking-ext-num';

  /** localStorage から駐車場代のキャッシュを取得する（有効期限内のみ） */
  function getCachedParking(bk) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      const item = cache[bk];
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
  function setCachedParking(bk, value) {
    try {
      const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      cache[bk] = { value, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
  }

  /** 米印（※）以下の注釈文言を削除する（一覧表示用） */
  function stripFootnote(text) {
    if (!text) return text;
    const idx = String(text).indexOf('※');
    return idx >= 0 ? String(text).substring(0, idx).trim() : String(text).trim();
  }

  /** テキストから駐車場代の金額部分を抽出する（カンマ区切り対応） */
  function extractParkingAmount(text) {
    if (!text) return null;
    const m1 = text.match(/有料駐車場[^（(]*[（(]([0-9０-９,，]+)\s*円\/月[）)]/);
    if (m1) return m1[1].replace(/[,，]/g, '') + '円';
    const m2 = text.match(/駐車場[^0-9]*([0-9０-９,，]+)\s*円/);
    if (m2) return m2[1].replace(/[,，]/g, '') + '円';
    return null;
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
          const raw = nextCell.textContent.trim() || '-';
          return extractParkingAmount(raw) || stripFootnote(raw);
        }
        const td = th.parentElement?.querySelector('td');
        if (td) {
          const raw = td.textContent.trim() || '-';
          return extractParkingAmount(raw) || stripFootnote(raw);
        }
      }
    }
    if (html.includes('無料駐車場')) return '無料';
    const extracted = extractParkingAmount(html);
    if (extracted) return extracted;
    const m3 = html.match(/駐車場[\s\S]{0,150}?([0-9０-９.．]+)\s*万\s*円/);
    if (m3) return m3[1] + '万円';
    const m4 = html.match(/駐車場[\s\S]{0,100}?<t[dh][^>]*>([^<]*)<\/t[dh]>/i);
    if (m4) return stripFootnote(m4[1].trim()) || '-';
    return null;
  }

  /** 物件詳細ページを fetch し、駐車場代を取得する（キャッシュがあればそれを返す） */
  function fetchParkingFee(detailUrl) {
    const match = detailUrl.match(/bk=([^&]+)/);
    const bk = match ? match[1] : null;
    if (!bk) return Promise.resolve(null);

    const cached = getCachedParking(bk);
    if (cached !== null) return Promise.resolve(cached);

    return fetch(detailUrl, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    })
      .then((res) => (res.ok ? res.text() : null))
      .then((html) => {
        if (!html) return null;
        const parking = parseParkingFromHtml(html);
        if (parking !== null) setCachedParking(bk, parking);
        return parking;
      })
      .catch(() => null);
  }

  /** 家賃管理費を表示しているセル（td）を取得する。駐車場代を追加する挿入先 */
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
      if (t.includes('家賃') || t.includes('賃料')) rentIdx = i;
    });
    if (rentIdx >= 0) {
      const cells = row.querySelectorAll('td');
      if (cells[rentIdx]) return cells[rentIdx];
    }
    const cells = row.querySelectorAll('td');
    return cells[0] || null;
  }

  /** セルに家賃らしい内容（万円・円・数値）が含まれるか */
  function hasRentData(cell) {
    if (!cell) return false;
    const t = (cell.textContent || '').trim();
    return /[0-9０-９][0-9０-９.,，]*\s*万?\s*円/.test(t) || /[0-9０-９]+\s*万/.test(t);
  }

  /** 駐車場代 span が属する行（tr）と、建物ごと表示時の対応要素を取得する */
  function getRowAndItem(span) {
    const row = span.closest('tr');
    if (!row) return { row: null, item: null };
    const building = row.closest('section, article, .property-card, [class*="bukken"], [class*="property"]') || row.closest('table')?.closest('div');
    return { row, item: row };
  }

  const ableAdapter = {
    name: 'able',
    urlPatterns: [
      /able\.co\.jp\/[a-z]+\/ensen\/\d+\/list\//,
      /able\.co\.jp\/[a-z]+\/area\/\d+\/list\//,
      /able\.co\.jp\/feature\/parking\//,
      /able\.co\.jp\/list\//,
    ],

    /** 表ヘッダーを「家賃管理費」→「家賃管理費」+改行+「駐車場代」に変更する */
    init() {
      document.querySelectorAll('th').forEach((th) => {
        const t = th.textContent.trim();
        if (
          (t === '家賃管理費' || t === '賃料/管理費') &&
          !th.dataset.parkingExtHeaderUpdated
        ) {
          th.innerHTML = (t === '家賃管理費' ? '家賃<br>管理費' : '賃料/管理費') + '<br>駐車場代';
          th.dataset.parkingExtHeaderUpdated = '1';
        }
      });
    },

    /** 一覧ページから、各部屋の行要素と詳細ページ URL のペアを取得する
     * 各行に含まれる bk リンクを直接取得し、正しい部屋と詳細ページを対応付ける */
    getRoomEntries() {
      const detailBase = 'https://www.able.co.jp/detail/Detail.do?';
      const entries = [];
      const rowSeen = new Set();
      document.querySelectorAll('table').forEach((table) => {
        const headerText = (table.querySelector('tr')?.textContent || '');
        if (!headerText.includes('家賃') && !headerText.includes('賃料')) return;
        const dataRows = Array.from(table.querySelectorAll('tr')).filter((r) => r.querySelector('td'));
        if (dataRows.length === 0) return;
        let card = table.parentElement;
        while (card && !card.querySelector('a[href*="bk="]')) card = card.parentElement;
        if (!card) return;
        let rentRowIdx = 0;
        const bksInCard = [];
        card.querySelectorAll('a[href*="bk="]').forEach((a) => {
          const m = (a.getAttribute('href') || '').match(/bk=([^&]+)/);
          if (m && !bksInCard.includes(m[1])) bksInCard.push(m[1]);
        });
        dataRows.forEach((row) => {
          const rentCell = getRentCell(row);
          if (!rentCell || !hasRentData(rentCell)) return;
          if (rowSeen.has(row)) return;
          const link = row.querySelector('a[href*="bk="]');
          const m = link ? (link.getAttribute('href') || '').match(/bk=([^&]+)/) : null;
          const bk = m ? m[1] : bksInCard[Math.min(rentRowIdx, bksInCard.length - 1)];
          rentRowIdx += 1;
          rowSeen.add(row);
          entries.push({ row, url: detailBase + 'bk=' + bk });
        });
      });
      return entries;
    },

    /** 部屋行に駐車場代を取得・表示し、取得完了時に onParkingFetched を呼ぶ */
    processRoomRow(row, detailUrl, onParkingFetched) {
      if (row.getAttribute(processedAttr)) return;
      const rentCell = getRentCell(row);
      if (!rentCell || !hasRentData(rentCell)) {
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
        const num = (ableAdapter.parseParkingToNumber || utils.parseParkingToNumber)(
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
  ableAdapter.getBuildingContainers = function () {
    const containers = [];
    document.querySelectorAll('table').forEach((table) => {
      const headerRow = table.querySelector('tr');
      if (!headerRow) return;
      const headerText = headerRow.textContent || '';
      if (!headerText.includes('家賃') && !headerText.includes('賃料')) return;
      const parent = table.closest('section, article, div[class]') || table.parentElement;
      if (parent && !containers.includes(parent)) containers.push(parent);
    });
    return containers;
  };

  /** 建物コンテナ内の部屋行（表示/非表示の対象）を取得する */
  ableAdapter.getRoomElementsInBuilding = function (container) {
    const table = container.querySelector('table') || (container.tagName === 'TABLE' ? container : null);
    if (!table) return [];
    const rows = table.querySelectorAll('tr');
    return Array.from(rows).filter((r) => r.querySelector('td'));
  };

  registry.register(ableAdapter);
})(typeof window !== 'undefined' ? window : this);
