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

let dasEnabled = true;
const dasState = {};

let wallKicksEnabled = true;
let zeroFriction = false;
let magColActive = false;
let magColIndex = -1;
let magCaught = false;

let ws = null;
let myId = null;
let roomId = null;
let isCreator = false;
const opponents = new Map();
