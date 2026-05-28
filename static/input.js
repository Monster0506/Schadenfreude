function handleMovementKey(key) {
  switch (key) {
    case 'ArrowLeft':
      if (!paused && !magCaught) {
        if (zeroFriction) {
          while (!collides(piece, -1, 0)) piece.x--;
        } else if (dasEnabled) {
          startDAS('left', () => { if (!collides(piece, -1, 0)) piece.x--; });
        } else {
          if (!collides(piece, -1, 0)) piece.x--;
        }
        if (doubleInputActive && !collides(piece, -1, 0)) piece.x--;
      }
      break;
    case 'ArrowRight':
      if (!paused && !magCaught) {
        if (zeroFriction) {
          while (!collides(piece, 1, 0)) piece.x++;
        } else if (dasEnabled) {
          startDAS('right', () => { if (!collides(piece, 1, 0)) piece.x++; });
        } else {
          if (!collides(piece, 1, 0)) piece.x++;
        }
        if (doubleInputActive && !collides(piece, 1, 0)) piece.x++;
      }
      break;
    case 'ArrowDown':
      if (!paused && dasEnabled) {
        startDAS('down', () => { moveDown(); elapsed = 0; });
      } else if (!paused) {
        moveDown(); elapsed = 0;
      }
      break;
    case 'ArrowUp':    if (!paused) { tryRotate(); if (doubleInputActive) tryRotate(); } break;
    case ' ':          if (!paused) hardDrop(); break;
  }
}

document.addEventListener('keydown', e => {
  if (!inGame) return;
  if (gameOver) {
    if (e.key === 'Enter') sendWS({ type: 'play_again' });
    return;
  }
  if (inputDelayMs > 0 && ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(e.key)) {
    e.preventDefault();
    if (e.repeat) return;
    const delayedKey = e.key;
    clearAllDAS();
    setTimeout(() => {
      if (!inGame || gameOver || paused) return;
      handleMovementKey(delayedKey);
    }, inputDelayMs);
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      handleMovementKey('ArrowLeft');
      break;
    case 'ArrowRight':
      e.preventDefault();
      handleMovementKey('ArrowRight');
      break;
    case 'ArrowDown':
      e.preventDefault();
      handleMovementKey('ArrowDown');
      break;
    case 'ArrowUp':    handleMovementKey('ArrowUp'); break;
    case ' ':          handleMovementKey(' '); e.preventDefault(); break;
    case 'c': case 'C': if (!paused) holdPiece(); break;
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
