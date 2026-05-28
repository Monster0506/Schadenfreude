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
  if (gluttonyActive && Date.now() < gluttonyUntil) {
    const keys = ['awkward_1', 'awkward_2', 'awkward_3', 't_clog', 'mega_mino'];
    const mat = CUSTOM_PIECES[keys[Math.floor(Math.random() * keys.length)]].map(r => [...r]);
    return { id: 0, matrix: mat, x: Math.floor(COLS / 2) - Math.floor(mat[0].length / 2), y: 0 };
  }
  if (nextPieceOverrides.length > 0) {
    const mat = nextPieceOverrides.shift();
    return { id: 0, matrix: mat, x: Math.floor(COLS / 2) - Math.floor(mat[0].length / 2), y: 0 };
  }
  if (queueLockRemaining > 0) {
    queueLockRemaining--;
    const mat = PIECES[queueLockPieceId].map(r => [...r]);
    return { id: queueLockPieceId, matrix: mat, x: Math.floor(COLS / 2) - Math.floor(mat[0].length / 2), y: 0 };
  }
  fillQueue();
  const p = pieceQueue.shift();
  fillQueue();
  return p;
}

function holdPiece() {
  if (holdUsed || holdDisabled) return;
  holdUsed = true;
  if (heldPiece === null) {
    heldPiece = { id: piece.id, matrix: PIECES[piece.id].map(r => [...r]) };
    piece = drawFromQueue();
    nextPiece = pieceQueue[0];
  } else {
    const newPiece = { id: heldPiece.id, matrix: PIECES[heldPiece.id].map(r => [...r]) };
    heldPiece = { id: piece.id, matrix: PIECES[piece.id].map(r => [...r]) };
    piece = newPiece;
    piece.x = Math.floor(COLS / 2) - Math.floor(piece.matrix[0].length / 2);
    piece.y = 0;
  }
  if (collides(piece)) endGame();
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
  magCaught = false;
  holdUsed = false;
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

function applyMagnet() {
  if (!magColActive) { magCaught = false; return; }
  const w = piece.matrix[0].length;
  if (!magCaught) {
    if (piece.x <= magColIndex && piece.x + w > magColIndex) magCaught = true;
    else return;
  }
  piece.x = Math.max(0, Math.min(COLS - w, magColIndex));
}

function applyBounce() {
  if (bouncyBlocksLeft <= 0) return false;
  bouncyBlocksLeft--;
  let moved = 0;
  while (moved < 2 && piece.y > 0 && !collides(piece, 0, -1)) {
    piece.y--;
    moved++;
  }
  const left = bouncyBlocksLeft;
  showMsg('[BOUNCY! ' + (left > 0 ? left + ' left' : 'last one') + ']');
  return true;
}

function moveDown() {
  if (!collides(piece, 0, 1)) {
    piece.y++;
  } else {
    applyBounce();
    lock();
  }
}

function hardDrop() {
  while (!collides(piece, 0, 1)) piece.y++;
  applyBounce();
  lock();
}

function tryRotate() {
  const rotated = rotate(piece.matrix);
  const kicks = wallKicksEnabled ? [0, -1, 1, -2, 2] : [0];
  for (const kick of kicks) {
    if (!collides(piece, kick, 0, rotated)) {
      piece.matrix = rotated;
      piece.x += kick;
      applyMagnet();
      return;
    }
  }
}

function endGame() {
  if (lossProtectionActive) {
    lossProtectionGold = Math.floor(gold / 2);
  }
  STORE_ITEMS.loss_protection.deactivate();
  gameOver = true;
  cancelAnimationFrame(dropTimer);
  sendWS({ type: 'game_over' });
  showOverlay('GAME OVER', '', true);
}

function backToPregame() {
  cancelAnimationFrame(dropTimer);
  clearAllDAS();
  for (const item of Object.values(STORE_ITEMS)) item.reset();
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
  for (const item of Object.values(STORE_ITEMS)) item.reset();
  if (lossProtectionGold > 0) {
    gold = lossProtectionGold;
    lossProtectionGold = 0;
  }
  scoreEl.textContent = 0;
  levelEl.textContent = 1;
  linesEl.textContent = 0;
  goldEl.textContent = gold;
  heldPiece = null;
  holdUsed = false;
  nextPieceOverrides = [];
  queueLockRemaining = 0;
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

  applyMagnet();
  if (stuckKeyDir !== 0 && !paused && !gameOver) {
    const dx = stuckKeyDir;
    if (!collides(piece, dx, 0)) piece.x += dx;
  }
  drawBoard();
  drawNext();
  drawHeld();
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
