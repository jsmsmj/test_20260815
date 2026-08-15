// スマホ縦持ちを基準とした基準解像度。実機ごとの解像度差はこの比率のまま拡大縮小して吸収する。
const BASE_WIDTH = 360;
const BASE_HEIGHT = 600;
const MAX_DPR = 2;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// レイアウト定数
const COLUMN_COUNT = 3;
const SIDE_MARGIN = 12;
const COLUMN_GAP = 8;
const COLUMN_WIDTH =
  (BASE_WIDTH - SIDE_MARGIN * 2 - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

const SAMPLE_ROW_Y = 195;
const SAMPLE_ROW_HEIGHT = 130;
const PLATE_ROW_Y = 340;
const NETA_ROW_Y = 485;
const NETA_ROW_HEIGHT = 95;

// 盛り台は常時2台表示(お手本・ネタ選択は3列のまま)
const PLATE_COLUMN_COUNT = 2;
const PLATE_COLUMN_GAP = 12;
const PLATE_COLUMN_WIDTH =
  (BASE_WIDTH - SIDE_MARGIN * 2 - PLATE_COLUMN_GAP * (PLATE_COLUMN_COUNT - 1)) / PLATE_COLUMN_COUNT;
const SLOT_STEP = PLATE_COLUMN_WIDTH + PLATE_COLUMN_GAP; // 1台分スライドする距離

function slotX(index, offset) {
  return SIDE_MARGIN + index * SLOT_STEP + offset;
}

function columnX(index) {
  return SIDE_MARGIN + index * (COLUMN_WIDTH + COLUMN_GAP);
}

// ネタ種類は一時的にトロ・サーモン・エビ(マグロ・イカ・タマゴの画像が用意でき次第差し替え予定)
const NETA_TYPES = ['toro', 'salmon', 'ebi'];
const NETA_KEYS = ['a', 's', 'd']; // PCキー割り当て(ネタの並び順に対応)
const NETA_SRC = {
  toro: 'imgs/toro.png',
  salmon: 'imgs/salmon.png',
  ebi: 'imgs/ebi.png',
};
const BG_SRC = 'imgs/ddc24c3d-e386-4c9d-bd7a-acf1f2776841_.png';
const MORIDAI_SRC = 'imgs/moridai.png';

let bgImage = null;
let moridaiImage = null;
const netaImages = {};

// --- サウンド(Howler.js) ---
// 正解時: ネタごとに固定のSE(マグロ=SE05, サーモン=SE06, エビ=SE07) / 盛り台完成時: SE03 / MISS: SE04
const correctSounds = {
  toro: new Howl({ src: ['SE/SE05.mp3'] }),
  salmon: new Howl({ src: ['SE/SE06.mp3'] }),
  ebi: new Howl({ src: ['SE/SE07.mp3'] }),
};
const completeSound = new Howl({ src: ['SE/SE03.mp3'] });
const missSound = new Howl({ src: ['SE/SE04.mp3'] });
const bgm = new Howl({ src: ['SE/iwashiro_kokage_biyori.mp3'], loop: true, volume: 0.4 });

let bgmStarted = false;
function startBgmOnce() {
  if (bgmStarted) return;
  bgmStarted = true;
  bgm.play();
}

function playCorrectSound(type) {
  const sound = correctSounds[type];
  if (sound) sound.play();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  // canvasが欠けることは許容しないため、必ず全体が収まる側(小さい方)に合わせて拡大する(contain方式)。
  const scale = Math.min(
    window.innerWidth / BASE_WIDTH,
    window.innerHeight / BASE_HEIGHT
  );

  canvas.style.width = `${BASE_WIDTH * scale}px`;
  canvas.style.height = `${BASE_HEIGHT * scale}px`;
  canvas.width = BASE_WIDTH * dpr;
  canvas.height = BASE_HEIGHT * dpr;

  // 以降の描画は常に BASE_WIDTH x BASE_HEIGHT の座標系で行える
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawBackground() {
  if (!bgImage) return;
  // 背景画像は横幅にぴったり合わせ、上basedで配置する(スコア表示などは画像に焼き込み済み)。
  // 縦は画像の方が長いため、はみ出た下部はcanvas外として自然にクリップされる。
  const scale = BASE_WIDTH / bgImage.width;
  ctx.drawImage(bgImage, 0, 0, BASE_WIDTH, bgImage.height * scale);
}

// 画像の縦横比を保ったまま矩形内に収めて描画する(containスタイル)
function drawImageContain(img, x, y, w, h) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let drawW, drawH;
  if (imgRatio > boxRatio) {
    drawW = w;
    drawH = w / imgRatio;
  } else {
    drawH = h;
    drawW = h * imgRatio;
  }
  ctx.drawImage(img, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
}

// お手本に並べる握りセット(2段x4列のグリッド)
const NIGIRI_GRID_COLS = 4;
const NIGIRI_GRID_ROWS = 2;
const NIGIRI_GRID_PADDING = 0.02; // box幅に対する内側余白の比率
const NIGIRI_CELL_FILL = 1.3; // セルに対する握りの占有率(1.0超で隣のセルと重なる)
const PIECE_COUNT = NIGIRI_GRID_ROWS * NIGIRI_GRID_COLS; // 1皿分の貫数

// 1貫を指定の中心位置・最大サイズで描画する共通処理
function drawNigiriPiece(img, centerX, centerY, maxW, maxH) {
  let pieceW = maxW;
  let pieceH = pieceW * (img.height / img.width);
  if (pieceH > maxH) {
    pieceH = maxH;
    pieceW = pieceH * (img.width / img.height);
  }
  ctx.drawImage(img, centerX - pieceW / 2, centerY - pieceH / 2, pieceW, pieceH);
}

// お手本(白い箱)用: 均等な2x4グリッド。常に全貫を表示する(=正解の見本)。
// 行(奥→手前)・列(左→右)の順に描画するので、左と奥のネタが先に描かれ、右・手前のネタがその上に重なる。
function drawNigiriSet(x, y, w, h, grid) {
  const padX = w * NIGIRI_GRID_PADDING;
  const padY = h * NIGIRI_GRID_PADDING;
  const cellW = (w - padX * 2) / NIGIRI_GRID_COLS;
  const cellH = (h - padY * 2) / NIGIRI_GRID_ROWS;

  for (let row = 0; row < NIGIRI_GRID_ROWS; row++) {
    for (let col = 0; col < NIGIRI_GRID_COLS; col++) {
      const img = netaImages[grid[row * NIGIRI_GRID_COLS + col]];
      if (!img) continue;

      const centerX = x + padX + cellW * (col + 0.5);
      const centerY = y + padY + cellH * (row + 0.5);
      drawNigiriPiece(img, centerX, centerY, cellW * NIGIRI_CELL_FILL, cellH * NIGIRI_CELL_FILL);
    }
  }
}

// お手本のうち、次に押すべき1貫をグレーの枠で囲むカーソル表示
function drawNigiriCursor(x, y, w, h, index) {
  const padX = w * NIGIRI_GRID_PADDING;
  const padY = h * NIGIRI_GRID_PADDING;
  const cellW = (w - padX * 2) / NIGIRI_GRID_COLS;
  const cellH = (h - padY * 2) / NIGIRI_GRID_ROWS;
  const row = Math.floor(index / NIGIRI_GRID_COLS);
  const col = index % NIGIRI_GRID_COLS;
  const cellX = x + padX + cellW * col;
  const cellY = y + padY + cellH * row;

  ctx.strokeStyle = '#808080';
  ctx.lineWidth = 3;
  ctx.strokeRect(cellX + 2, cellY + 2, cellW - 4, cellH - 4);
}

// 盛り台(木製トレー)は奥が狭く手前が広い台形なので、行ごとに幅を変えて台の天板に沿わせる。
// 配列は奥(上)→手前(下)の順。天板部分(前面の厚み・脚を除いた範囲)にのみ収める。
const PLATE_GRID_ROWS = 2;
const PLATE_GRID_COLS = 4;
const PLATE_ROW_WIDTH_RATIO = [0.78, 0.98];
const PLATE_ROW_Y_RATIO = [0.28, 0.62];
const PLATE_ROW_HEIGHT_RATIO = 0.36;
const PLATE_CELL_FILL = 1.4;
const PLATE_NIGIRI_Y_OFFSET = -10; // 握り全体を台に対して上にずらすオフセット(px)

// 盛り台画像は全体を表示したまま、縦方向だけ潰して縮小する(横幅は縦横比通り、縦だけ比率を掛けて圧縮)
const PLATE_IMAGE_SQUASH_RATIO = 0.72;

// revealCount貫目までしか描画しない(ゲーム進行に応じて盛り台に握りが増えていく表現)
function drawNigiriOnPlate(x, y, w, h, grid, revealCount) {
  for (let row = 0; row < PLATE_GRID_ROWS; row++) {
    const rowWidth = w * PLATE_ROW_WIDTH_RATIO[row];
    const rowX = x + (w - rowWidth) / 2;
    const cellW = rowWidth / PLATE_GRID_COLS;
    const cellH = h * PLATE_ROW_HEIGHT_RATIO;
    const centerY = y + h * PLATE_ROW_Y_RATIO[row] + PLATE_NIGIRI_Y_OFFSET;

    for (let col = 0; col < PLATE_GRID_COLS; col++) {
      const pieceIndex = row * PLATE_GRID_COLS + col;
      if (pieceIndex >= revealCount) continue;

      const img = netaImages[grid[pieceIndex]];
      if (!img) continue;

      const centerX = rowX + cellW * (col + 0.5);
      drawNigiriPiece(img, centerX, centerY, cellW * PLATE_CELL_FILL, cellH * PLATE_CELL_FILL);
    }
  }
}

function randomOrder() {
  return Array.from(
    { length: PIECE_COUNT },
    () => NETA_TYPES[Math.floor(Math.random() * NETA_TYPES.length)]
  );
}

// --- ゲーム状態 ---
// orders[0] = 進行中(入力対象), orders[1] = 次に控えている(遷移中は入力対象になる), orders[2] = その次(遷移中のみ画面右から見える)
// ステージの盛り台はSTAGE_PLATE_COUNT枚で打ち止め。それ以上はnullを詰めて「もう出てこない」ことを表す
let stageOrders = []; // このステージ分(4皿)の内容。ステージ開始時に確定させる
let nextOrderIndex = 0; // stageOrders のうち、まだ orders に乗せていない次のインデックス
let orders = [null, null, null];
let progress = 0; // orders[0] のうち何貫正解したか
let nextProgress = 0; // 遷移中、orders[1] のうち何貫正解したか
let inputLocked = false; // MISS表示中のみtrue(遷移中は入力ブロックしない)
let missUntil = 0; // この時刻(ms)まで MISS 表示・入力ロック
let missStart = 0; // MISS表示アニメーションの開始時刻(ms)
let showGood = false; // 盛り台完成時にGOOD!を表示するか(遷移中のみ)
let plateMissed = false; // 今作っている盛り台でMISSが発生したか(ノーミスボーナスの判定用)
let transitionActive = false;
let transitionStart = 0;
const TRANSITION_DURATION = 1000; // ms
let transitionOffset = 0; // 現在のスライドオフセット(0 〜 -SLOT_STEP)

// --- ステージ進行 ---
const STAGE_PLATE_COUNT = 4; // 1ステージで完成させる盛り台数
const START_IGNORE_DURATION = 500; // タイトル/ゲームオーバー画面で入力を無視する時間(ms)

let gamePhase = 'title'; // 'title' | 'countdown' | 'playing' | 'cleared' | 'gameover'
let phaseStart = 0; // 現フェーズ(title/countdown/cleared/gameover)が始まった時刻
let stageStartTime = 0; // 'playing'に入った時刻(タイム計測用)
let stageNumber = 1; // 現在のステージ番号(MISSペナルティの計算に使う)
let missCount = 0; // このステージのMISS数(ステージ開始でリセット)
let currentStreak = 0; // 現在のコンボ(ステージ開始・MISSで0にリセット)
let maxStreak = 0; // 過去最高コンボ(ステージクリアではリセットしない、通算の記録)
let platesClearedInStage = 0; // このステージで完成させた盛り台数
let noMissPlateCount = 0; // このステージでノーミス完成させた盛り台数(ステージ開始でリセット)
let clearStats = { time: 0, miss: 0, streak: 0 }; // クリア画面表示用に確定した記録

// --- 制限時間 ---
const INITIAL_TIME = 50; // 秒、ゲーム開始時の残り時間
const STAGE_CLEAR_TIME_BONUS = 3; // 秒、ステージクリアで加算
const PLATE_NO_MISS_BONUS = 1; // 秒、盛り台1皿をノーミスで完成させると加算
const MISS_TIME_PENALTY_PER_STAGE = 0.5; // 秒、MISS1回のペナルティ = ステージ番号 × この値

let timeRemaining = INITIAL_TIME; // 残り時間(秒)。'playing'中のみ減少する
let lastMissPenalty = 0; // 直近のMISSで引かれた秒数(MISS表示用)
let lastFrameTime = null; // 前回updateが呼ばれた時刻(dt計算用)

const NO_MISS_BONUS_DISPLAY_DURATION = 500; // ms
const NO_MISS_BONUS_RISE_DISTANCE = 10; // px
let noMissBonusStart = 0; // 「ノーミス +1秒」表示アニメーションの開始時刻(ms)
let noMissBonusUntil = 0; // この時刻(ms)まで表示

const COUNTDOWN_STEPS = [
  { label: 'ステージ開始!', duration: 1000 },
  { label: '3', duration: 600 },
  { label: '2', duration: 600 },
  { label: '1', duration: 600 },
  { label: 'GO', duration: 600 },
];
const COUNTDOWN_TOTAL_DURATION = COUNTDOWN_STEPS.reduce((sum, s) => sum + s.duration, 0);

// このステージ分(STAGE_PLATE_COUNT枚)の盛り台をあらかじめ確定させ、表示用の3枠にセットする
function generateStageOrders() {
  stageOrders = Array.from({ length: STAGE_PLATE_COUNT }, randomOrder);
  nextOrderIndex = Math.min(3, STAGE_PLATE_COUNT);
  orders = [stageOrders[0] ?? null, stageOrders[1] ?? null, stageOrders[2] ?? null];
}

function startTitle(now) {
  gamePhase = 'title';
  phaseStart = now;
}

function startGame(now) {
  stageNumber = 1;
  timeRemaining = INITIAL_TIME;
  startCountdown(now);
}

function startGameOver(now) {
  gamePhase = 'gameover';
  phaseStart = now;
}

function startCountdown(now) {
  gamePhase = 'countdown';
  phaseStart = now;
  generateStageOrders();
}

function startPlayingStage(now) {
  gamePhase = 'playing';
  stageStartTime = now;
  missCount = 0;
  currentStreak = 0;
  platesClearedInStage = 0;
  noMissPlateCount = 0;
  plateMissed = false; // 1皿目のノーミス判定用
  // maxStreak は通算の記録なのでここではリセットしない
}

function startClearScreen(now) {
  gamePhase = 'cleared';
  phaseStart = now;
  timeRemaining += STAGE_CLEAR_TIME_BONUS;
  clearStats = {
    time: now - stageStartTime,
    miss: missCount,
    streak: maxStreak,
    noMiss: noMissPlateCount,
  };
}

function startTransition(now) {
  transitionActive = true;
  transitionStart = now;
  showGood = true;
  nextProgress = 0;
  completeSound.play();

  // 今完成した盛り台がノーミスならボーナス。判定後、次の盛り台用にリセットする
  if (!plateMissed) {
    timeRemaining += PLATE_NO_MISS_BONUS;
    noMissPlateCount++;
    noMissBonusStart = now;
    noMissBonusUntil = now + NO_MISS_BONUS_DISPLAY_DURATION;
  }
  plateMissed = false;

  platesClearedInStage++;
  if (platesClearedInStage >= STAGE_PLATE_COUNT) {
    // フレームアウトが始まると同時にクリア画面を表示する(スライド演出自体は最後まで裏で続く)
    startClearScreen(now);
  }
}

function registerMiss(now) {
  inputLocked = true;
  missStart = now;
  missUntil = now + 300;
  missSound.play();
  missCount++;
  currentStreak = 0;
  plateMissed = true;

  lastMissPenalty = stageNumber * MISS_TIME_PENALTY_PER_STAGE;
  timeRemaining -= lastMissPenalty;
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    startGameOver(now);
  }
}

function registerCorrect() {
  currentStreak++;
  if (currentStreak > maxStreak) maxStreak = currentStreak;
}

function attemptNeta(type) {
  if (gamePhase !== 'playing') return;
  if (inputLocked) return;
  const now = performance.now();

  if (transitionActive) {
    // 次の盛り台がこのステージにもう存在しない場合は入力を無視する
    if (!orders[1]) return;
    // 遷移中に次の盛り台まで完成済みなら、今の遷移が終わるまでは新たな入力を無視する
    if (nextProgress >= PIECE_COUNT) return;

    if (type === orders[1][nextProgress]) {
      nextProgress++;
      playCorrectSound(type);
      registerCorrect();
    } else {
      registerMiss(now);
    }
    return;
  }

  if (!orders[0]) return; // 念のため(通常はここがnullになることはない)

  if (type === orders[0][progress]) {
    progress++;
    playCorrectSound(type);
    registerCorrect();
    if (progress >= PIECE_COUNT) {
      startTransition(now);
    }
  } else {
    registerMiss(now);
  }
}

// --- 入力 ---
function getBasePos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * BASE_WIDTH,
    y: ((clientY - rect.top) / rect.height) * BASE_HEIGHT,
  };
}

