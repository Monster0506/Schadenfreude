const COLS = 10;
const ROWS = 20;
const CELL = 30;

const COLORS = [
  null,
  '#00f0f0',
  '#f0f000',
  '#a000f0',
  '#00f000',
  '#f00000',
  '#0000f0',
  '#f0a000',
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

const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const linesEl = document.getElementById('lines');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const overlaySub = document.getElementById('overlay-sub');

let board, piece, nextPiece, score, level, lines, paused, gameOver, dropTimer, lastTime;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const id = Math.floor(Math.random() * 7) + 1;
  const matrix = PIECES[id].map(row => [...row]);
  return { id, matrix, x: Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2), y: 0 };
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
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }

  if (cleared) {
    lines += cleared;
    score += POINTS[cleared] * level;
    level = Math.floor(lines / 10) + 1;
    scoreEl.textContent = score;
    levelEl.textContent = level;
    linesEl.textContent = lines;
  }

  piece = nextPiece;
  nextPiece = randomPiece();

  if (collides(piece)) {
    endGame();
  }
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
  const kicks = [0, -1, 1, -2, 2];
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
  const color = COLORS[colorId];
  ctx.fillStyle = color;
  ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, cellSize - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x * cellSize + 1, y * cellSize + 1, cellSize - 2, 4);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  boardCtx.strokeStyle = '#1e1e2e';
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

function showOverlay(text, sub) {
  overlayText.textContent = text;
  overlaySub.textContent = sub;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(dropTimer);
  showOverlay('GAME OVER', 'Press Enter to restart');
}

function startGame() {
  board = createBoard();
  score = 0; level = 1; lines = 0; paused = false; gameOver = false;
  scoreEl.textContent = 0;
  levelEl.textContent = 1;
  linesEl.textContent = 0;
  piece = randomPiece();
  nextPiece = randomPiece();
  hideOverlay();
  lastTime = 0;
  dropTimer = requestAnimationFrame(loop);
}

let elapsed = 0;

function loop(ts) {
  if (paused || gameOver) return;
  const dt = ts - lastTime;
  lastTime = ts;
  elapsed += dt;
  if (elapsed >= LEVEL_SPEED(level)) {
    moveDown();
    elapsed = 0;
  }
  drawBoard();
  drawNext();
  dropTimer = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (gameOver) {
    if (e.key === 'Enter') startGame();
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':  if (!paused && !collides(piece, -1, 0)) piece.x--; break;
    case 'ArrowRight': if (!paused && !collides(piece,  1, 0)) piece.x++; break;
    case 'ArrowDown':  if (!paused) { moveDown(); elapsed = 0; } break;
    case 'ArrowUp':    if (!paused) tryRotate(); break;
    case ' ':          if (!paused) hardDrop(); e.preventDefault(); break;
    case 'p': case 'P':
      paused = !paused;
      if (paused) {
        showOverlay('PAUSED', 'Press P to continue');
      } else {
        hideOverlay();
        lastTime = performance.now();
        dropTimer = requestAnimationFrame(loop);
      }
      break;
  }
});

showOverlay('TETRIS', 'Press Enter to start');
document.addEventListener('keydown', function startOnEnter(e) {
  if (e.key === 'Enter') {
    document.removeEventListener('keydown', startOnEnter);
    startGame();
  }
});
