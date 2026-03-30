/**
 * 駐車場代表示 Chrome拡張 - コアロジック（フィルターUI・適用）
 * アダプターに依存する共通処理
 */
(function (global) {
  'use strict';
  const ParkingExt = global.ParkingExt || {};
  const config = ParkingExt.config || {};
  const utils = ParkingExt.utils || {};

  // 駐車場代フィルターの状態（下限・上限・表示モード）
  let filterState = {
    min: null,
    max: null,
    mode: 'highlight', // 'highlight': 強調表示, 'filter': 絞り込み表示
  };

  /** @type {'expanded'|'compact'|'minimal'} */
  let panelView = 'expanded';

  let progressDone = 0;
  let progressTotal = 0;

  function loadPanelView() {
    try {
      const raw = localStorage.getItem(
        config.PANEL_VIEW_KEY || 'parking-ext-panel-view'
      );
      if (raw === 'compact' || raw === 'minimal' || raw === 'expanded') {
        panelView = raw;
      }
    } catch (_) {}
  }

  function savePanelView() {
    try {
      localStorage.setItem(
        config.PANEL_VIEW_KEY || 'parking-ext-panel-view',
        panelView
      );
    } catch (_) {}
  }

  /** 進捗表示を更新する（done / total は main から渡す） */
  function setFetchProgress(done, total) {
    progressDone = Math.max(0, done);
    progressTotal = Math.max(0, total);

    const labelEl = document.getElementById('parking-ext-progress-label');
    const barEl = document.getElementById('parking-ext-progress-bar');
    const compactProg = document.getElementById('parking-ext-compact-progress');

    const pct =
      progressTotal > 0
        ? Math.min(100, (progressDone / progressTotal) * 100)
        : 0;
    let text = '駐車場代を取得: —';
    if (progressTotal > 0) {
      text = `駐車場代を取得: ${progressDone} / ${progressTotal}${
        progressDone >= progressTotal ? '（完了）' : ''
      }`;
    }

    if (labelEl) labelEl.textContent = text;
    if (barEl) barEl.style.width = `${pct}%`;
    if (compactProg) {
      compactProg.textContent =
        progressTotal > 0 ? `${progressDone}/${progressTotal}` : '—';
    }
  }

  /** パネル表示モードを切り替え、DOM と localStorage を反映する */
  function applyPanelView() {
    const panel = document.getElementById('parking-ext-filter-panel');
    if (!panel) return;

    panel.classList.remove(
      'parking-ext-view-expanded',
      'parking-ext-view-compact',
      'parking-ext-view-minimal'
    );
    panel.classList.add(`parking-ext-view-${panelView}`);

    const headerFull = document.getElementById('parking-ext-header-full');
    const headerCompact = document.getElementById('parking-ext-header-compact');
    const body = document.getElementById('parking-ext-panel-body');
    const minimalWrap = document.getElementById('parking-ext-panel-minimal');

    if (headerFull) headerFull.hidden = panelView !== 'expanded';
    if (headerCompact) headerCompact.hidden = panelView !== 'compact';
    if (body) body.hidden = panelView !== 'expanded';
    if (minimalWrap) minimalWrap.hidden = panelView !== 'minimal';

    savePanelView();
    setFetchProgress(progressDone, progressTotal);
  }

  function setPanelView(view) {
    if (view !== 'expanded' && view !== 'compact' && view !== 'minimal') return;
    panelView = view;
    applyPanelView();
  }

  /** フィルター設定を localStorage に保存する（リロード後も復元） */
  function saveFilterState() {
    try {
      localStorage.setItem(
        config.FILTER_STATE_KEY || 'parking-ext-filter-state',
        JSON.stringify(filterState)
      );
    } catch (_) {}
  }

  /** localStorage からフィルター設定を読み込む */
  function loadFilterState() {
    try {
      const saved = localStorage.getItem(
        config.FILTER_STATE_KEY || 'parking-ext-filter-state'
      );
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          filterState.min = parsed.min ?? null;
          filterState.max = parsed.max ?? null;
          filterState.mode = parsed.mode === 'filter' ? 'filter' : 'highlight';
        }
      }
    } catch (_) {}
  }

  /**
   * 駐車場代フィルターを適用する
   * 強調表示: 条件に合う行を緑、合わない行を赤で表示
   * 絞り込み表示: 条件に合う行のみ表示し、合う部屋が1つもない建物は非表示
   */
  function applyFilter(adapter) {
    if (!adapter) return;
    const { min, max, mode } = filterState;
    const hasFilter = (min !== null && min !== '') || (max !== null && max !== '');
    let minNum = hasFilter && min ? parseInt(min, 10) : 0;
    let maxNum = hasFilter && max ? parseInt(max, 10) : Infinity;
    if (isNaN(minNum)) minNum = 0;
    if (isNaN(maxNum)) maxNum = Infinity;
    if (minNum > maxNum) [minNum, maxNum] = [maxNum, minNum];

    const feeClass = config.PARKING_FEE_CLASS || 'parking-ext-fee';
    const numAttr = config.PARKING_NUM_ATTR || 'data-parking-ext-num';
    const parseParkingToNumber =
      adapter.parseParkingToNumber || utils.parseParkingToNumber;

    /** 建物カード（item）は複数部屋で共有されるため、いずれかの部屋が条件を満たせば表示する */
    const itemMatchMap = new Map();

    document.querySelectorAll(`.${feeClass}`).forEach((span) => {
      const { row, item } = adapter.getRowAndItem(span);
      if (!row) return;
      const numStr = span.getAttribute(numAttr);
      const num =
        numStr !== undefined && numStr !== ''
          ? parseInt(numStr, 10)
          : null;
      const match =
        !hasFilter ||
        (num !== null && !isNaN(num) && num >= minNum && num <= maxNum);

      row.classList.remove('parking-ext-match', 'parking-ext-nomatch');
      if (mode === 'highlight') {
        row.style.display = '';
        if (hasFilter)
          row.classList.add(match ? 'parking-ext-match' : 'parking-ext-nomatch');
      } else {
        row.style.display = match ? '' : 'none';
      }

      if (item && item !== row) {
        itemMatchMap.set(item, (itemMatchMap.get(item) || false) || match);
      }
    });

    itemMatchMap.forEach((hasMatch, item) => {
      item.classList.remove('parking-ext-match', 'parking-ext-nomatch');
      if (mode === 'highlight') {
        item.style.display = '';
        if (hasFilter)
          item.classList.add(hasMatch ? 'parking-ext-match' : 'parking-ext-nomatch');
      } else {
        item.style.display = hasMatch ? '' : 'none';
      }
    });

    if (mode === 'filter' && hasFilter && adapter.getBuildingContainers) {
      const containers = adapter.getBuildingContainers();
      const getRoomElements =
        adapter.getRoomElementsInBuilding ||
        ((c) => Array.from(c.querySelectorAll('tr')).filter((r) => r.querySelector('td')));
      containers.forEach((container) => {
        const roomElements = getRoomElements(container);
        const anyVisible = roomElements.some((el) => el.style.display !== 'none');
        container.style.display = anyVisible ? '' : 'none';
      });
    } else if (adapter.getBuildingContainers) {
      adapter.getBuildingContainers().forEach((c) => {
        c.style.display = '';
      });
    }
  }

  /**
   * 駐車場代フィルター用の UI パネルを画面右上に作成する
   * 入力・選択時に即時反映される（適用ボタンなし）
   */
  function createFilterUI(adapter, onApply) {
    if (document.getElementById('parking-ext-filter-panel')) return;

    loadPanelView();

    const panel = document.createElement('div');
    panel.id = 'parking-ext-filter-panel';
    panel.className = 'parking-ext-filter-panel';
    panel.innerHTML = `
      <div class="parking-ext-header-full" id="parking-ext-header-full">
        <div class="parking-ext-panel-title-row">
          <span class="parking-ext-filter-title">駐車場代で絞り込み</span>
          <div class="parking-ext-panel-header-btns">
            <button type="button" class="parking-ext-panel-icon-btn" id="parking-ext-btn-to-compact" title="コンパクト表示" aria-label="コンパクト表示">▁</button>
            <button type="button" class="parking-ext-panel-icon-btn" id="parking-ext-btn-to-minimal-from-expanded" title="最小化" aria-label="最小化">◎</button>
          </div>
        </div>
      </div>
      <div class="parking-ext-header-compact" id="parking-ext-header-compact" hidden>
        <span class="parking-ext-compact-title">駐車場フィルター</span>
        <span id="parking-ext-compact-progress" class="parking-ext-compact-progress">—</span>
        <button type="button" class="parking-ext-panel-icon-btn" id="parking-ext-btn-to-expanded" title="展開" aria-label="展開">＋</button>
        <button type="button" class="parking-ext-panel-icon-btn" id="parking-ext-btn-to-minimal-from-compact" title="最小化" aria-label="最小化">◎</button>
      </div>
      <div class="parking-ext-panel-minimal" id="parking-ext-panel-minimal" hidden>
        <button type="button" class="parking-ext-minimal-fab" id="parking-ext-minimal-fab" title="駐車場フィルターを表示" aria-label="コンパクト表示">▲</button>
      </div>
      <div class="parking-ext-panel-body" id="parking-ext-panel-body">
        <div id="parking-ext-progress-row" class="parking-ext-progress-row">
          <div id="parking-ext-progress-label" class="parking-ext-progress-label"></div>
          <div class="parking-ext-progress-bar-wrap">
            <div id="parking-ext-progress-bar" class="parking-ext-progress-bar"></div>
          </div>
        </div>
        <div class="parking-ext-filter-row">
          <input type="number" id="parking-ext-min" placeholder="下限(円)" min="0" step="1000">
          <span>〜</span>
          <input type="number" id="parking-ext-max" placeholder="上限(円)" min="0" step="1000">
        </div>
        <div id="parking-ext-range-display" class="parking-ext-range-display"></div>
        <div class="parking-ext-filter-row parking-ext-mode-row">
          <span class="parking-ext-mode-label">表示モード:</span>
          <label class="parking-ext-mode-option" data-mode="highlight">
            <input type="radio" name="parking-ext-mode" value="highlight" checked>
            <span>強調表示</span>
          </label>
          <label class="parking-ext-mode-option" data-mode="filter">
            <input type="radio" name="parking-ext-mode" value="filter">
            <span>絞り込み表示</span>
          </label>
        </div>
        <div id="parking-ext-mode-status" class="parking-ext-mode-status">現在: 強調表示</div>
      </div>
    `;

    document.body.appendChild(panel);

    function wireBtn(id, fn) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    }
    wireBtn('parking-ext-btn-to-compact', () => setPanelView('compact'));
    wireBtn('parking-ext-btn-to-minimal-from-expanded', () =>
      setPanelView('minimal')
    );
    wireBtn('parking-ext-btn-to-expanded', () => setPanelView('expanded'));
    wireBtn('parking-ext-btn-to-minimal-from-compact', () =>
      setPanelView('minimal')
    );
    wireBtn('parking-ext-minimal-fab', () => setPanelView('compact'));

    applyPanelView();
    setFetchProgress(progressDone, progressTotal);

    const minInput = document.getElementById('parking-ext-min');
    const maxInput = document.getElementById('parking-ext-max');
    const modeStatusEl = document.getElementById('parking-ext-mode-status');

    loadFilterState();
    if (filterState.min) minInput.value = filterState.min;
    if (filterState.max) maxInput.value = filterState.max;
    const modeRadio = document.querySelector(
      `input[name="parking-ext-mode"][value="${filterState.mode}"]`
    );
    if (modeRadio) modeRadio.checked = true;

    /** 選択中のモードに応じてラベルとステータス表示を更新する */
    function updateModeVisual() {
      const checked = document.querySelector('input[name="parking-ext-mode"]:checked');
      const mode = (checked && checked.value) || 'highlight';
      document.querySelectorAll('.parking-ext-mode-option').forEach((label) => {
        label.classList.toggle('parking-ext-mode-selected', label.dataset.mode === mode);
      });
      if (modeStatusEl) {
        modeStatusEl.textContent = mode === 'highlight' ? '現在: 強調表示（条件外は薄く表示）' : '現在: 絞り込み表示（条件外は非表示）';
      }
    }

    /** 入力値を filterState に反映し、フィルターを再適用する */
    const updateAndApply = () => {
      const minVal = minInput.value.trim();
      const maxVal = maxInput.value.trim();
      filterState.min = minVal || null;
      filterState.max = maxVal || null;
      const modeRadioChecked = document.querySelector(
        'input[name="parking-ext-mode"]:checked'
      );
      filterState.mode =
        (modeRadioChecked && modeRadioChecked.value) || 'highlight';
      const rangeEl = document.getElementById('parking-ext-range-display');
      if (rangeEl && (filterState.min || filterState.max)) {
        const min = filterState.min ? parseInt(filterState.min, 10) : 0;
        const max = filterState.max ? parseInt(filterState.max, 10) : Infinity;
        rangeEl.textContent = `${min.toLocaleString()}円 〜 ${
          max === Infinity ? '上限なし' : max.toLocaleString() + '円'
        }`;
        rangeEl.style.display = '';
      } else if (rangeEl) {
        rangeEl.textContent = '';
        rangeEl.style.display = 'none';
      }
      updateModeVisual();
      saveFilterState();
      onApply();
    };

    updateAndApply();

    minInput.addEventListener('input', updateAndApply);
    maxInput.addEventListener('input', updateAndApply);
    document
      .querySelectorAll('input[name="parking-ext-mode"]')
      .forEach((r) => r.addEventListener('change', updateAndApply));
  }

  ParkingExt.core = {
    filterState: () => filterState,
    saveFilterState,
    loadFilterState,
    applyFilter,
    createFilterUI,
    setFetchProgress,
    setPanelView,
  };
})(typeof window !== 'undefined' ? window : this);
