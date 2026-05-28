function drawCell(ctx, x, y, colorId, cellSize = CELL) {
  if (!colorId) return;
  if (camouflageActive) {
    ctx.fillStyle = '#4a4e66';
    ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
    return;
  }
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
  if (strobeLightActive) {
    const on = Math.floor(performance.now() / 80) % 2 === 0;
    boardCtx.fillStyle = on ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.5)';
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  }
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
      if (!ghostBoardActive || !board[r][c])
        drawCell(boardCtx, c, r, board[r][c]);

  if (magColActive) {
    boardCtx.fillStyle = 'rgba(255,160,50,0.13)';
    boardCtx.fillRect(magColIndex * CELL, 0, CELL, ROWS * CELL);
    boardCtx.strokeStyle = 'rgba(255,160,50,0.5)';
    boardCtx.lineWidth = 2;
    boardCtx.strokeRect(magColIndex * CELL + 1, 0, CELL - 2, ROWS * CELL);
    boardCtx.lineWidth = 1;
  }

  let ghostY = piece.y;
  const gDir = gravityFlipped ? -1 : 1;
  while (!collides(piece, 0, ghostY - piece.y + gDir)) ghostY += gDir;
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
  if (zeroFriction) {
    boardCtx.strokeStyle = 'rgba(80,140,220,0.7)';
    boardCtx.lineWidth = 4;
    boardCtx.strokeRect(2, 2, boardCanvas.width - 4, boardCanvas.height - 4);
    boardCtx.lineWidth = 1;
  }
  if (Date.now() < invulnUntil) {
    boardCtx.strokeStyle = 'rgba(255,200,50,0.85)';
    boardCtx.lineWidth = 4;
    boardCtx.strokeRect(2, 2, boardCanvas.width - 4, boardCanvas.height - 4);
    boardCtx.lineWidth = 1;
  }
  if (staticDistortActive) {
    for (let i = 0; i < 400; i++) {
      const rx = Math.random() * boardCanvas.width;
      const ry = Math.random() * boardCanvas.height;
      const rs = 2 + Math.random() * 3;
      const alpha = 0.15 + Math.random() * 0.25;
      boardCtx.fillStyle = `rgba(200,200,220,${alpha})`;
      boardCtx.fillRect(rx, ry, rs, rs);
    }
  }
  if (singularityActive) {
    const cx = Math.floor(COLS / 2) * CELL;
    const pulse = 0.3 + 0.2 * Math.sin(performance.now() / 180);
    boardCtx.fillStyle = `rgba(200,160,255,${pulse})`;
    boardCtx.fillRect(cx, 0, CELL, ROWS * CELL);
    boardCtx.strokeStyle = 'rgba(200,160,255,0.6)';
    boardCtx.lineWidth = 2;
    boardCtx.strokeRect(cx, 0, CELL, ROWS * CELL);
    boardCtx.lineWidth = 1;
  }
  if (gravityFlipped) {
    boardCtx.strokeStyle = 'rgba(180,80,255,0.8)';
    boardCtx.lineWidth = 4;
    boardCtx.strokeRect(2, 2, boardCanvas.width - 4, boardCanvas.height - 4);
    boardCtx.lineWidth = 1;
    boardCtx.fillStyle = 'rgba(180,80,255,0.15)';
    boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
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

function drawHeld() {
  const canvas = document.getElementById('held');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cellSize = 24;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (holdDisabled) {
    ctx.fillStyle = 'rgba(200,80,80,0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (!heldPiece) return;
  const mat = heldPiece.matrix;
  const offX = Math.floor((5 - mat[0].length) / 2);
  const offY = Math.floor((5 - mat.length) / 2);
  for (let r = 0; r < mat.length; r++)
    for (let c = 0; c < mat[r].length; c++)
      if (mat[r][c])
        drawCell(ctx, offX + c, offY + r, mat[r][c], cellSize);
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

const msgStack = document.getElementById('msg-stack');
let _msgExpanded = false;
const STACK_PEEK = 12;
const STACK_MAX  = 3;

msgStack.addEventListener('mouseenter', () => { _msgExpanded = true;  _layoutMsgs(); });
msgStack.addEventListener('mouseleave', () => { _msgExpanded = false; _layoutMsgs(); });

function _layoutMsgs() {
  const toasts = [...msgStack.querySelectorAll('.ws-msg:not(.ws-msg-out)')];
  const n = toasts.length;
  if (n === 0) { msgStack.style.height = '0'; return; }

  const toastH = toasts[n - 1].offsetHeight || 30;
  const GAP = 6;

  if (_msgExpanded && n > 1) {
    msgStack.style.height = (n * toastH + (n - 1) * GAP) + 'px';
    toasts.forEach((el, i) => {
      const fromTop = n - 1 - i;
      el.style.transform = `translateY(${fromTop * (toastH + GAP)}px)`;
      el.style.opacity = '1';
      el.style.zIndex = n - fromTop;
    });
  } else {
    msgStack.style.height = (toastH + Math.min(n - 1, STACK_MAX - 1) * STACK_PEEK) + 'px';
    toasts.forEach((el, i) => {
      const fromTop = n - 1 - i;
      const depth   = Math.min(fromTop, STACK_MAX - 1);
      el.style.transform = `translateY(${depth * STACK_PEEK}px) scale(${1 - depth * 0.05})`;
      el.style.opacity = fromTop === 0 ? '1' : fromTop === 1 ? '0.65' : fromTop >= STACK_MAX ? '0' : '0.35';
      el.style.zIndex = n - fromTop;
    });
  }
}

function showMsg(text) {
  const el = document.createElement('div');
  el.className = 'ws-msg';
  el.textContent = text;
  msgStack.appendChild(el);
  requestAnimationFrame(() => _layoutMsgs());
  return () => {
    el.classList.add('ws-msg-out');
    _layoutMsgs();
    setTimeout(() => { el.remove(); _layoutMsgs(); }, 280);
  };
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
