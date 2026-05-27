const COLS = 10;
const ROWS = 20;
const CELL = 30;
const GOLD_INTERVAL = 12000;

const COLORS = [
  null,
  '#7ecfd4',
  '#d4c47a',
  '#b88fc5',
  '#82c49a',
  '#c47a7a',
  '#7a96c4',
  '#c4a07a',
  'gold',
  '#444455',
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  [[2,2],[2,2]],
  [[0,3,0],[3,3,3],[0,0,0]],
  [[0,4,4],[4,4,0],[0,0,0]],
  [[5,5,0],[0,5,5],[0,0,0]],
  [[6,0,0],[6,6,6],[0,0,0]],
  [[0,0,7],[7,7,7],[0,0,0]],
];

const POINTS = [0, 100, 300, 500, 800];
const LEVEL_SPEED = (level) => Math.max(50, 1000 - (level - 1) * 90);
const QUEUE_SIZE = 10;
const DEBUG = true;

const boardCanvas = document.getElementById('board');
const boardCtx    = boardCanvas.getContext('2d');
const nextCanvas  = document.getElementById('next');
const nextCtx     = nextCanvas.getContext('2d');
const scoreEl     = document.getElementById('score');
const levelEl     = document.getElementById('level');
const linesEl     = document.getElementById('lines');
const goldEl      = document.getElementById('gold');
const overlay     = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const overlaySub  = document.getElementById('overlay-sub');

let board, piece, nextPiece, pieceQueue, score, level, lines, gold, paused, gameOver, dropTimer, lastTime;
let elapsed = 0;
let goldElapsed = 0;
let inGame = false;

const DAS_DELAY  = 167;
const DAS_REPEAT = 33;
let dasEnabled = true;
const dasState = {};

let wallKicksEnabled = true;

let ws = null;
let myId = null;
let roomId = null;
let isCreator = false;
const opponents = new Map();

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

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(id) {
  const matrix = PIECES[id].map(row => [...row]);
  return { id, matrix, x: Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2), y: 0 };
}

function fillQueue() {
  while (pieceQueue.length < QUEUE_SIZE) {
    pieceQueue.push(makePiece(Math.floor(Math.random() * 7) + 1));
  }
}

function drawFromQueue() {
  fillQueue();
  const p = pieceQueue.shift();
  fillQueue();
  return p;
}

function rotate(matrix) {
  const n = matrix.length;
  const m = matrix[0].length;
  const result = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < m; c++)
      result[c][n - 1 - r] = matrix[r][c];
  return result;
}

function collides(p, dx = 0, dy = 0, mat = null) {
  const matrix = mat || p.matrix;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const nx = p.x + c + dx;
      const ny = p.y + r + dy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function lock() {
  for (let r = 0; r < piece.matrix.length; r++)
    for (let c = 0; c < piece.matrix[r].length; c++)
      if (piece.matrix[r][c])
        if (piece.y + r >= 0)
          board[piece.y + r][piece.x + c] = piece.matrix[r][c];

  let cleared = 0;
  let goldCleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v) && !board[r].includes(9)) {
      goldCleared += board[r].filter(v => v === 8).length;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }

  let scoreChanged = false;

  if (cleared) {
    lines += cleared;
    score += POINTS[cleared] * level;
    level = Math.floor(lines / 10) + 1;
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
    scoreChanged = true;
  }

  if (goldCleared) {
    gold += goldCleared;
    goldEl.textContent = gold;
    scoreChanged = true;
  }

  if (scoreChanged) sendScore();
  if (Date.now() < STORE_ITEMS.peek._targetedUntil) sendBoardState();

  piece = drawFromQueue();
  nextPiece = pieceQueue[0];
  if (Date.now() < STORE_ITEMS.qscan._targetedUntil) sendQueueData();

  if (collides(piece)) endGame();
}

function spawnGold() {
  const candidates = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] && board[r][c] !== 8 && board[r][c] !== 9)
        candidates.push([r, c]);
  if (candidates.length === 0) return;
  const [r, c] = candidates[Math.floor(Math.random() * candidates.length)];
  board[r][c] = 8;
  playChime();
}

function playChime() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.5, ctx.currentTime);
  masterGain.connect(ctx.destination);

  const delay = ctx.createDelay();
  const feedback = ctx.createGain();
  delay.delayTime.setValueAtTime(0.12, ctx.currentTime);
  feedback.gain.setValueAtTime(0.25, ctx.currentTime);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(masterGain);

  const melody = [523.25, 783.99, 1174.66];
  const gap = 0.08;

  melody.forEach((root, noteIndex) => {
    const startTime = ctx.currentTime + (noteIndex * gap);
    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.45, startTime + 0.005);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);
    noteGain.connect(masterGain);
    noteGain.connect(delay);
    [
      { ratio: 1.0,  type: 'sine', volume: 0.6  },
      { ratio: 2.0,  type: 'sine', volume: 0.15 },
      { ratio: 3.02, type: 'sine', volume: 0.08 },
    ].forEach(ot => {
      const osc = ctx.createOscillator();
      osc.type = ot.type;
      osc.frequency.setValueAtTime(root * ot.ratio, startTime);
      const otGain = ctx.createGain();
      otGain.gain.setValueAtTime(ot.volume, startTime);
      osc.connect(otGain);
      otGain.connect(noteGain);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  });
}