function handlePointer(clientX, clientY) {
  const pos = getBasePos(clientX, clientY);
  if (pos.y < NETA_ROW_Y || pos.y > NETA_ROW_Y + NETA_ROW_HEIGHT) return;

  for (let i = 0; i < COLUMN_COUNT; i++) {
    const bx = columnX(i);
    if (pos.x >= bx && pos.x <= bx + COLUMN_WIDTH) {
      attemptNeta(NETA_TYPES[i]);
      return;
    }
  }
}

// タイトル/クリア/ゲームオーバー画面での入力を処理する。
// 処理した(=通常のゲーム入力に回さない)場合はtrueを返す。
function handleScreenInput() {
  const now = performance.now();

  if (gamePhase === 'title') {
    if (now - phaseStart >= START_IGNORE_DURATION) {
      startGame(now);
    }
    return true;
  }

  if (gamePhase === 'cleared') {
    stageNumber++;
    startCountdown(now);
    return true;
  }

  if (gamePhase === 'gameover') {
    if (now - phaseStart >= START_IGNORE_DURATION) {
      startTitle(now);
    }
    return true;
  }

  return false;
}

canvas.addEventListener('pointerdown', (e) => {
  startBgmOnce();
  if (handleScreenInput()) return;
  handlePointer(e.clientX, e.clientY);
});

