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

const DAS_DELAY = 167;
const DAS_REPEAT = 33;