function moveDown() {
  if (!collides(piece, 0, 1)) {
    piece.y++;
  } else {
    lock();
  }
}

function hardDrop() {
  while (!collides(piece, 0, 1)) piece.y++;
  lock();
}

function tryRotate() {
  const rotated = rotate(piece.matrix);
  const kicks = wallKicksEnabled ? [0, -1, 1, -2, 2] : [0];
  for (const kick of kicks) {
    if (!collides(piece, kick, 0, rotated)) {
      piece.matrix = rotated;
      piece.x += kick;
      return;
    }
  }
}

function drawCell(ctx, x, y, colorId, cellSize = CELL) {
  if (!colorId) return;
  if (colorId === 8) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
    ctx.fillStyle = `hsl(45, 90%, ${45 + pulse * 20}%)`;
    ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    ctx.fillStyle = `rgba(255,255,255,${0.2 + pulse * 0.35})`;
    ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, 4);
    return;
  }
  if (colorId === 9) {
    ctx.fillStyle = COLORS[9];
    ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, 4);
    return;
  }
  ctx.fillStyle = COLORS[colorId];
  ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, 4);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.strokeStyle = '#222430';
  for (let r = 0; r <= ROWS; r++) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, r * CELL);
    boardCtx.lineTo(COLS * CELL, r * CELL);
    boardCtx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    boardCtx.beginPath();
    boardCtx.moveTo(c * CELL, 0);
    boardCtx.lineTo(c * CELL, ROWS * CELL);
    boardCtx.stroke();
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawCell(boardCtx, c, r, board[r][c]);

  let ghostY = piece.y;
  while (!collides(piece, 0, ghostY - piece.y + 1)) ghostY++;
  if (ghostY !== piece.y) {
    for (let r = 0; r < piece.matrix.length; r++)
      for (let c = 0; c < piece.matrix[r].length; c++)
        if (piece.matrix[r][c]) {
          boardCtx.fillStyle = 'rgba(255,255,255,0.1)';
          boardCtx.fillRect((piece.x + c) * CELL + 1, (ghostY + r) * CELL + 1, CELL - 2, CELL - 2);
        }
  }
  for (let r = 0; r < piece.matrix.length; r++)
    for (let c = 0; c < piece.matrix[r].length; c++)
      if (piece.matrix[r][c])
        drawCell(boardCtx, piece.x + c, piece.y + r, piece.matrix[r][c]);

  if (!wallKicksEnabled) {
    boardCtx.strokeStyle = 'rgba(220,80,80,0.7)';
    boardCtx.lineWidth = 4;
    boardCtx.strokeRect(2, 2, boardCanvas.width - 4, boardCanvas.height - 4);
    boardCtx.lineWidth = 1;
  }
}

function drawNext() {
  const cellSize = 24;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const mat = nextPiece.matrix;
  const offX = Math.floor((5 - mat[0].length) / 2);
  const offY = Math.floor((5 - mat.length) / 2);
  for (let r = 0; r < mat.length; r++)
    for (let c = 0; c < mat[r].length; c++)
      if (mat[r][c])
        drawCell(nextCtx, offX + c, offY + r, mat[r][c], cellSize);
}