window.addEventListener('keydown', (e) => {
  startBgmOnce();
  if (handleScreenInput()) return;
  const idx = NETA_KEYS.indexOf(e.key.toLowerCase());
  if (idx !== -1) {
    attemptNeta(NETA_TYPES[idx]);
  }
});

// --- 描画 ---
function drawSampleAndPlateSlots() {
  const slotCount = transitionActive ? 3 : PLATE_COLUMN_COUNT;
  // 遷移中は orders[1](次の盛り台)が入力対象、通常時は orders[0] が入力対象
  const activeSlot = transitionActive ? 1 : 0;
  const activeProgress = transitionActive ? nextProgress : progress;

  for (let i = 0; i < slotCount; i++) {
    const order = orders[i];
    if (!order) continue; // このステージにはもう盛り台が存在しない

    const x = slotX(i, transitionOffset);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, SAMPLE_ROW_Y, PLATE_COLUMN_WIDTH, SAMPLE_ROW_HEIGHT);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, SAMPLE_ROW_Y, PLATE_COLUMN_WIDTH, SAMPLE_ROW_HEIGHT);
    drawNigiriSet(x, SAMPLE_ROW_Y, PLATE_COLUMN_WIDTH, SAMPLE_ROW_HEIGHT, order);
    if (i === activeSlot && activeProgress < PIECE_COUNT) {
      drawNigiriCursor(x, SAMPLE_ROW_Y, PLATE_COLUMN_WIDTH, SAMPLE_ROW_HEIGHT, activeProgress);
    }

    if (moridaiImage) {
      const plateHeight =
        PLATE_COLUMN_WIDTH * (moridaiImage.height / moridaiImage.width) * PLATE_IMAGE_SQUASH_RATIO;
      ctx.drawImage(moridaiImage, x, PLATE_ROW_Y, PLATE_COLUMN_WIDTH, plateHeight);
      // 遷移中の枠0(退場中)は完成済みなので全貫表示、枠2(次の次)はまだ空
      let revealCount;
      if (transitionActive) {
        revealCount = i === 0 ? PIECE_COUNT : i === 1 ? nextProgress : 0;
      } else {
        revealCount = i === 0 ? progress : 0;
      }
      drawNigiriOnPlate(x, PLATE_ROW_Y, PLATE_COLUMN_WIDTH, plateHeight, order, revealCount);
    }
  }
}

