document.addEventListener('keydown', e => {
  if (!inGame) return;
  if (gameOver) {
    if (e.key === 'Enter') sendWS({ type: 'play_again' });
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':
      if (!paused && !magCaught) {
        e.preventDefault();
        if (zeroFriction) {
          while (!collides(piece, -1, 0)) piece.x--;
        } else if (dasEnabled) {
          startDAS('left', () => { if (!collides(piece, -1, 0)) piece.x--; });
        } else {
          if (!collides(piece, -1, 0)) piece.x--;
        }
      }
      break;
    case 'ArrowRight':
      if (!paused && !magCaught) {
        e.preventDefault();
        if (zeroFriction) {
          while (!collides(piece, 1, 0)) piece.x++;
        } else if (dasEnabled) {
          startDAS('right', () => { if (!collides(piece, 1, 0)) piece.x++; });
        } else {
          if (!collides(piece, 1, 0)) piece.x++;
        }
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