function showOverlay(text, sub, playAgain = false) {
  overlayText.textContent = text;
  overlaySub.textContent = sub;
  overlay.classList.remove('hidden');
  const btn = document.getElementById('play-again-btn');
  if (playAgain) btn.classList.remove('hidden');
  else btn.classList.add('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(dropTimer);
  sendWS({ type: 'game_over' });
  showOverlay('GAME OVER', '', true);
}

function backToPregame() {
  cancelAnimationFrame(dropTimer);
  clearAllDAS();
  for (const item of Object.values(STORE_ITEMS)) item.deactivate();
  inGame = false;
  gameOver = false;
  hideOverlay();
  document.getElementById('game').classList.add('hidden');
  document.getElementById('pregame').classList.remove('hidden');
  updateBeginState();
}

function startGame() {
  board = createBoard();
  score = 0; level = 1; lines = 0; gold = 0;
  paused = false; gameOver = false;
  elapsed = 0; goldElapsed = 0;
  clearAllDAS();
  for (const item of Object.values(STORE_ITEMS)) item.deactivate();
  scoreEl.textContent = 0;
  levelEl.textContent = 1;
  linesEl.textContent = 0;
  goldEl.textContent = 0;
  pieceQueue = [];
  fillQueue();
  piece = drawFromQueue();
  nextPiece = pieceQueue[0];
  hideOverlay();
  lastTime = 0;
  sendWS({ type: 'restart' });
  sendScore();
  dropTimer = requestAnimationFrame(loop);
}

function loop(ts) {
  if (paused || gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;

  elapsed += dt;
  if (elapsed >= LEVEL_SPEED(level)) {
    moveDown();
    elapsed = 0;
  }

  goldElapsed += dt;
  if (goldElapsed >= GOLD_INTERVAL) {
    spawnGold();
    goldElapsed = 0;
  }

  drawBoard();
  drawNext();
  dropTimer = requestAnimationFrame(loop);
}

function startDAS(key, action) {
  if (dasState[key]) return;
  action();
  const delay = setTimeout(() => {
    const interval = setInterval(() => {
      if (!inGame || paused || gameOver) { clearAllDAS(); return; }
      action();
    }, DAS_REPEAT);
    dasState[key] = { interval };
  }, DAS_DELAY);
  dasState[key] = { delay };
}

function stopDAS(key) {
  if (!dasState[key]) return;
  clearTimeout(dasState[key].delay);
  clearInterval(dasState[key].interval);
  delete dasState[key];
}

function clearAllDAS() {
  for (const key of Object.keys(dasState)) stopDAS(key);
}

document.addEventListener('keydown', e => {
  if (!inGame) return;
  if (gameOver) {
    if (e.key === 'Enter') sendWS({ type: 'play_again' });
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':
      if (!paused && dasEnabled) {
        e.preventDefault();
        startDAS('left', () => { if (!collides(piece, -1, 0)) piece.x--; });
      } else if (!paused) {
        if (!collides(piece, -1, 0)) piece.x--;
      }
      break;
    case 'ArrowRight':
      if (!paused && dasEnabled) {
        e.preventDefault();
        startDAS('right', () => { if (!collides(piece, 1, 0)) piece.x++; });
      } else if (!paused) {
        if (!collides(piece, 1, 0)) piece.x++;
      }
      break;
    case 'ArrowDown':
      if (!paused && dasEnabled) {
        e.preventDefault();
        startDAS('down', () => { moveDown(); elapsed = 0; });
      } else if (!paused) {
        moveDown(); elapsed = 0;
      }
      break;
    case 'ArrowUp':    if (!paused) tryRotate(); break;
    case ' ':          if (!paused) hardDrop(); e.preventDefault(); break;
    case 'p': case 'P':
      paused = !paused;
      if (paused) {
        clearAllDAS();
        showOverlay('PAUSED', 'press P to continue');
      } else {
        hideOverlay();
        lastTime = performance.now();
        dropTimer = requestAnimationFrame(loop);
      }
      break;
  }
});

document.addEventListener('keyup', e => {
  if (!dasEnabled) return;
  switch (e.key) {
    case 'ArrowLeft':  stopDAS('left');  break;
    case 'ArrowRight': stopDAS('right'); break;
    case 'ArrowDown':  stopDAS('down');  break;
  }
});

function connectWS(room) {
  ws = new WebSocket('ws://' + location.host + '/ws?room=' + room);
  ws.onmessage = e => handleWS(JSON.parse(e.data));
  ws.onerror = () => console.error('ws error');
  ws.onclose = () => console.log('ws closed');
}

function sendWS(data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function sendScore() {
  sendWS({ type: 'score', score, level, lines, gold });
}

function handleWS(msg) {
  switch (msg.type) {
    case 'init':
      myId = msg.id;
      isCreator = msg.creator || false;
      for (const id of (msg.players || [])) addOpponent(id);
      updateBeginState();
      break;
    case 'player_joined':
      addOpponent(msg.id);
      updateBeginState();
      sendScore();
      break;
    case 'player_left':
      removeOpponent(msg.id);
      updateBeginState();
      break;
    case 'score':
      updateOpponent(msg.id, msg);
      break;
    case 'game_over':
      markOpponentOut(msg.id);
      break;
    case 'play_again':
      if (msg.id === myId) {
        isCreator = msg.new_creator === myId;
        backToPregame();
      }
      break;
    case 'start':
      if (!inGame) {
        enterGame();
      } else if (gameOver) {
        startGame();
      }
      break;
    case 'win':
      if (!gameOver && inGame) {
        gameOver = true;
        cancelAnimationFrame(dropTimer);
        showOverlay('YOU WIN', '', true);
      }
      break;
  }
  for (const item of Object.values(STORE_ITEMS)) item.onMessage(msg);
}

function addOpponent(id) {
  if (opponents.has(id)) return;
  const card = document.createElement('div');
  card.className = 'opp-card';
  card.id = 'opp-' + id;
  card.innerHTML =
    '<div class="opp-id">' + id + '</div>' +
    '<div class="opp-score" id="opp-score-' + id + '">0</div>' +
    '<div class="opp-sub" id="opp-sub-' + id + '">lvl 1</div>' +
    '<canvas id="peek-canvas-' + id + '" class="peek-canvas hidden" width="60" height="120"></canvas>' +
    '<canvas id="qscan-canvas-' + id + '" class="peek-canvas hidden" width="60" height="20"></canvas>' +
    '<div id="qscan-gold-' + id + '" class="opp-sub hidden"></div>';
  document.getElementById('opponents').appendChild(card);
  opponents.set(id, { score: 0, level: 1, gameOver: false });
}

function removeOpponent(id) {
  const el = document.getElementById('opp-' + id);
  if (el) el.remove();
  opponents.delete(id);
}

function updateOpponent(id, data) {
  if (!opponents.has(id)) addOpponent(id);
  const opp = opponents.get(id);
  Object.assign(opp, data);
  const se  = document.getElementById('opp-score-' + id);
  const sub = document.getElementById('opp-sub-' + id);
  if (se)  se.textContent  = opp.score;
  if (sub) sub.textContent = 'lvl ' + opp.level;
}

function markOpponentOut(id) {
  const el = document.getElementById('opp-' + id);
  if (el) el.classList.add('opp-out');
  if (opponents.has(id)) opponents.get(id).gameOver = true;
}

function updateBeginState() {
  document.getElementById('player-count').textContent = 'players: ' + (opponents.size + 1);
  const waitingMsg = document.getElementById('waiting-msg');
  const beginBtn   = document.getElementById('begin-btn');
  if (isCreator && opponents.size > 0) {
    waitingMsg.classList.add('hidden');
    beginBtn.classList.remove('hidden');
  } else {
    waitingMsg.classList.remove('hidden');
    waitingMsg.textContent = isCreator ? 'waiting for players...' : 'waiting for host to start...';
    beginBtn.classList.add('hidden');
  }
}

function enterGame() {
  document.getElementById('pregame').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  inGame = true;
  buildStore();
  startGame();
}

function showMsg(text) {
  const el = document.createElement('div');
  el.className = 'ws-msg';
  el.textContent = text;
  document.getElementById('msg-stack').appendChild(el);
  return () => {
    el.classList.add('ws-msg-out');
    setTimeout(() => el.remove(), 300);
  };
}

function sendBoardState() {
  const flat = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      flat.push(board[r][c]);
  sendWS({ type: 'board_state', board: flat });
}

function sendQueueData() {
  sendWS({ type: 'queue_data', pieces: pieceQueue.slice(0, 3).map(p => p.id), gold });
}

function renderPeekBoard(id, flat) {
  const canvas = document.getElementById('peek-canvas-' + id);
  if (!canvas) return;
  canvas.classList.remove('hidden');
  const ctx = canvas.getContext('2d');
  const cs = 6;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = flat[r * COLS + c];
      if (!v) continue;
      ctx.fillStyle = v === 8 ? 'gold' : COLORS[v];
      ctx.fillRect(c * cs, r * cs, cs - 1, cs - 1);
    }
  }
}

function renderQueueScan(id, pieces, oppGold) {
  const canvas = document.getElementById('qscan-canvas-' + id);
  const goldDiv = document.getElementById('qscan-gold-' + id);
  if (!canvas) return;
  canvas.classList.remove('hidden');
  if (goldDiv) {
    goldDiv.classList.remove('hidden');
    goldDiv.textContent = 'g: ' + oppGold;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cs = 4;
  pieces.forEach((pid, i) => {
    if (!pid || !PIECES[pid]) return;
    const mat = PIECES[pid];
    const slotX = i * 20;
    for (let r = 0; r < mat.length; r++)
      for (let c = 0; c < mat[r].length; c++)
        if (mat[r][c]) {
          ctx.fillStyle = COLORS[mat[r][c]];
          ctx.fillRect(slotX + c * cs, r * cs, cs - 1, cs - 1);
        }
  });
}

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

const roomParam = new URLSearchParams(location.search).get('room');
if (!roomParam) {
  location.href = '/';
} else {
  roomId = roomParam;
  document.getElementById('room-display').textContent = roomId;
  document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href);
  });
  document.getElementById('begin-btn').addEventListener('click', () => sendWS({ type: 'start' }));
  document.addEventListener('keydown', e => {
    if (inGame) return;
    if (e.key === 'Enter' && isCreator && !document.getElementById('begin-btn').classList.contains('hidden')) {
      sendWS({ type: 'start' });
    }
  });
  document.getElementById('play-again-btn').addEventListener('click', () => {
    sendWS({ type: 'play_again' });
  });
  connectWS(roomId);
}