function drawNetaRow() {
  for (let i = 0; i < COLUMN_COUNT; i++) {
    const x = columnX(i);
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(x, NETA_ROW_Y, COLUMN_WIDTH, NETA_ROW_HEIGHT);
    ctx.strokeStyle = '#8c8c8c';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, NETA_ROW_Y, COLUMN_WIDTH, NETA_ROW_HEIGHT);

    const img = netaImages[NETA_TYPES[i]];
    if (img) {
      drawImageContain(img, x + 8, NETA_ROW_Y + 8, COLUMN_WIDTH - 16, NETA_ROW_HEIGHT - 16);
    }

    // PCキー割り当てのヒント表示
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(NETA_KEYS[i].toUpperCase(), x + COLUMN_WIDTH / 2, NETA_ROW_Y + NETA_ROW_HEIGHT - 6);
  }
}

// 左の盛り台の中心あたりを基準位置とする(MISS/GOOD!表示の共通アンカー)
const MESSAGE_ANCHOR_X = SIDE_MARGIN + PLATE_COLUMN_WIDTH / 2;
const MESSAGE_ANCHOR_Y = PLATE_ROW_Y + 55;
const MISS_RISE_DISTANCE = 20; // px

function drawMissText() {
  const now = performance.now();
  if (missUntil <= now) return;

  const t = Math.min((now - missStart) / 500, 1);
  const y = MESSAGE_ANCHOR_Y - MISS_RISE_DISTANCE * t;

  ctx.save();
  ctx.fillStyle = '#ff3b3b';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MISS', MESSAGE_ANCHOR_X, y);

  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`-${lastMissPenalty.toFixed(1)}秒`, MESSAGE_ANCHOR_X, y + 22);
  ctx.restore();
}

