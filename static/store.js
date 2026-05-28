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
  _setActive(on) {
    const btn = document.getElementById('store-' + this._key);
    if (!btn) return;
    if (on) btn.classList.add('item-active');
    else btn.classList.remove('item-active');
  },
  reset() {
    this._queue = 0;
    this.deactivate();
  },
};

function pickTarget() {
  const ids = [...opponents.keys()].filter(id => !opponents.get(id).gameOver);
  if (ids.length === 0) return null;
  return ids[Math.floor(Math.random() * ids.length)];
}

function makeItem(def) {
  return Object.assign(Object.create(itemBase), def);
}

const STORE_ITEMS = {
  peek: makeItem({
    label: 'PEEK', cost: 1, cat: 'intel',
    msgType: 'peek',
    active: false,
    _targetedUntil: 0,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'peek', target });
      this._clearMsg();
      this._showMsg('[peeking -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
    },
    buy() {
      if (!pickTarget()) return;
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

  loss_protection: makeItem({
    label: 'LOSS PROTECTION', cost: 3, cat: 'defensive',
    tip: 'Keep 50% of your gold if you top out while active.',
    active: false,
    _activate() {
      this.active = true;
      lossProtectionActive = true;
      this._clearMsg();
      this._showMsg('[loss protection active]');
      this._setActive(true);
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[loss protection queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      lossProtectionActive = false;
      lossProtectionGold = 0;
      this._clearMsg();
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage() {},
  }),

  the_drill: makeItem({
    label: 'THE DRILL', cost: 4, cat: 'defensive',
    tip: 'Instantly destroys up to 3 solid concrete rows from the bottom of your stack.',
    active: false,
    _activate() {
      let drilled = 0;
      for (let r = ROWS - 1; r >= 0 && drilled < 3; r--) {
        if (board[r].some(v => v === 9)) {
          board.splice(r, 1);
          board.unshift(new Array(COLS).fill(0));
          drilled++;
          r++;
        }
      }
      const msg = drilled > 0 ? '[drilled ' + drilled + ' row' + (drilled > 1 ? 's' : '') + ']' : '[no concrete rows]';
      showMsg(msg);
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      this._activate();
    },
    deactivate() {
      this._updateBtn();
    },
    onMessage() {},
  }),

  slide_denied: makeItem({
    label: 'SLIDE DENIED', cost: 4, cat: 'offense',
    msgType: 'slide_denied',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'slide_denied', target });
      this._clearMsg();
      this._showMsg('[slide denied -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 8000);
      this._updateBtn();
    },
    buy() {
      if (!pickTarget()) return;
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
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'zero_friction', target });
      this._clearMsg();
      this._showMsg('[zero friction -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
    },
    buy() {
      if (!pickTarget()) return;
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
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      const col = Math.floor(Math.random() * COLS);
      this.active = true;
      sendWS({ type: 'mag_column', col, target });
      this._clearMsg();
      this._showMsg('[magnet col ' + (col + 1) + ' -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
    },
    buy() {
      if (!pickTarget()) return;
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
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'queue_scan', target });
      this._clearMsg();
      this._showMsg('[q-scan -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 15000);
      this._updateBtn();
    },
    buy() {
      if (!pickTarget()) return;
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
      const tierClass = item.cost <= 5 ? 'tier-low' : item.cost <= 12 ? 'tier-mid' : 'tier-high';
      cost.className = 'store-cost ' + tierClass;
      cost.textContent = (DEBUG ? 0 : item.cost) + 'g';
      if (item.tip) btn.dataset.tip = item.tip;
      btn.appendChild(label);
      btn.appendChild(cost);
      btn.addEventListener('click', () => item.buy());
      container.appendChild(btn);
    }
  }
}
