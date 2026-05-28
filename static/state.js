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

// hold piece
let heldPiece = null;
let holdUsed = false;
let holdDisabled = false;

// queue/spawn effects
let queueLockRemaining = 0;
let queueLockPieceId = 5;
let nextPieceOverrides = [];
let speedDemonActive = false;
let autoRotateActive = false;
let autoRotateTimer = 0;
let gluttonyActive = false;
let gluttonyUntil = 0;

// mechanical effects
let doubleInputActive = false;
let inputDelayMs = 0;
let bouncyBlocksLeft = 0;
let bouncyBouncing = false;
let bouncyBounceY = 0;
let stuckKeyDir = 0;
let singularityActive = false;
let gravityFlipped = false;

// visual effects
let strobeLightActive = false;
let camouflageActive = false;
let staticDistortActive = false;
let ghostBoardActive = false;
let prismActive = false;
let prismPhase = 0;
let minoDecayActive = false;
let minoDecayBlocks = [];

// defensive
let lossProtectionActive = false;
let lossProtectionGold = 0;
let invulnUntil = 0;

// input latency tracking
const _latencyPending = new Set();

// economic effects
let storeBribeActive = false;
let taxFreezeActive = false;
let inflationActive = false;
let goldEarnLocked = false;