function drawGoodText() {
  if (!showGood) return;

  // 完成した盛り台と一緒にスライドしていく(遷移オフセットに追従)
  ctx.save();
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GOOD!', MESSAGE_ANCHOR_X + transitionOffset, MESSAGE_ANCHOR_Y);
  ctx.restore();
}

// タイマー付近に表示する「ノーミス +1秒」ポップアップ(緑文字、少し上に上がるアニメ)
function drawNoMissBonusText() {
  const now = performance.now();
  if (noMissBonusUntil <= now) return;

  const t = Math.min((now - noMissBonusStart) / NO_MISS_BONUS_DISPLAY_DURATION, 1);
  const y = TIMER_DISPLAY_Y + 30 - NO_MISS_BONUS_RISE_DISTANCE * t;

  ctx.save();
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ノーミス +1秒', BASE_WIDTH / 2, y);
  ctx.restore();
}

// ステージ開始前の「ステージ開始! → 3 → 2 → 1 → GO」カウントダウン表示
function getCountdownLabel(elapsed) {
  let acc = 0;
  for (const step of COUNTDOWN_STEPS) {
    acc += step.duration;
    if (elapsed < acc) return step.label;
  }
  return COUNTDOWN_STEPS[COUNTDOWN_STEPS.length - 1].label;
}

