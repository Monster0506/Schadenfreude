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
