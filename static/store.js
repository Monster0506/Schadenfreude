function disableStore() {
  document.querySelectorAll('.store-btn').forEach(b => { b.disabled = true; });
}

function enableStore() {
  document.querySelectorAll('.store-btn').forEach(b => { b.disabled = false; });
}

const itemBase = {
  _timer: null,
  _dismiss: null,
  _rxTimer: null,
  _rxDismiss: null,
  _clearTimer() { clearTimeout(this._timer); this._timer = null; },
  _clearMsg()   { if (this._dismiss) { this._dismiss(); this._dismiss = null; } },
  _showMsg(text) { this._dismiss = showMsg(text); },
  _rxClear() {
    clearTimeout(this._rxTimer); this._rxTimer = null;
    if (this._rxDismiss) { this._rxDismiss(); this._rxDismiss = null; }
  },
  _tryBuy() {
    const cost = DEBUG ? 0 : this.cost;
    if (gold < cost || this.active) return false;
    gold -= cost;
    goldEl.textContent = gold;
    return true;
  },
};

function makeItem(def) {
  return Object.assign(Object.create(itemBase), def);
}

const STORE_ITEMS = {
  peek: makeItem({
    label: 'PEEK', cost: 1,
    active: false,
    _targetedUntil: 0,
    buy() {
      if (!this._tryBuy()) return;
      this.active = true;
      sendWS({ type: 'peek' });
      disableStore();
      this._showMsg('[peeking...]');
      this._timer = setTimeout(() => this.deactivate(), 10000);
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
      enableStore();
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
    label: 'SHIELD', cost: 2,
    active: false,
    buy() {
      if (!this._tryBuy()) return;
      this.active = true;
      this._clearMsg();
      this._showMsg('[shield active]');
    },
    deactivate() {
      this.active = false;
      this._clearMsg();
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
    label: 'SLIDE DENIED', cost: 4,
    msgType: 'slide_denied',
    active: false,
    buy() {
      if (!this._tryBuy()) return;
      this.active = true;
      sendWS({ type: 'slide_denied' });
      disableStore();
      this._showMsg('[slide denied sent]');
      this._timer = setTimeout(() => this.deactivate(), 8000);
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      dasEnabled = true;
      wallKicksEnabled = true;
      enableStore();
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
    label: 'ZERO FRICTION', cost: 5,
    msgType: 'zero_friction',
    active: false,
    buy() {
      if (!this._tryBuy()) return;
      this.active = true;
      sendWS({ type: 'zero_friction' });
      disableStore();
      this._showMsg('[zero friction sent]');
      this._timer = setTimeout(() => this.deactivate(), 10000);
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      zeroFriction = false;
      enableStore();
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
    label: 'MAG COL', cost: 5,
    msgType: 'mag_column',
    active: false,
    buy() {
      if (!this._tryBuy()) return;
      const col = Math.floor(Math.random() * COLS);
      this.active = true;
      sendWS({ type: 'mag_column', col });
      disableStore();
      this._showMsg('[magnet: col ' + (col + 1) + ' sent]');
      this._timer = setTimeout(() => this.deactivate(), 10000);
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      magColActive = false;
      magColIndex = -1;
      magCaught = false;
      enableStore();
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
    label: 'Q-SCAN', cost: 2,
    active: false,
    _targetedUntil: 0,
    buy() {
      if (!this._tryBuy()) return;
      this.active = true;
      sendWS({ type: 'queue_scan' });
      disableStore();
      this._showMsg('[queue scanner active for 15s]');
      this._timer = setTimeout(() => this.deactivate(), 15000);
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
      enableStore();
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

function buildStore() {
  const container = document.getElementById('store');
  container.innerHTML = '';
  for (const [id, item] of Object.entries(STORE_ITEMS)) {
    const btn = document.createElement('button');
    btn.className = 'store-btn';
    btn.id = 'store-' + id;
    btn.textContent = item.label + ' ' + (DEBUG ? '0' : item.cost) + 'g';
    btn.addEventListener('click', () => item.buy());
    container.appendChild(btn);
  }
}