function drawCountdownOverlay() {
  if (gamePhase !== 'countdown') return;
  const label = getCountdownLabel(performance.now() - phaseStart);

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, BASE_WIDTH / 2, BASE_HEIGHT / 2);
  ctx.restore();
}

function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function drawClearOverlay() {
  if (gamePhase !== 'cleared') return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText('ステージクリア!', BASE_WIDTH / 2, BASE_HEIGHT / 2 - 60);

  ctx.font = '20px sans-serif';
  ctx.fillText(`タイム: ${formatSeconds(clearStats.time)}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 15);
  ctx.fillText(`MISS: ${clearStats.miss}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 20);
  ctx.fillText(`連続成功数: ${clearStats.streak}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 55);
  ctx.fillText(`ノーミス盛り台: ${clearStats.noMiss}/${STAGE_PLATE_COUNT}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 85);

  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(`クリアボーナス +${STAGE_CLEAR_TIME_BONUS}秒`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 115);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#cccccc';
  ctx.fillText('タップ / キー入力で次のステージへ', BASE_WIDTH / 2, BASE_HEIGHT / 2 + 148);
  ctx.restore();
}

// 残り時間表示(ネタケースあたり、0.1秒単位)
const TIMER_DISPLAY_Y = 95;
const TIMER_LOW_THRESHOLD = 3; // 秒、これ以下で赤く警告表示

