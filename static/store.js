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

  panic_button: makeItem({
    label: 'PANIC BUTTON', cost: 6, cat: 'defensive',
    tip: 'Instantly clears the bottom-most row, including indestructible blocks.',
    active: false,
    _activate() {
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r].some(v => v !== 0)) {
          board.splice(r, 1);
          board.unshift(new Array(COLS).fill(0));
          showMsg('[panic: bottom row cleared]');
          this._updateBtn();
          return;
        }
      }
      showMsg('[panic: board already empty]');
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      this._activate();
    },
    deactivate() { this._updateBtn(); },
    onMessage() {},
  }),

  clean_sweep: makeItem({
    label: 'CLEAN SWEEP', cost: 10, cat: 'defensive',
    tip: 'Removes your active piece and fills single-cell holes in your top 3 settled rows.',
    active: false,
    _activate() {
      piece = drawFromQueue();
      nextPiece = pieceQueue[0];
      holdUsed = false;

      let filled = 0;
      for (let r = 0; r < Math.min(3, ROWS); r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c] !== 0) continue;
          const neighbors = [
            r > 0 && board[r-1][c],
            r < ROWS-1 && board[r+1][c],
            c > 0 && board[r][c-1],
            c < COLS-1 && board[r][c+1],
          ].filter(v => v && v !== 0);
          if (neighbors.length >= 2) {
            board[r][c] = neighbors[Math.floor(Math.random() * neighbors.length)];
            filled++;
          }
        }
      }
      showMsg('[clean sweep: +' + filled + ' gap' + (filled !== 1 ? 's' : '') + ' filled]');
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      this._activate();
    },
    deactivate() { this._updateBtn(); },
    onMessage() {},
  }),

  equalizer: makeItem({
    label: 'EQUALIZER', cost: 12, cat: 'defensive',
    tip: "If any opponent has more gold than you, match their balance.",
    active: false,
    _activate() {
      let maxOppGold = 0;
      for (const [, opp] of opponents) {
        if (!opp.gameOver && (opp.gold ?? 0) > maxOppGold) maxOppGold = opp.gold ?? 0;
      }
      if (maxOppGold > gold) {
        gold = maxOppGold;
        goldEl.textContent = gold;
        showMsg('[equalized to ' + gold + 'g]');
      } else {
        showMsg('[already at max gold]');
      }
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      this._activate();
    },
    deactivate() { this._updateBtn(); },
    onMessage() {},
  }),

  emergency_evac: makeItem({
    label: 'EMERGENCY EVAC', cost: 30, cat: 'defensive',
    tip: 'Clears bottom half of board, banks all floating gold, and gives 5s invulnerability.',
    active: false,
    _activate() {
      let banked = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r][c] === 8) { banked++; board[r][c] = 0; }
        }
      }
      for (let r = Math.floor(ROWS / 2); r < ROWS; r++) {
        board[r] = new Array(COLS).fill(0);
      }
      if (banked > 0) { gold += banked; goldEl.textContent = gold; }
      invulnUntil = Date.now() + 5000;
      showMsg('[EVAC: cleared + ' + banked + 'g banked + 5s shield]');
      this._updateBtn();
    },
    buy() {
      if (!this._tryBuy()) return;
      this._activate();
    },
    deactivate() { this._updateBtn(); },
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

  grid_shifter: makeItem({
    label: 'GRID SHIFTER', cost: 6, cat: 'offense',
    msgType: 'grid_shifter',
    tip: 'Shifts 3 random opponent rows left or right by 1, disrupting their stack.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'grid_shifter', target });
      this._clearMsg();
      this._showMsg('[grid shift -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 1000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[grid shifter queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'grid_shifter' && inGame && !gameOver) {
        const nonEmpty = [];
        for (let r = 0; r < ROWS; r++) {
          if (board[r].some(v => v !== 0)) nonEmpty.push(r);
        }
        const count = Math.min(3, nonEmpty.length);
        const chosen = [];
        while (chosen.length < count) {
          const idx = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
          if (!chosen.includes(idx)) chosen.push(idx);
        }
        chosen.forEach(r => {
          const dir = Math.random() < 0.5 ? -1 : 1;
          if (dir === -1) {
            board[r].shift();
            board[r].push(0);
          } else {
            board[r].pop();
            board[r].unshift(0);
          }
        });
        showMsg('[GRID SHIFTED]');
      }
    },
  }),

  double_tap: makeItem({
    label: 'DOUBLE TAP', cost: 7, cat: 'offense',
    msgType: 'double_tap',
    tip: 'Opponent inputs execute twice for 10 seconds.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'double_tap', target });
      this._clearMsg();
      this._showMsg('[double tap -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) {
        this._queue++;
        this._updateBtn();
        showMsg('[double tap queued x' + this._queue + ']');
        return;
      }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      doubleInputActive = false;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'double_tap' && inGame && !gameOver) {
        this._rxClear();
        doubleInputActive = true;
        this._rxDismiss = showMsg('[DOUBLE TAP - 10s]');
        this._rxTimer = setTimeout(() => {
          doubleInputActive = false;
          this._rxClear();
        }, 10000);
      }
    },
  }),

  latency_sim: makeItem({
    label: 'LATENCY SIM', cost: 8, cat: 'offense',
    msgType: 'latency_sim',
    tip: 'Adds a 250ms delay to all opponent inputs for 8 seconds.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'latency_sim', target });
      this._clearMsg();
      this._showMsg('[latency sim -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 8000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[latency queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      inputDelayMs = 0;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'latency_sim' && inGame && !gameOver) {
        this._rxClear();
        inputDelayMs = 250;
        this._rxDismiss = showMsg('[LATENCY - 8s]');
        this._rxTimer = setTimeout(() => { inputDelayMs = 0; this._rxClear(); }, 8000);
      }
    },
  }),

  stuck_key: makeItem({
    label: 'STUCK KEY', cost: 10, cat: 'offense',
    msgType: 'stuck_key',
    tip: 'Simulates a jammed Left or Right key on the opponent for 8 seconds.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'stuck_key', target });
      this._clearMsg();
      this._showMsg('[stuck key -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 8000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[stuck key queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      stuckKeyDir = 0;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'stuck_key' && inGame && !gameOver) {
        this._rxClear();
        stuckKeyDir = Math.random() < 0.5 ? -1 : 1;
        const dirName = stuckKeyDir === -1 ? 'LEFT' : 'RIGHT';
        this._rxDismiss = showMsg('[STUCK ' + dirName + ' - 8s]');
        this._rxTimer = setTimeout(() => { stuckKeyDir = 0; this._rxClear(); }, 8000);
      }
    },
  }),

  camouflage: makeItem({
    label: 'CAMOUFLAGE', cost: 4, cat: 'offense',
    msgType: 'camouflage',
    tip: 'All blocks rendered the same color for 12 seconds.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'camouflage', target });
      this._clearMsg();
      this._showMsg('[camouflage -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 12000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[camo queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      camouflageActive = false;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'camouflage' && inGame && !gameOver) {
        this._rxClear();
        camouflageActive = true;
        this._rxDismiss = showMsg('[CAMOUFLAGE - 12s]');
        this._rxTimer = setTimeout(() => { camouflageActive = false; this._rxClear(); }, 12000);
      }
    },
  }),

  strobe_light: makeItem({
    label: 'STROBE LIGHT', cost: 3, cat: 'offense',
    msgType: 'strobe_light',
    tip: 'Board background flashes rapidly for 6 seconds.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'strobe_light', target });
      this._clearMsg();
      this._showMsg('[strobe light -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 6000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[strobe queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      strobeLightActive = false;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'strobe_light' && inGame && !gameOver) {
        this._rxClear();
        strobeLightActive = true;
        this._rxDismiss = showMsg('[STROBE LIGHT - 6s]');
        this._rxTimer = setTimeout(() => { strobeLightActive = false; this._rxClear(); }, 6000);
      }
    },
  }),

  gluttony: makeItem({
    label: 'GLUTTONY', cost: 30, cat: 'offense',
    msgType: 'gluttony',
    tip: 'Opponent receives only oversized custom pieces for 15 seconds.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'gluttony', target });
      this._clearMsg();
      this._showMsg('[gluttony -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 15000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[gluttony queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      gluttonyActive = false;
      gluttonyUntil = 0;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'gluttony' && inGame && !gameOver) {
        this._rxClear();
        gluttonyActive = true;
        gluttonyUntil = Date.now() + 15000;
        this._rxDismiss = showMsg('[GLUTTONY - oversized pieces 15s]');
        this._rxTimer = setTimeout(() => { gluttonyActive = false; gluttonyUntil = 0; this._rxClear(); }, 15000);
      }
    },
  }),

  the_monolith: makeItem({
    label: 'THE MONOLITH', cost: 12, cat: 'offense',
    msgType: 'the_monolith',
    tip: 'Spawn a 1x8 indestructible concrete pillar in opponent\'s center column.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'the_monolith', target });
      this._clearMsg();
      this._showMsg('[monolith -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 1000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[monolith queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'the_monolith' && inGame && !gameOver) {
        const col = Math.floor(COLS / 2);
        for (let r = ROWS - 8; r < ROWS; r++) {
          if (r >= 0) board[r][col] = 9;
        }
        showMsg('[THE MONOLITH rises!]');
      }
    },
  }),

  custom_pieces: makeItem({
    label: 'CUSTOM PIECES', cost: 10, cat: 'offense',
    msgType: 'custom_pieces',
    tip: "Replace opponent's next 3 pieces with awkward shapes.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'custom_pieces', target });
      this._clearMsg();
      this._showMsg('[custom pieces -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 1000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[custom pieces queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'custom_pieces' && inGame && !gameOver) {
        const awkward = ['awkward_1', 'awkward_2', 'awkward_3'];
        for (let i = 0; i < 3; i++) {
          const key = awkward[Math.floor(Math.random() * awkward.length)];
          nextPieceOverrides.push(CUSTOM_PIECES[key].map(r => [...r]));
        }
        showMsg('[CURSED PIECES x3 incoming!]');
      }
    },
  }),

  mega_mino: makeItem({
    label: 'MEGA-MINO', cost: 9, cat: 'offense',
    msgType: 'mega_mino',
    tip: "Force a 4x4 solid block as opponent's next piece.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'mega_mino', target });
      this._clearMsg();
      this._showMsg('[mega-mino -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 1000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[mega-mino queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'mega_mino' && inGame && !gameOver) {
        nextPieceOverrides.push(CUSTOM_PIECES.mega_mino.map(r => [...r]));
        showMsg('[MEGA-MINO incoming!]');
      }
    },
  }),

  auto_rotator: makeItem({
    label: 'AUTO-ROTATOR', cost: 8, cat: 'offense',
    msgType: 'auto_rotator',
    tip: "Opponent's piece auto-rotates every 0.5s for 10 seconds.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'auto_rotator', target });
      this._clearMsg();
      this._showMsg('[auto-rotator -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 10000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[auto-rotator queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      autoRotateActive = false;
      autoRotateTimer = 0;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'auto_rotator' && inGame && !gameOver) {
        this._rxClear();
        autoRotateActive = true;
        autoRotateTimer = 0;
        this._rxDismiss = showMsg('[AUTO-ROTATE - 10s]');
        this._rxTimer = setTimeout(() => { autoRotateActive = false; autoRotateTimer = 0; this._rxClear(); }, 10000);
      }
    },
  }),

  t_clog: makeItem({
    label: 'T-CLOG', cost: 7, cat: 'offense',
    msgType: 't_clog',
    tip: "Force a 3x3 hollow square as opponent's next piece.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 't_clog', target });
      this._clearMsg();
      this._showMsg('[t-clog -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 1000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[t-clog queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 't_clog' && inGame && !gameOver) {
        nextPieceOverrides.push(CUSTOM_PIECES.t_clog.map(r => [...r]));
        showMsg('[T-CLOG incoming!]');
      }
    },
  }),

  speed_demon: makeItem({
    label: 'SPEED DEMON', cost: 6, cat: 'offense',
    msgType: 'speed_demon',
    tip: 'Forces opponent to max drop speed for 6 seconds.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'speed_demon', target });
      this._clearMsg();
      this._showMsg('[speed demon -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 6000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[speed demon queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      speedDemonActive = false;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'speed_demon' && inGame && !gameOver) {
        this._rxClear();
        speedDemonActive = true;
        this._rxDismiss = showMsg('[SPEED DEMON - 6s]');
        this._rxTimer = setTimeout(() => { speedDemonActive = false; this._rxClear(); }, 6000);
      }
    },
  }),

  queue_lock: makeItem({
    label: 'QUEUE LOCK', cost: 5, cat: 'offense',
    msgType: 'queue_lock',
    tip: "Forces opponent's next 5 pieces to be Z-pieces.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'queue_lock', target });
      this._clearMsg();
      this._showMsg('[queue lock -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 20000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[queue lock queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      queueLockRemaining = 0;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'queue_lock' && inGame && !gameOver) {
        this._rxClear();
        queueLockRemaining = 5;
        queueLockPieceId = 5; // Z-piece (index 5 in PIECES)
        this._rxDismiss = showMsg('[QUEUE LOCKED: Z x5]');
        this._rxTimer = setTimeout(() => { queueLockRemaining = 0; this._rxClear(); }, 20000);
      }
    },
  }),

  butter_fingers: makeItem({
    label: 'BUTTER FINGERS', cost: 4, cat: 'offense',
    msgType: 'butter_fingers',
    tip: "Disables opponent's hold piece for 15 seconds.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'butter_fingers', target });
      this._clearMsg();
      this._showMsg('[butter fingers -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 15000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[butter fingers queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      holdDisabled = false;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'butter_fingers' && inGame && !gameOver) {
        this._rxClear();
        holdDisabled = true;
        this._rxDismiss = showMsg('[BUTTER FINGERS - hold disabled 15s]');
        this._rxTimer = setTimeout(() => { holdDisabled = false; this._rxClear(); }, 15000);
      }
    },
  }),

  the_singularity: makeItem({
    label: 'THE SINGULARITY', cost: 30, cat: 'offense',
    msgType: 'the_singularity',
    tip: 'Opponent piece is continuously pulled toward the center column for 15s.',
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'the_singularity', target });
      this._clearMsg();
      this._showMsg('[singularity -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 15000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[singularity queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      singularityActive = false;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'the_singularity' && inGame && !gameOver) {
        this._rxClear();
        singularityActive = true;
        this._rxDismiss = showMsg('[SINGULARITY - 15s]');
        this._rxTimer = setTimeout(() => { singularityActive = false; this._rxClear(); }, 15000);
      }
    },
  }),

  gravity_flip: makeItem({
    label: 'GRAVITY FLIP', cost: 12, cat: 'offense',
    msgType: 'gravity_flip',
    tip: "Reverses opponent's gravity for 12 seconds — pieces fall upward.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'gravity_flip', target });
      this._clearMsg();
      this._showMsg('[gravity flip -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 12000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[gravity flip queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      gravityFlipped = false;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'gravity_flip' && inGame && !gameOver) {
        this._rxClear();
        gravityFlipped = true;
        this._rxDismiss = showMsg('[GRAVITY FLIPPED - 12s]');
        this._rxTimer = setTimeout(() => { gravityFlipped = false; this._rxClear(); }, 12000);
      }
    },
  }),

  bouncy_blocks: makeItem({
    label: 'BOUNCY BLOCKS', cost: 9, cat: 'offense',
    msgType: 'bouncy_blocks',
    tip: "Opponent's next 3 piece drops bounce up 2 rows before settling.",
    active: false,
    _activate() {
      const target = pickTarget();
      if (!target) { this._queue = 0; this._updateBtn(); return; }
      this.active = true;
      sendWS({ type: 'bouncy_blocks', target });
      this._clearMsg();
      this._showMsg('[bouncy blocks -> ' + target + ']');
      this._timer = setTimeout(() => this.deactivate(), 30000);
      this._updateBtn();
      this._setActive(true);
    },
    buy() {
      if (!pickTarget()) return;
      if (!this._tryBuy()) return;
      if (this.active) { this._queue++; this._updateBtn(); showMsg('[bouncy queued x' + this._queue + ']'); return; }
      this._activate();
    },
    deactivate() {
      this.active = false;
      this._clearTimer();
      this._clearMsg();
      this._rxClear();
      bouncyBlocksLeft = 0;
      this._setActive(false);
      if (this._queue > 0) { this._queue--; this._activate(); }
      else this._updateBtn();
    },
    onMessage(msg) {
      if (msg.type === 'bouncy_blocks' && inGame && !gameOver) {
        this._rxClear();
        bouncyBlocksLeft += 3;
        this._rxDismiss = showMsg('[BOUNCY BLOCKS x3!]');
        this._rxTimer = setTimeout(() => {
          bouncyBlocksLeft = 0;
          this._rxClear();
        }, 30000);
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
