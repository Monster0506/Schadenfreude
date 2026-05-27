const itemBase = {
  _timer: null,
  _dismiss: null,
  _rxTimer: null,
  _rxDismiss: null,
  _queue: 0,
  _clearTimer() { clearTimeout(this._timer); this._timer = null; },
  _clearMsg()   { if (this._dismiss) { this._dismiss(); this._dismiss = null; } },
  _showMsg(text) { this._dismiss = showMsg(text); },
  _rxClear() {
    clearTimeout(this._rxTimer); this._rxTimer = null;
    if (this._rxDismiss) { this._rxDismiss(); this._rxDismiss = null; }
  },
  _tryBuy() {
    const cost = DEBUG ? 0 : this.cost;
    if (gold < cost) return false;
    gold -= cost;
    goldEl.textContent = gold;
    return true;
  },
  _updateBtn() {
    const btn = document.getElementById('store-' + this._key);
    if (!btn) return;
    const label = btn.querySelector('.store-label');
    if (!label) return;
    label.textContent = this._queue > 0 ? this.label + ' [+' + this._queue + ']' : this.label;
  },
  reset() {
    this._queue = 0;
    this.deactivate();
  },
};

function makeItem(def) {
  return Object.assign(Object.create(itemBase), def);
}

const STORE_ITEMS = {
  peek: makeItem({
    label: 'PEEK', cost: 1, cat: 'intel',
    active: false,
    _targetedUntil: 0,
    _activate() {
      this.active = true;
      sendWS({ type: 'peek' });
      this._clearMsg();
      this._showMsg('[peeking...]');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[peek queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._targetedUntil = 0;
      this._clearTimer();
      this._clearMsg();
      for (const [id] of opponents) {
        const canvas = document.getElementById('peek-canvas-' + id);
        if (canvas) canvas.classList.add('hidden');
      }
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'peek') {
        this._targetedUntil = Date.now() + 11000;
        sendBoardState();
        const dismiss = showMsg('[' + msg.id + ' is peeking]');
        setTimeout(dismiss, 10000);
      } else if (msg.type === 'board_state' && this.active) {
        renderPeekBoard(msg.id, msg.board);
      }
    },
  }),

  shield: makeItem({
    label: 'SHIELD', cost: 2, cat: 'defense',
    active: false,
    _activate() {
      this.active = true;
      this._clearMsg();
      const q = this._queue > 0 ? ' (+' + this._queue + ')' : '';
      this._showMsg('[shield active' + q + ']');
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._clearMsg();
        this._showMsg('[shield active (+' + this._queue + ')]');
        this._updateBtn();
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearMsg();
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'attack') {
        if (this.active) {
          this.deactivate();
          showMsg('[attack blocked by shield!]');
        } else if (inGame && !gameOver) {
          applyAttack();
        }
      }
    },
  }),

  slide_denied: makeItem({
    label: 'SLIDE DENIED', cost: 4, cat: 'offense',
    msgType: 'slide_denied',
    active: false,
    _activate() {
      this.active = true;
      sendWS({ type: 'slide_denied' });
      this._clearMsg();
      this._showMsg('[slide denied sent]');
      this._timer = setTimeout(() => this.deactivate(), 8000);
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[slide denied queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      dasEnabled = true;
      wallKicksEnabled = true;
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'slide_denied' && inGame && !gameOver) {
        this._rxClear();
        dasEnabled = false;
        wallKicksEnabled = false;
        clearAllDAS();
        this._rxDismiss = showMsg('[SLIDE DENIED - 8s]');
        this._rxTimer = setTimeout(() => {
          dasEnabled = true;
          wallKicksEnabled = true;
          this._rxClear();
        }, 8000);
      }
    },
  }),

  zero_friction: makeItem({
    label: 'ZERO FRICTION', cost: 5, cat: 'offense',
    msgType: 'zero_friction',
    active: false,
    _activate() {
      this.active = true;
      sendWS({ type: 'zero_friction' });
      this._clearMsg();
      this._showMsg('[zero friction sent]');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[zero friction queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      zeroFriction = false;
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'zero_friction' && inGame && !gameOver) {
        this._rxClear();
        zeroFriction = true;
        this._rxDismiss = showMsg('[ZERO FRICTION - 10s]');
        this._rxTimer = setTimeout(() => {
          zeroFriction = false;
          this._rxClear();
        }, 10000);
      }
    },
  }),

  mag_column: makeItem({
    label: 'MAG COL', cost: 5, cat: 'offense',
    msgType: 'mag_column',
    active: false,
    _activate() {
      const col = Math.floor(Math.random() * COLS);
      this.active = true;
      sendWS({ type: 'mag_column', col });
      this._clearMsg();
      this._showMsg('[magnet: col ' + (col + 1) + ' sent]');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[mag col queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      magColActive = false;
      magColIndex = -1;
      magCaught = false;
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'mag_column' && inGame && !gameOver) {
        this._rxClear();
        magColActive = true;
        magColIndex = msg.col ?? 0;
        this._rxDismiss = showMsg('[MAGNET: col ' + (magColIndex + 1) + ' - 10s]');
        this._rxTimer = setTimeout(() => {
          magColActive = false;
          magColIndex = -1;
          magCaught = false;
          this._rxClear();
        }, 10000);
      }
    },
  }),

  qscan: makeItem({
    label: 'Q-SCAN', cost: 2, cat: 'intel',
    msgType: 'queue_scan',
    active: false,
    _targetedUntil: 0,
    _activate() {
      this.active = true;
      sendWS({ type: 'queue_scan' });
      this._clearMsg();
      this._showMsg('[queue scanner active for 15s]');
      this._timer = setTimeout(() => this.deactivate(), 15000);
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[q-scan queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._targetedUntil = 0;
      this._clearTimer();
      this._clearMsg();
      for (const [id] of opponents) {
        const canvas = document.getElementById('qscan-canvas-' + id);
        const goldDiv = document.getElementById('qscan-gold-' + id);
        if (canvas) canvas.classList.add('hidden');
        if (goldDiv) { goldDiv.classList.add('hidden'); goldDiv.textContent = ''; }
      }
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'queue_scan' && inGame && !gameOver) {
        this._targetedUntil = Date.now() + 16000;
        sendQueueData();
      } else if (msg.type === 'queue_data' && this.active) {
        renderQueueScan(msg.id, msg.pieces || [], msg.gold ?? 0);
      }
    },
  }),
};