function drawTimer() {
  if (gamePhase === 'title') return;

  const text = `${timeRemaining.toFixed(1)}秒`;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px sans-serif';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.strokeText(text, BASE_WIDTH / 2, TIMER_DISPLAY_Y);
  ctx.fillStyle = timeRemaining <= TIMER_LOW_THRESHOLD ? '#ff4d4d' : '#ffffff';
  ctx.fillText(text, BASE_WIDTH / 2, TIMER_DISPLAY_Y);
  ctx.restore();
}

function drawTitleOverlay() {
  if (gamePhase !== 'title') return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('鮨職人になろう!', BASE_WIDTH / 2, BASE_HEIGHT / 2 - 130);

  ctx.font = '16px sans-serif';
  const lines = [
    'お手本の握り(左上→右下の順)通りに',
    '下のネタボタン(タップ / A・S・D)を押そう',
    '',
    '盛り台4皿完成でステージクリア',
    '残り時間が0になるとゲームオーバー',
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 70 + i * 26);
  });

  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cccccc';
  ctx.fillText('タップ / キー入力でスタート', BASE_WIDTH / 2, BASE_HEIGHT / 2 + 120);
  ctx.restore();
}

function drawGameOverOverlay() {
  if (gamePhase !== 'gameover') return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = '#ff4d4d';
  ctx.textAlign = 'center';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('GAME OVER', BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cccccc';
  ctx.fillText('タップ / キー入力でタイトルへ', BASE_WIDTH / 2, BASE_HEIGHT / 2 + 30);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  drawBackground();
  drawSampleAndPlateSlots();
  drawNetaRow();
  drawGoodText();
  drawMissText();
  drawTimer();
  drawNoMissBonusText();
  drawCountdownOverlay();
  drawClearOverlay();
  drawTitleOverlay();
  drawGameOverOverlay();
}

// --- 更新(時間ベース。フレームレートに依存しない) ---
function update(now) {
  const dt = lastFrameTime === null ? 0 : (now - lastFrameTime) / 1000; // 秒
  lastFrameTime = now;

  // MISSロックは遷移中かどうかに関わらず、時間が来たら解除する
  if (inputLocked && missUntil > 0 && now >= missUntil) {
    inputLocked = false;
    missUntil = 0;
  }

  if (gamePhase === 'title' || gamePhase === 'gameover') {
    return; // 入力待ちのみ、演出やタイマーは進めない
  }

  if (gamePhase === 'countdown') {
    if (now - phaseStart >= COUNTDOWN_TOTAL_DURATION) {
      startPlayingStage(now);
    }
    return;
  }

  if (gamePhase === 'playing') {
    timeRemaining -= dt;
    if (timeRemaining <= 0) {
      timeRemaining = 0;
      startGameOver(now);
      return;
    }
  }

  // 'playing'・'cleared' 共通: スライド演出が進行中なら最後まで裏で再生し続ける
  // (クリア画面は4皿目のフレームアウト開始と同時に表示されるが、演出自体は最後まで見せる)
  if (transitionActive) {
    const t = Math.min((now - transitionStart) / TRANSITION_DURATION, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out
    transitionOffset = -SLOT_STEP * eased;

    if (t >= 1) {
      orders.shift();
      // このステージに残っている盛り台があればそれを、なければnull(もう出てこない)を詰める
      if (nextOrderIndex < stageOrders.length) {
        orders.push(stageOrders[nextOrderIndex]);
        nextOrderIndex++;
      } else {
        orders.push(null);
      }
      transitionOffset = 0;
      transitionActive = false;
      showGood = false;
      progress = nextProgress; // 遷移中に進んだ分を引き継ぐ
      nextProgress = 0;

      // 遷移中に次の盛り台まで完成していた場合は、続けて次の遷移を開始する(まだプレイ中の場合のみ)
      if (gamePhase === 'playing' && progress >= PIECE_COUNT) {
        startTransition(now);
      }
    }
  }

  // 'cleared' フェーズはタイマーでは進めず、プレイヤーの入力を待つ(handleScreenInputで進む)
}

let animationFrameId = null;

function loop(now) {
  update(now);
  draw();
  animationFrameId = requestAnimationFrame(loop);
}

// タブが非アクティブ(バックグラウンド)になったらゲームループとBGMを止め、
// 復帰したら再開する
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (bgmStarted) bgm.pause();
  } else {
    if (animationFrameId === null) {
      // 非表示だった間の経過時間をdt計算に含めない(タイマーが一気に減るのを防ぐ)
      lastFrameTime = null;
      animationFrameId = requestAnimationFrame(loop);
    }
    if (bgmStarted) bgm.play();
  }
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// iOS Safari 等はアドレスバーの表示/非表示だけでは resize が発火しないことがあるため
// visualViewport の変化も監視する
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}

resize();
startTitle(performance.now());
animationFrameId = requestAnimationFrame(loop);

Promise.all([
  loadImage(BG_SRC).then((img) => { bgImage = img; }),
  loadImage(MORIDAI_SRC).then((img) => { moridaiImage = img; }),
  ...NETA_TYPES.map((type) => loadImage(NETA_SRC[type]).then((img) => { netaImages[type] = img; })),
]).catch((err) => console.error('画像の読み込みに失敗しました', err));
