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
