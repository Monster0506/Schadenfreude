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
  if (inGame && !gameOver && STORE_ITEMS.shield.active) {
    const hostile = Object.values(STORE_ITEMS).some(i => i.msgType === msg.type);
    if (hostile) {
      STORE_ITEMS.shield.deactivate();
      showMsg('[attack blocked by shield!]');
      return;
    }
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