function applyAttack() {
  board.splice(0, 1);
  const gap = Math.floor(Math.random() * COLS);
  const row = new Array(COLS).fill(1);
  row[gap] = 0;
  board.push(row);
  showMsg('[attack received!]');
}

const STORE_CAT_ORDER = ['intel', 'defense', 'offense'];

function buildStore() {
  const container = document.getElementById('store');
  container.innerHTML = '';

  const grouped = {};
  for (const [id, item] of Object.entries(STORE_ITEMS)) {
    item._key = id;
    const cat = item.cat || 'misc';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push([id, item]);
  }

  const catOrder = [
    ...STORE_CAT_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !STORE_CAT_ORDER.includes(c)),
  ];

  for (const cat of catOrder) {
    const header = document.createElement('div');
    header.className = 'store-cat';
    header.textContent = cat.toUpperCase();
    container.appendChild(header);

    for (const [id, item] of grouped[cat]) {
      const btn = document.createElement('button');
      btn.className = 'store-btn';
      btn.id = 'store-' + id;
      btn.dataset.cat = cat;
      const label = document.createElement('span');
      label.className = 'store-label';
      label.textContent = item.label;
      const cost = document.createElement('span');
      cost.className = 'store-cost';
      cost.textContent = (DEBUG ? 0 : item.cost) + 'g';
      btn.appendChild(label);
      btn.appendChild(cost);
      btn.addEventListener('click', () => item.buy());
      container.appendChild(btn);
    }
  }
}
