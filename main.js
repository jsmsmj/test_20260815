// グローバルスコープを汚さないよう、ファイル全体を即時関数(IIFE)で囲んでいる。
// (モジュール分割は将来のタイミングで別途行う)
(function () {

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
const NETA_TYPES = ['toro', 'tamago', 'ebi'];
const NETA_KEYS = ['a', 's', 'd']; // PCキー割り当て(ネタの並び順に対応)

// ネタボタンを押した瞬間のフィードバック(少し拡大+ほのかに緑がかった色)
const NETA_PRESS_FLASH_DURATION = 100; // ms(約2フレーム分の短い演出)
const NETA_PRESS_SCALE = 1.03;
let netaButtonPressTime = [0, 0, 0]; // 各ネタボタンを最後に押した時刻

function flashNetaButton(index) {
  netaButtonPressTime[index] = performance.now();
}
const NETA_SRC = {
  toro: 'imgs/toro.png',
  tamago: 'imgs/tamago.png',
  ebi: 'imgs/ebi.png',
};
const BG_SRC = 'imgs/ddc24c3d-e386-4c9d-bd7a-acf1f2776841_.png';
const MORIDAI_SRC = 'imgs/moridai.png';

// 正解エフェクト用のパラパラアニメ(5コマ)
const CORRECT_EFFECT_SRC = [
  'imgs/ef01.png',
  'imgs/ef02.png',
  'imgs/ef03.png',
  'imgs/ef04.png',
  'imgs/ef05.png',
];

let bgImage = null;
let moridaiImage = null;
const netaImages = {};
const correctEffectImages = [];

// --- サウンド(Howler.js) ---
// 全SEの定義(ファイルと音量)をここに集約する。鳴らす箇所は名前だけを使って呼び出す。
const SOUNDS = {
  correctToro: { src: 'SE/SE05.mp3', volume: 1.0 },
  correctTamago: { src: 'SE/SE06.mp3', volume: 1.0 },
  correctEbi: { src: 'SE/SE01.mp3', volume: 1.0 },
  plateComplete: { src: 'SE/SE03.mp3', volume: 1.0 },
  miss: { src: 'SE/SE04.mp3', volume: 1.0 },
  plateNoMissA: { src: 'SE/SE08.mp3', volume: 1.0 },
  plateNoMissB: { src: 'SE/SE09.mp3', volume: 1.0 },
  countdownTick: { src: 'SE/SE10.mp3', volume: 1.0 }, // カウントダウン「3」「2」「1」
  countdownGo: { src: 'SE/SE11.mp3', volume: 1.0 }, // カウントダウン「GO」
  bgm: { src: 'SE/iwashiro_kokage_biyori.mp3', volume: 0.4, loop: true },
};

const soundInstances = {};
for (const [name, def] of Object.entries(SOUNDS)) {
  soundInstances[name] = new Howl({ src: [def.src], volume: def.volume, loop: !!def.loop });
}

function playSound(name) {
  const sound = soundInstances[name];
  if (sound) sound.play();
}

// 複数候補からランダムに1つ再生する(例: ノーミス盛り台のSEはA/Bどちらか)
function playRandomSound(names) {
  playSound(names[Math.floor(Math.random() * names.length)]);
}

const CORRECT_SOUND_NAME = {
  toro: 'correctToro',
  tamago: 'correctTamago',
  ebi: 'correctEbi',
};
const NO_MISS_PLATE_SOUND_NAMES = ['plateNoMissA', 'plateNoMissB'];

let bgmStarted = false;
function startBgmOnce() {
  if (bgmStarted) return;
  bgmStarted = true;
  soundInstances.bgm.play();
}

function playCorrectSound(type) {
  const name = CORRECT_SOUND_NAME[type];
  if (name) playSound(name);
}

function playNoMissPlateSound() {
  playRandomSound(NO_MISS_PLATE_SOUND_NAMES);
}

// --- ランキング(Cloudflare Worker) ---
const RANKING_API_BASE = 'https://game-api.ssdp-jun-20260816.workers.dev';
const GAME_VERSION = '1.0';
const RANKING_LIMIT = 10;
const RANKING_IGNORE_DURATION = 1000; // ms, ランキング画面表示直後にキー/タップ入力を無視する時間

const nameEntryLabel = document.getElementById('name-entry-label');
const nameInput = document.getElementById('name-input');
const nameConfirmBtn = document.getElementById('name-confirm-btn');
const titleRankingBtn = document.getElementById('title-ranking-btn');
const titleChangeNameBtn = document.getElementById('title-change-name-btn');
const rankingBackBtn = document.getElementById('ranking-back-btn');

// デバイスID(初回のみ生成してlocalStorageに保存)。現時点では送信するだけで、特に活用はしていない。
function getDeviceId() {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
}

function getPlayerName() {
  return localStorage.getItem('playerName') || '';
}

function setPlayerName(name) {
  const trimmed = name.trim().slice(0, 20);
  localStorage.setItem('playerName', trimmed);
  return trimmed;
}

async function submitScore({ score, stages, playTime }) {
  const res = await fetch(`${RANKING_API_BASE}/api/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: getDeviceId(),
      name: getPlayerName() || 'NO NAME',
      score,
      stages,
      playTime,
      gameVer: GAME_VERSION,
    }),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status}`);
  return res.json(); // { ok, id, rank }
}

// GAMEOVER直後に'NO NAME'等で送信済みのレコードを、後から入力された名前に書き換える
async function renameRecord(id, newName) {
  const res = await fetch(`${RANKING_API_BASE}/api/name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId: getDeviceId(), id, name: newName }),
  });
  if (!res.ok) throw new Error(`rename failed: ${res.status}`);
  return res.json();
}

async function fetchRanking(limit) {
  const res = await fetch(`${RANKING_API_BASE}/api/ranking?limit=${limit}`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();
  return data.ranking;
}

// 自分の現在の順位を問い合わせる。{ registered: false } または
// { registered: true, rank, totalPlayers, best, plays, bestPlayId } を返す
async function fetchMyRank() {
  const res = await fetch(`${RANKING_API_BASE}/api/me?deviceId=${getDeviceId()}`);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.json();
}

// --- 自己ベスト・順位変動(localStorageで管理) ---
function getBestScore() {
  const v = localStorage.getItem('bestScore');
  return v === null ? 0 : Number(v);
}

// 記録を更新していればlocalStorageに保存し、trueを返す
function updateBestScore(score) {
  if (score > getBestScore()) {
    localStorage.setItem('bestScore', String(score));
    return true;
  }
  return false;
}

// 「直前のプレイ時点の順位」。ゲームをプレイして送信した時だけ更新する(タイトルの定期取得では更新しない)
function getLastKnownRank() {
  const v = localStorage.getItem('lastKnownRank');
  return v === null ? null : Number(v);
}

function setLastKnownRank(rank) {
  if (rank === null || rank === undefined) return;
  localStorage.setItem('lastKnownRank', String(rank));
}

// canvas上の座標(BASE_WIDTH/BASE_HEIGHT基準)に、実画面上のposition:fixed要素を重ねて配置する
function positionOverCanvas(el, x, y, w, h) {
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / BASE_WIDTH;
  el.style.left = `${rect.left + x * scale}px`;
  el.style.top = `${rect.top + y * scale}px`;
  el.style.width = `${w * scale}px`;
  el.style.height = `${h * scale}px`;
}

// 名前入力欄はcanvas座標ではなく、実際に見えている範囲(window.visualViewport)基準で配置する。
// iOS Safariはソフトキーボード表示時にwindow.innerHeightを縮めないことが多く、
// canvas基準(position:fixedの座標系)のままだとキーボードの下(画面外)に入力欄が来てしまうため。
function layoutNameEntryElements() {
  const vv = window.visualViewport;
  const visibleWidth = vv ? vv.width : window.innerWidth;
  const visibleHeight = vv ? vv.height : window.innerHeight;
  const offsetLeft = vv ? vv.offsetLeft : 0;
  const offsetTop = vv ? vv.offsetTop : 0;

  const inputWidth = 150;
  const inputHeight = 40;
  const btnWidth = 60;
  const gap = 10;
  const totalWidth = inputWidth + gap + btnWidth;

  // 見えている範囲の上寄り(キーボードが出ても隠れない位置)に配置する
  const left = offsetLeft + (visibleWidth - totalWidth) / 2;
  const top = offsetTop + visibleHeight * 0.35;

  nameInput.style.left = `${left}px`;
  nameInput.style.top = `${top}px`;
  nameInput.style.width = `${inputWidth}px`;
  nameInput.style.height = `${inputHeight}px`;

  nameConfirmBtn.style.left = `${left + inputWidth + gap}px`;
  nameConfirmBtn.style.top = `${top}px`;
  nameConfirmBtn.style.width = `${btnWidth}px`;
  nameConfirmBtn.style.height = `${inputHeight}px`;

  // 見出しも入力欄と同じ実ビューポート基準で、入力欄のすぐ上に配置する
  const labelWidth = 260;
  nameEntryLabel.style.left = `${offsetLeft + (visibleWidth - labelWidth) / 2}px`;
  nameEntryLabel.style.top = `${top - 56}px`;
  nameEntryLabel.style.width = `${labelWidth}px`;
}

function layoutTitleRankingButton() {
  positionOverCanvas(titleRankingBtn, BASE_WIDTH / 2 - 90, BASE_HEIGHT / 2 + 150, 180, 34);
  positionOverCanvas(titleChangeNameBtn, BASE_WIDTH / 2 - 90, BASE_HEIGHT / 2 + 192, 180, 34);
}

function layoutRankingBackButton() {
  positionOverCanvas(rankingBackBtn, 15, 15, 64, 30);
}

// --- タイトル画面の「現在○位」表示(60秒おきに更新) ---
const TITLE_RANK_REFRESH_INTERVAL = 60000; // ms
let titleRankText = '';
let titleRankArrow = ''; // '↑' | '↓' | ''
let titleRankRefreshTimer = null;
let sessionStartRank = null; // ゲーム開始時点の順位(プレイ後の順位変動判定に使う。nullなら比較なし)

function refreshTitleRank() {
  fetchMyRank()
    .then((data) => {
      if (!data.registered) {
        titleRankText = 'まだ記録がありません';
        titleRankArrow = '';
        sessionStartRank = null;
        return;
      }
      const newRank = data.rank;
      const baseline = getLastKnownRank(); // 直前のプレイ時点の順位(ここでは更新しない)
      titleRankArrow = baseline !== null && newRank !== baseline ? (newRank < baseline ? '↑' : '↓') : '';
      titleRankText = `現在 ${newRank}位`;
      sessionStartRank = newRank; // 次にプレイする時の「プレイ前の順位」として保持
    })
    .catch((err) => {
      console.error('順位の取得に失敗しました', err);
    });
}

function startTitleRankRefresh() {
  refreshTitleRank();
  if (titleRankRefreshTimer === null) {
    titleRankRefreshTimer = setInterval(refreshTitleRank, TITLE_RANK_REFRESH_INTERVAL);
  }
}

function stopTitleRankRefresh() {
  if (titleRankRefreshTimer !== null) {
    clearInterval(titleRankRefreshTimer);
    titleRankRefreshTimer = null;
  }
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

  // 名前入力欄・タイトルのランキングボタンはcanvasの上に実HTML要素として重ねているので、
  // 表示中はサイズ変更に追従させる
  if (gamePhase === 'nameEntry') {
    layoutNameEntryElements();
  }
  if (gamePhase === 'title') {
    layoutTitleRankingButton();
  }
  if (gamePhase === 'ranking') {
    layoutRankingBackButton();
  }
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
const PIECE_COUNT = NIGIRI_GRID_ROWS * NIGIRI_GRID_COLS; // 1台分の貫数

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

// revealCount貫目までしか描画しない(ゲーム進行に応じて盛り台に握りが増えていく表現)。
// dropIndexに一致する貫だけ、dropOffsetY分だけ上下にずらして描画する(出現アニメ用)。
function drawNigiriOnPlate(x, y, w, h, grid, revealCount, dropIndex, dropOffsetY) {
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
      const extraY = pieceIndex === dropIndex ? dropOffsetY : 0;
      drawNigiriPiece(img, centerX, centerY + extraY, cellW * PLATE_CELL_FILL, cellH * PLATE_CELL_FILL);
    }
  }
}

// 新しく1貫が盛り台に出現する時の演出(最終位置より10px上から0.1秒かけて落ちて着地する)
const PIECE_DROP_DURATION = 100; // ms
const PIECE_DROP_DISTANCE = 10; // px
let lastPieceRevealSlot = -1; // orders配列でのインデックス(0 or 1)。どの盛り台の貫か
let lastPieceRevealIndex = -1; // その盛り台の中で何貫目か
let lastPieceRevealTime = 0;

// 正解時に画面中央で再生するパラパラアニメのエフェクト(5コマ、各コマ2フレーム分)
const CORRECT_EFFECT_FRAME_DURATION = 30; // ms(2フレーム分の目安)
const CORRECT_EFFECT_FRAME_COUNT = 5;
const CORRECT_EFFECT_TOTAL_DURATION = CORRECT_EFFECT_FRAME_DURATION * CORRECT_EFFECT_FRAME_COUNT;
const CORRECT_EFFECT_OPACITY = 0.9;
const CORRECT_EFFECT_SIZE = 330; // px(仮。大きさ・位置は後で微調整)
let correctEffectStart = 0;

function playCorrectEffect(now) {
  correctEffectStart = now;
}

// 画面シェイク(背景・盛り台のみ対象。お手本・ボタン・タイマーは揺れない)。
// 正解時とMISS時で別々のパラメータ(揺れ幅・回転・時間・周期)を独立して調整できるようにしてある。
const CORRECT_SHAKE = {
  duration: 200, // ms
  magnitude: 2, // px
  rotation: (1.1 * Math.PI) / 180, // ラジアン
  frequency: 2, // 揺れの往復回数
};
const MISS_SHAKE = {
  duration: 120, // ms(仮。MISS用に別途調整する想定)
  magnitude: 10, // px(仮)
  rotation: (0 * Math.PI) / 180, // ラジアン(仮)
  frequency: 3, // 揺れの往復回数(仮)
};

let correctShakeStart = -Infinity;
let missShakeStart = -Infinity;

function triggerCorrectShake(now) {
  correctShakeStart = now;
}

function triggerMissShake(now) {
  missShakeStart = now;
}

// 経過時間・開始時刻・プロファイルから現在のシェイク量(x, y, rotation)を計算する。減衰しながら振動する。
function computeShakeOffset(now, startTime, profile) {
  const elapsed = now - startTime;
  if (elapsed >= profile.duration) return { x: 0, y: 0, rotation: 0 };

  const t = elapsed / profile.duration;
  const decay = 1 - t;
  const angle = t * profile.frequency * Math.PI * 2;
  return {
    x: Math.sin(angle) * profile.magnitude * decay,
    y: Math.cos(angle * 1.3) * profile.magnitude * decay * 0.6,
    rotation: Math.sin(angle) * profile.rotation * decay,
  };
}

// 正解シェイクとMISSシェイクが同時に有効な場合は単純に合算する(通常は同時に起きない)
function getShakeTransform(now) {
  const a = computeShakeOffset(now, correctShakeStart, CORRECT_SHAKE);
  const b = computeShakeOffset(now, missShakeStart, MISS_SHAKE);
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    rotation: a.rotation + b.rotation,
  };
}

// --- 出題難易度調整 ---
// 3種類目のネタ(NETA_TYPES[2])は、序盤ほど出現重みを下げて「わずかに」登場させ、
// DIFFICULTY_FULL_RANDOM_STAGEに達したら他と同じ重み(=完全ランダム)にする。
// ゲームは大体ステージ4くらいで終わる想定なので、ステージ3で完全ランダムになるよう既定値を置いている。
const DIFFICULTY_THIRD_TYPE_START_WEIGHT = 0.05; // ステージ1での3種類目の重み(1.0が均等)
const DIFFICULTY_FULL_RANDOM_STAGE = 3; // このステージ以降は重み1.0(完全ランダム)

function getThirdTypeWeight(stage) {
  if (stage >= DIFFICULTY_FULL_RANDOM_STAGE) return 1;
  const t = (stage - 1) / (DIFFICULTY_FULL_RANDOM_STAGE - 1);
  return DIFFICULTY_THIRD_TYPE_START_WEIGHT + (1 - DIFFICULTY_THIRD_TYPE_START_WEIGHT) * t;
}

// 現在のステージ(stageNumber)の難易度重みに従って、ネタを1つ抽選する
function weightedRandomNeta() {
  const thirdWeight = getThirdTypeWeight(stageNumber);
  const weights = NETA_TYPES.map((_, i) => (i === 2 ? thirdWeight : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < NETA_TYPES.length; i++) {
    r -= weights[i];
    if (r <= 0) return NETA_TYPES[i];
  }
  return NETA_TYPES[NETA_TYPES.length - 1];
}

function randomOrder() {
  return Array.from({ length: PIECE_COUNT }, weightedRandomNeta);
}

// --- ゲーム状態 ---
// orders[0] = 進行中(入力対象), orders[1] = 次に控えている(遷移中は入力対象になる), orders[2] = その次(遷移中のみ画面右から見える)
// ステージの盛り台はSTAGE_PLATE_COUNT枚で打ち止め。それ以上はnullを詰めて「もう出てこない」ことを表す
let stageOrders = []; // このステージ分(4台)の内容。ステージ開始時に確定させる
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

let gamePhase = 'title'; // 'title' | 'countdown' | 'playing' | 'cleared' | 'gameover' | 'nameEntry' | 'submitting' | 'ranking'
let phaseStart = 0; // 現フェーズが始まった時刻
let stageStartTime = 0; // 'playing'に入った時刻(タイム計測用)
let sessionStartTime = 0; // タイトルを抜けてゲームを開始した時刻(ランキング送信のplayTime用)
let stageNumber = 1; // 現在のステージ番号(MISSペナルティの計算に使う)
let missCount = 0; // このステージのMISS数(ステージ開始でリセット)
let currentStreak = 0; // 現在のコンボ(ステージ開始・MISSで0にリセット)
let maxStreak = 0; // 過去最高コンボ(ステージクリアではリセットしない、通算の記録)
let platesClearedInStage = 0; // このステージで完成させた盛り台数
let noMissPlateCount = 0; // このステージでノーミス完成させた盛り台数(ステージ開始でリセット)
let clearStats = { time: 0, miss: 0, streak: 0 }; // クリア画面表示用に確定した記録

// --- ゲーム全体を通した通算スタッツ(1ゲーム=タイトルからゲームオーバーまで。ステージをまたいでリセットしない) ---
let totalPlatesCleared = 0; // 通算で完成させた盛り台数
let totalPiecesMade = 0; // 通算で握った貫数
let totalMissCount = 0; // 通算のMISS回数
let totalNoMissPlates = 0; // 通算のノーミス盛り台数
let currentNoMissPlateStreak = 0; // 現在の連続ノーミス盛り台数(MISSのあった盛り台で0にリセット)
let maxNoMissPlateStreak = 0; // 過去最長の連続ノーミス盛り台数
let gameOverStats = { stage: 0, plates: 0, pieces: 0, miss: 0, maxCombo: 0, noMissPlates: 0, maxNoMissStreak: 0, playTime: 0 }; // ゲームオーバー画面表示用

// --- ランキング送信・表示 ---
let rankingList = []; // fetchRankingの結果({rank, name, score}の配列)
let ownRank = null; // 直近の送信でのランキング順位(nullなら未送信/失敗)
let rankingErrorMessage = ''; // 送信/取得に失敗した場合のメッセージ
let isNewBest = false; // 今回のプレイが自己ベストを更新したか
let rankChangeArrow = ''; // プレイ前後の順位変動('↑' | '↓' | '')
let rankingReachedFromGameOver = false; // 今のランキング画面がプレイ後の遷移で来たものか(「戻る」ボタンの表示判定用)

// --- GAMEOVER直後の自動送信・後からの名前変更 ---
// 離脱による記録消失を防ぐため、GAMEOVER画面が表示された時点で名前未入力でも(NO NAMEで)即送信する。
// あとから名前入力があった場合は、このIDを使ってレコードの名前だけを書き換える。
let gameOverSubmitPromise = null; // GAMEOVER時点の自動送信のPromise(完了待ちに使う)
let lastSubmittedId = null; // 自動送信で得られたレコードID(renameRecordに使う。失敗時はnull)
let pendingRenameName = null; // 名前入力で確定された、送信後に反映すべき名前(null/空なら変更不要)
let nameEntryHandledThisGameOver = false; // このGAMEOVERで名前入力/送信待ちの工程を既に済ませたか(「戻る」から再度進んだ時に使う)

// --- 制限時間 ---
const INITIAL_TIME = 30; // 秒、ゲーム開始時の残り時間
const STAGE_CLEAR_TIME_BONUS = 2; // 秒、ステージクリアで加算
const PLATE_NO_MISS_BONUS = 1; // 秒、盛り台1台をノーミスで完成させると加算
const MISS_TIME_PENALTY_PER_STAGE = 0.5; // 秒、MISS1回のペナルティ = ステージ番号 × この値

let timeRemaining = INITIAL_TIME; // 残り時間(秒)。'playing'中のみ減少する
let lastMissPenalty = 0; // 直近のMISSで引かれた秒数(MISS表示用)
let lastFrameTime = null; // 前回updateが呼ばれた時刻(dt計算用)

const NO_MISS_BONUS_DISPLAY_DURATION = 500; // ms
const NO_MISS_BONUS_RISE_DISTANCE = 10; // px
let noMissBonusStart = 0; // 「ノーミス +1秒」表示アニメーションの開始時刻(ms)
let noMissBonusUntil = 0; // この時刻(ms)まで表示

const COUNTDOWN_STEPS = [
  { label: 'ステージ開始!', duration: 500, sound: null },
  { label: '3', duration: 400, sound: 'countdownTick' },
  { label: '2', duration: 300, sound: 'countdownTick' },
  { label: '1', duration: 200, sound: 'countdownTick' },
  { label: 'GO', duration: 200, sound: 'countdownGo' },
];
const COUNTDOWN_TOTAL_DURATION = COUNTDOWN_STEPS.reduce((sum, s) => sum + s.duration, 0);
let lastCountdownStepIndex = -1; // 直近で音を鳴らしたステップのインデックス(ステップが変わった瞬間だけ鳴らす)

function getCountdownStepIndex(elapsed) {
  let acc = 0;
  for (let i = 0; i < COUNTDOWN_STEPS.length; i++) {
    acc += COUNTDOWN_STEPS[i].duration;
    if (elapsed < acc) return i;
  }
  return COUNTDOWN_STEPS.length - 1;
}

// 決まった組み合わせのお手本(名前 + 8貫分の並び + 出現条件)。ここに追加・編集すれば増減できる。
// minThirdWeight: このプリセットを出してよい、3種類目(エビ)の出現重みの下限(getThirdTypeWeightの返り値と比較)。
// エビに依存しない組み合わせは0(常に出現可)、エビ比率が高いほど大きい値にして序盤に出ないようにする。
const PRESET_ORDERS = [
  { name: 'マグロづくし', pattern: ['toro','toro','toro','toro','toro','toro','toro','toro'], minThirdWeight: 0 },
  { name: 'たまごづくし', pattern: ['tamago','tamago','tamago','tamago','tamago','tamago','tamago','tamago'], minThirdWeight: 0 },
  { name: 'エビづくし', pattern: ['ebi','ebi','ebi','ebi','ebi','ebi','ebi','ebi'], minThirdWeight: 1 },

  { name: 'マグロづくし?', pattern: ['toro','toro','toro','toro','toro','toro','toro','tamago'], minThirdWeight: 0 },
  { name: 'マグロづくし?', pattern: ['toro','toro','toro','tamago','toro','toro','toro','toro'], minThirdWeight: 0 },
  { name: 'マグロづくし?', pattern: ['toro','toro','toro','toro','toro','toro','toro','ebi'], minThirdWeight: 0.25 },
  { name: 'マグロづくし?', pattern: ['toro','toro','toro','ebi','toro','toro','toro','toro'], minThirdWeight: 0.25 },
  { name: 'たまごづくし?', pattern: ['tamago','tamago','tamago','tamago','tamago','tamago','tamago','toro'], minThirdWeight: 0 },
  { name: 'たまごづくし?', pattern: ['tamago','tamago','tamago','toro','tamago','tamago','tamago','tamago'], minThirdWeight: 0 },
  { name: 'たまごづくし?', pattern: ['tamago','tamago','tamago','tamago','tamago','tamago','tamago','ebi'], minThirdWeight: 0.25 },
  { name: 'たまごづくし?', pattern: ['tamago','tamago','tamago','ebi','tamago','tamago','tamago','tamago'], minThirdWeight: 0.25 },
  { name: 'エビづくし?', pattern: ['ebi','ebi','ebi','ebi','ebi','ebi','ebi','toro'], minThirdWeight: 1 },
  { name: 'エビづくし?', pattern: ['ebi','ebi','ebi','toro','ebi','ebi','ebi','ebi'], minThirdWeight: 1 },
  { name: 'エビづくし?', pattern: ['ebi','ebi','ebi','ebi','ebi','ebi','ebi','tamago'], minThirdWeight: 1 },
  { name: 'エビづくし?', pattern: ['ebi','ebi','ebi','tamago','ebi','ebi','ebi','ebi'], minThirdWeight: 1 },

  { name: 'ひだまり', pattern: ['toro','toro','toro','toro','tamago','tamago','tamago','tamago'], minThirdWeight: 0 },
  { name: 'ひだまり', pattern: ['tamago','tamago','tamago','tamago','toro','toro','toro','toro'], minThirdWeight: 0 },
  { name: 'ひだまり', pattern: ['toro','tamago','toro','tamago','toro','tamago','toro','tamago'], minThirdWeight: 0 },
  { name: 'ひだまり', pattern: ['tamago','toro','tamago','toro','tamago','toro','tamago','toro'], minThirdWeight: 0 },

  { name: 'こもれび', pattern: ['toro','toro','toro','toro','ebi','ebi','ebi','ebi'], minThirdWeight: 0.5 },
  { name: 'こもれび', pattern: ['ebi','ebi','ebi','ebi','toro','toro','toro','toro'], minThirdWeight: 0.5 },
  { name: 'エビたま', pattern: ['ebi','tamago','ebi','tamago','ebi','tamago','ebi','tamago'], minThirdWeight: 0.5 },
  { name: 'エビたま', pattern: ['tamago','ebi','tamago','ebi','tamago','ebi','tamago','ebi'], minThirdWeight: 0.5 },
];

let presetOrderRef = null; // このステージでプリセットを割り当てた配列そのもの(参照比較で判定に使う)
let presetOrderName = ''; // その組み合わせの名前(お手本の右上に表示)

// このステージ分(STAGE_PLATE_COUNT枚)の盛り台をあらかじめ確定させ、表示用の3枠にセットする
function generateStageOrders() {
  stageOrders = Array.from({ length: STAGE_PLATE_COUNT }, randomOrder);

  // このステージの3種類目の出現重みを満たすプリセットだけを候補にする
  const thirdWeight = getThirdTypeWeight(stageNumber);
  const eligiblePresets = PRESET_ORDERS.filter((p) => thirdWeight >= p.minThirdWeight);
  const presetPool = eligiblePresets.length > 0 ? eligiblePresets : PRESET_ORDERS;

  // このステージのどこか1枚を、決まった組み合わせ(プリセット)に差し替える
  const presetIndex = Math.floor(Math.random() * STAGE_PLATE_COUNT);
  const preset = presetPool[Math.floor(Math.random() * presetPool.length)];
  stageOrders[presetIndex] = [...preset.pattern];
  presetOrderRef = stageOrders[presetIndex];
  presetOrderName = preset.name;

  nextOrderIndex = Math.min(3, STAGE_PLATE_COUNT);
  orders = [stageOrders[0] ?? null, stageOrders[1] ?? null, stageOrders[2] ?? null];
}

function startTitle(now) {
  gamePhase = 'title';
  phaseStart = now;
  layoutTitleRankingButton();
  titleRankingBtn.style.display = 'block';
  titleChangeNameBtn.style.display = 'block';
  startTitleRankRefresh();
}

function startGame(now) {
  titleRankingBtn.style.display = 'none';
  titleChangeNameBtn.style.display = 'none';
  rankingBackBtn.style.display = 'none';
  stopTitleRankRefresh();
  stageNumber = 1;
  timeRemaining = INITIAL_TIME;
  maxStreak = 0;
  totalPlatesCleared = 0;
  totalPiecesMade = 0;
  totalMissCount = 0;
  totalNoMissPlates = 0;
  currentNoMissPlateStreak = 0;
  maxNoMissPlateStreak = 0;
  sessionStartTime = now;
  startCountdown(now);
}

function startGameOver(now) {
  gamePhase = 'gameover';
  phaseStart = now;
  gameOverStats = {
    stage: stageNumber,
    plates: totalPlatesCleared,
    pieces: totalPiecesMade,
    miss: totalMissCount,
    maxCombo: maxStreak,
    noMissPlates: totalNoMissPlates,
    maxNoMissStreak: maxNoMissPlateStreak,
    playTime: now - sessionStartTime,
  };

  // 自己ベストはローカルだけで完結する判定なので、通信結果を待たずに確定させる
  isNewBest = updateBestScore(gameOverStats.pieces);

  // 新しいゲームオーバーなので、前回分の状態をリセット
  lastSubmittedId = null;
  pendingRenameName = null;
  nameEntryHandledThisGameOver = false;
  rankingErrorMessage = '';
  ownRank = null;
  rankChangeArrow = '';

  // 名前入力を待たず、この時点で(未入力なら'NO NAME'で)即送信する。
  // こうしないと、名前を入れる前に離脱された場合に記録が一切残らないため。
  gameOverSubmitPromise = submitScore({
    score: gameOverStats.pieces,
    stages: gameOverStats.stage,
    playTime: Math.round(gameOverStats.playTime),
  })
    .then((result) => {
      lastSubmittedId = result.id;
      // /api/scoreのrankは「今回送信したスコアそのもの」の順位であり、
      // 自己ベストを更新できなかった場合は実際の順位と食い違う。
      // タイトル画面の「現在○位」と同じ、自己ベストに基づく順位(/api/me)を正として使う。
      return fetchMyRank();
    })
    .then((data) => {
      if (!data.registered) return; // 送信直後なので通常ここには来ないはずだが念のため
      ownRank = data.rank;

      if (sessionStartRank !== null && ownRank !== sessionStartRank) {
        rankChangeArrow = ownRank < sessionStartRank ? '↑' : '↓';
      }
      setLastKnownRank(ownRank); // 次にタイトルに戻った時の比較基準を更新
    })
    .catch((err) => {
      console.error('スコア送信に失敗しました', err);
      rankingErrorMessage = 'ランキングとの通信に失敗しました';
    });
}

// returnPhase: 確定後にどこへ進むか。'submitting'(ゲームオーバー経由、スコア送信へ) | 'title'(タイトルの「名前を変える」経由)
let nameEntryReturnPhase = 'submitting';

function startNameEntry(now, returnPhase) {
  gamePhase = 'nameEntry';
  phaseStart = now;
  nameEntryReturnPhase = returnPhase || 'submitting';
  nameInput.value = getPlayerName();
  layoutNameEntryElements();
  nameEntryLabel.style.display = 'block';
  nameInput.style.display = 'block';
  nameConfirmBtn.style.display = 'block';
  nameInput.focus();
}

function hideNameEntryElements() {
  nameEntryLabel.style.display = 'none';
  nameInput.style.display = 'none';
  nameConfirmBtn.style.display = 'none';
}

function confirmNameEntry() {
  if (gamePhase !== 'nameEntry') return;
  const name = setPlayerName(nameInput.value);
  hideNameEntryElements();
  if (nameEntryReturnPhase === 'title') {
    startTitle(performance.now());
  } else {
    pendingRenameName = name || null; // 空欄のままならrename不要('NO NAME'のまま)
    startSubmitting(performance.now());
  }
}

nameConfirmBtn.addEventListener('click', confirmNameEntry);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmNameEntry();
  }
});

titleChangeNameBtn.addEventListener('click', () => {
  if (gamePhase !== 'title') return;
  titleRankingBtn.style.display = 'none';
  titleChangeNameBtn.style.display = 'none';
  stopTitleRankRefresh();
  startNameEntry(performance.now(), 'title');
});

// GAMEOVER時点で開始済みの自動送信(gameOverSubmitPromise)の完了を待ち、
// 必要なら名前変更(rename)を反映してからランキングを取得して表示する。
function startSubmitting(now) {
  gamePhase = 'submitting';
  phaseStart = now;
  rankingReachedFromGameOver = true;

  gameOverSubmitPromise
    .then(() => {
      // 自動送信が成功しており、かつ名前入力で新しい名前が確定していればrenameする
      if (lastSubmittedId && pendingRenameName) {
        const nameToApply = pendingRenameName;
        pendingRenameName = null;
        return renameRecord(lastSubmittedId, nameToApply).catch((err) => {
          console.error('名前の変更に失敗しました', err);
          // renameに失敗しても、送信済みの記録自体(NO NAME)は残っているのでエラー扱いにはしない
        });
      }
    })
    .then(() => fetchRanking(RANKING_LIMIT).catch((err) => {
      console.error('ランキング一覧の取得に失敗しました', err);
      return [];
    }))
    .then((list) => {
      rankingList = list || [];
      startRankingScreen(performance.now());
    });
}

// タイトル画面から「ランキングを見る」を押した場合: スコア送信はせず取得だけ行う
function startViewRankingOnly(now) {
  gamePhase = 'submitting'; // 表示は送信時と共通(「サーバアクセス中」)
  phaseStart = now;
  rankingErrorMessage = '';
  ownRank = null;
  isNewBest = false; // プレイしていないので自己ベスト・順位変動は対象外
  rankChangeArrow = '';
  rankingReachedFromGameOver = false;

  fetchRanking(RANKING_LIMIT)
    .then((list) => {
      rankingList = list;
      startRankingScreen(performance.now());
    })
    .catch((err) => {
      console.error('ランキング取得に失敗しました', err);
      rankingList = [];
      rankingErrorMessage = 'ランキングとの通信に失敗しました';
      startRankingScreen(performance.now());
    });
}

titleRankingBtn.addEventListener('click', () => {
  if (gamePhase !== 'title') return;
  titleRankingBtn.style.display = 'none';
  stopTitleRankRefresh();
  startViewRankingOnly(performance.now());
});

function startRankingScreen(now) {
  gamePhase = 'ranking';
  phaseStart = now;

  if (rankingReachedFromGameOver) {
    layoutRankingBackButton();
    rankingBackBtn.style.display = 'block';
  } else {
    rankingBackBtn.style.display = 'none';
  }
}

rankingBackBtn.addEventListener('click', () => {
  if (gamePhase !== 'ranking' || !rankingReachedFromGameOver) return;
  rankingBackBtn.style.display = 'none';
  gamePhase = 'gameover';
  phaseStart = performance.now();
});

function startCountdown(now) {
  gamePhase = 'countdown';
  phaseStart = now;
  lastCountdownStepIndex = -1; // カウントダウンSE用(ステップが変わった瞬間だけ鳴らす)

  // 前のステージの状態(特にスライド演出を強制キャンセルした場合の取りこぼし)を
  // 必ずここでクリアしてから新しいステージを組み立てる
  transitionActive = false;
  transitionOffset = 0;
  showGood = false;
  progress = 0;
  nextProgress = 0;

  generateStageOrders();
}

function startPlayingStage(now) {
  gamePhase = 'playing';
  stageStartTime = now;
  missCount = 0;
  currentStreak = 0;
  platesClearedInStage = 0;
  noMissPlateCount = 0;
  plateMissed = false; // 1台目のノーミス判定用
  // maxStreak は通算の記録なのでここではリセットしない
  startBgmOnce(); // 「ステージ開始!→3→2→1→GO」の直後にBGMを鳴らす
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
  playSound('plateComplete');

  // 今完成した盛り台がノーミスならボーナス。判定後、次の盛り台用にリセットする
  if (!plateMissed) {
    playNoMissPlateSound();
    timeRemaining += PLATE_NO_MISS_BONUS;
    noMissPlateCount++;
    totalNoMissPlates++;
    currentNoMissPlateStreak++;
    if (currentNoMissPlateStreak > maxNoMissPlateStreak) {
      maxNoMissPlateStreak = currentNoMissPlateStreak;
    }
    noMissBonusStart = now;
    noMissBonusUntil = now + NO_MISS_BONUS_DISPLAY_DURATION;
  } else {
    currentNoMissPlateStreak = 0;
  }
  plateMissed = false;

  platesClearedInStage++;
  totalPlatesCleared++;
  if (platesClearedInStage >= STAGE_PLATE_COUNT) {
    // フレームアウトが始まると同時にクリア画面を表示する(スライド演出自体は最後まで裏で続く)
    startClearScreen(now);
  }
}

function registerMiss(now) {
  inputLocked = true;
  missStart = now;
  missUntil = now + 300;
  playSound('miss');
  triggerMissShake(now);
  missCount++;
  totalMissCount++;
  currentStreak = 0;
  plateMissed = true;

  lastMissPenalty = stageNumber * MISS_TIME_PENALTY_PER_STAGE;
  timeRemaining -= lastMissPenalty;
  if (timeRemaining <= 0) {
    timeRemaining = 0;
    startGameOver(now);
  }
}

function registerCorrect(now) {
  currentStreak++;
  if (currentStreak > maxStreak) maxStreak = currentStreak;
  totalPiecesMade++;
  playCorrectEffect(now);
  triggerCorrectShake(now);
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
      registerCorrect(now);
      lastPieceRevealSlot = 1;
      lastPieceRevealIndex = nextProgress - 1;
      lastPieceRevealTime = now;
    } else {
      registerMiss(now);
    }
    return;
  }

  if (!orders[0]) return; // 念のため(通常はここがnullになることはない)

  if (type === orders[0][progress]) {
    progress++;
    playCorrectSound(type);
    registerCorrect(now);
    lastPieceRevealSlot = 0;
    lastPieceRevealIndex = progress - 1;
    lastPieceRevealTime = now;
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
      flashNetaButton(i);
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
    if (now - phaseStart >= START_IGNORE_DURATION) {
      stageNumber++;
      startCountdown(now); // 前ステージの取りこぼし状態のクリアはstartCountdown側で行う
    }
    return true;
  }

  if (gamePhase === 'gameover') {
    if (now - phaseStart >= START_IGNORE_DURATION) {
      if (nameEntryHandledThisGameOver) {
        // 「戻る」で見返しているだけなので、名前入力は行わずランキングへ(送信自体はGAMEOVER表示時点で済んでいる)
        startSubmitting(now);
      } else if (getPlayerName()) {
        // 名前は登録済みなので入力を省略。送信(GAMEOVER表示時点で自動送信済み)の完了を待つだけ
        nameEntryHandledThisGameOver = true;
        startSubmitting(now);
      } else {
        // 初回のみ名前を聞く
        nameEntryHandledThisGameOver = true;
        startNameEntry(now);
      }
    }
    return true;
  }

  if (gamePhase === 'nameEntry' || gamePhase === 'submitting') {
    // 名前入力欄・OKボタン・送信待ちの間は、タップ/キーで先に進めない
    return true;
  }

  if (gamePhase === 'ranking') {
    if (now - phaseStart >= RANKING_IGNORE_DURATION) {
      rankingBackBtn.style.display = 'none';
      startTitle(now);
    }
    return true;
  }

  return false;
}

canvas.addEventListener('pointerdown', (e) => {
  if (handleScreenInput()) return;
  handlePointer(e.clientX, e.clientY);
});

window.addEventListener('keydown', (e) => {
  if (e.target === nameInput) return; // 名前入力中はゲームのキー割り当てを無視する
  if (handleScreenInput()) return;
  const idx = NETA_KEYS.indexOf(e.key.toLowerCase());
  if (idx !== -1) {
    flashNetaButton(idx);
    attemptNeta(NETA_TYPES[idx]);
  }
});

// --- 描画 ---
// お手本(白い箱)の描画。シェイクの対象外なので、揺れる盛り台側とは別関数にしてある。
function drawSampleSlots() {
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

    // 決まった組み合わせのお手本なら、右上に名前を表示する
    if (order === presetOrderRef) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(presetOrderName, x, SAMPLE_ROW_Y - 16);
    }
  }
}

// 盛り台(トレー+盛り付けられた鮨)の描画。こちらはシェイクの対象。
function drawPlateSlots() {
  if (!moridaiImage) return;

  const now = performance.now();
  const slotCount = transitionActive ? 3 : PLATE_COLUMN_COUNT;

  // 直近で追加された1貫の出現アニメ(上から落ちて着地する)
  const dropT = Math.min((now - lastPieceRevealTime) / PIECE_DROP_DURATION, 1);
  const dropActive = dropT < 1;
  const dropEased = 1 - Math.pow(1 - dropT, 3); // ease-out
  const dropOffsetY = -PIECE_DROP_DISTANCE * (1 - dropEased);

  for (let i = 0; i < slotCount; i++) {
    const order = orders[i];
    if (!order) continue; // このステージにはもう盛り台が存在しない

    const x = slotX(i, transitionOffset);
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
    const dropIndex = dropActive && i === lastPieceRevealSlot ? lastPieceRevealIndex : -1;
    drawNigiriOnPlate(x, PLATE_ROW_Y, PLATE_COLUMN_WIDTH, plateHeight, order, revealCount, dropIndex, dropOffsetY);
  }
}

function drawNetaRow() {
  const now = performance.now();

  for (let i = 0; i < COLUMN_COUNT; i++) {
    const x = columnX(i);
    const pressing = now - netaButtonPressTime[i] < NETA_PRESS_FLASH_DURATION;

    // 押した瞬間はボタン中心を基準に少し拡大する
    let boxX = x, boxY = NETA_ROW_Y, boxW = COLUMN_WIDTH, boxH = NETA_ROW_HEIGHT;
    if (pressing) {
      boxW = COLUMN_WIDTH * NETA_PRESS_SCALE;
      boxH = NETA_ROW_HEIGHT * NETA_PRESS_SCALE;
      boxX = x + COLUMN_WIDTH / 2 - boxW / 2;
      boxY = NETA_ROW_Y + NETA_ROW_HEIGHT / 2 - boxH / 2;
    }

    ctx.fillStyle = pressing ? '#b9dcc4' : '#c9c9c9'; // 押下時はほのかに緑がかった色
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#8c8c8c';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    const img = netaImages[NETA_TYPES[i]];
    if (img) {
      drawImageContain(img, boxX + 8, boxY + 8, boxW - 16, boxH - 16);
    }

    // PCキー割り当てのヒント表示
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(NETA_KEYS[i].toUpperCase(), boxX + boxW / 2, boxY + boxH - 6);
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

// 正解時、画面中央に半透明のパラパラアニメエフェクトを再生する
function drawCorrectEffect() {
  const elapsed = performance.now() - correctEffectStart;
  if (elapsed >= CORRECT_EFFECT_TOTAL_DURATION) return;

  const frameIndex = Math.min(
    Math.floor(elapsed / CORRECT_EFFECT_FRAME_DURATION),
    CORRECT_EFFECT_FRAME_COUNT - 1
  );
  const img = correctEffectImages[frameIndex];
  if (!img) return;

  ctx.save();
  ctx.globalAlpha = CORRECT_EFFECT_OPACITY;
  ctx.drawImage(
    img,
    BASE_WIDTH / 2 - CORRECT_EFFECT_SIZE / 2,
    BASE_HEIGHT / 2 - CORRECT_EFFECT_SIZE / 2,
    CORRECT_EFFECT_SIZE,
    CORRECT_EFFECT_SIZE
  );
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
  ctx.font = 'bold 25px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`ノーミス +${PLATE_NO_MISS_BONUS}秒`, BASE_WIDTH / 2, y);
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
    '盛り台4台完成でステージクリア',
    '残り時間が0になるとゲームオーバー',
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 70 + i * 26);
  });

  if (titleRankText) {
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#ffd700';
    const arrowSuffix = titleRankArrow ? `  ${titleRankArrow}` : '';
    ctx.fillText(`${titleRankText}${arrowSuffix}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 65);
  }

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
  ctx.fillText('GAME OVER', BASE_WIDTH / 2, BASE_HEIGHT / 2 - 130);

  ctx.fillStyle = '#ffffff';
  ctx.font = '17px sans-serif';
  const statLines = [
    `到達ステージ: ${gameOverStats.stage}`,
    `握った貫数: ${gameOverStats.pieces}貫`,
    `最大コンボ: ${gameOverStats.maxCombo}貫`,
    `完成した盛り台: ${gameOverStats.plates}台`,
    `ノーミス盛り台: ${gameOverStats.noMissPlates}台`,
    `連続ノーミス盛り台: ${gameOverStats.maxNoMissStreak}台`,
    `MISS回数: ${gameOverStats.miss}回`,
  ];
  statLines.forEach((line, i) => {
    ctx.fillText(line, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 80 + i * 28);
  });

  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cccccc';
  ctx.fillText('タップ / キー入力でランキングへ', BASE_WIDTH / 2, BASE_HEIGHT / 2 + 150);
  ctx.restore();
}

// 名前入力画面(実際の入力欄・OKボタンはHTML要素をcanvasの上に重ねて表示している)
function drawNameEntryOverlay() {
  if (gamePhase !== 'nameEntry') return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.restore();
}

function drawSubmittingOverlay() {
  if (gamePhase !== 'submitting') return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('サーバアクセス中…', BASE_WIDTH / 2, BASE_HEIGHT / 2);
  ctx.restore();
}

function drawRankingOverlay() {
  if (gamePhase !== 'ranking') return;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText('ランキング TOP10', BASE_WIDTH / 2, 62);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#999999';
  ctx.fillText('※ 各プレイヤーのベストスコアを表示', BASE_WIDTH / 2, 86);

  // 自己ベスト更新・順位変動(どちらもなければ何も表示しない)
  const infoParts = [];
  if (isNewBest) infoParts.push('自己ベスト更新!');
  if (rankChangeArrow) infoParts.push(`順位 ${rankChangeArrow}`);
  if (infoParts.length > 0) {
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.fillText(infoParts.join('  '), BASE_WIDTH / 2, 106);
  }

  const startY = 132;
  const rowHeight = 38;

  if (rankingErrorMessage) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#ff8080';
    ctx.fillText(rankingErrorMessage, BASE_WIDTH / 2, BASE_HEIGHT / 2);
  } else if (rankingList.length === 0) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('まだ記録がありません', BASE_WIDTH / 2, BASE_HEIGHT / 2);
  } else {
    rankingList.forEach((r, i) => {
      const y = startY + i * rowHeight;
      const isOwn = ownRank !== null && r.rank === ownRank;

      if (isOwn) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
        ctx.fillRect(20, y - rowHeight / 2 + 2, BASE_WIDTH - 40, rowHeight - 4);
      }

      ctx.fillStyle = isOwn ? '#ffd700' : '#ffffff';
      ctx.font = isOwn ? 'bold 16px sans-serif' : '16px sans-serif';

      ctx.textAlign = 'left';
      ctx.fillText(`${r.rank}位`, 30, y - 6);
      ctx.textAlign = 'center';
      ctx.fillText(r.name || 'noname', BASE_WIDTH / 2, y - 6);
      ctx.textAlign = 'right';
      ctx.fillText(`${r.score}貫`, BASE_WIDTH - 30, y - 6);

      ctx.font = '11px sans-serif';
      ctx.fillStyle = isOwn ? '#e6c200' : '#999999';
      ctx.textAlign = 'right';
      ctx.fillText(`${r.plays ?? '-'}回プレイ`, BASE_WIDTH - 30, y + 11);
    });

    if (ownRank !== null && !rankingList.some((r) => r.rank === ownRank)) {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#cccccc';
      ctx.textAlign = 'center';
      ctx.fillText(`あなたの順位: ${ownRank}位`, BASE_WIDTH / 2, startY + rankingList.length * rowHeight + 24);
    }
  }

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'center';
  ctx.fillText('タップ / キー入力でタイトルへ', BASE_WIDTH / 2, BASE_HEIGHT - 40);
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  // 背景・盛り台だけをシェイク対象にする(お手本・ボタン・タイマー・各種テキストは揺らさない)
  const shake = getShakeTransform(performance.now());
  ctx.save();
  ctx.translate(BASE_WIDTH / 2 + shake.x, BASE_HEIGHT / 2 + shake.y);
  ctx.rotate(shake.rotation);
  ctx.translate(-BASE_WIDTH / 2, -BASE_HEIGHT / 2);

  drawBackground();
  drawPlateSlots();

  ctx.restore();

  drawSampleSlots();
  drawNetaRow();
  drawGoodText();
  drawMissText();
  drawCorrectEffect();
  drawTimer();
  drawNoMissBonusText();
  drawCountdownOverlay();
  drawClearOverlay();
  drawTitleOverlay();
  drawGameOverOverlay();
  drawNameEntryOverlay();
  drawSubmittingOverlay();
  drawRankingOverlay();
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

  if (
    gamePhase === 'title' ||
    gamePhase === 'gameover' ||
    gamePhase === 'nameEntry' ||
    gamePhase === 'submitting' ||
    gamePhase === 'ranking'
  ) {
    return; // 入力待ちのみ、演出やタイマーは進めない
  }

  if (gamePhase === 'countdown') {
    const elapsed = now - phaseStart;
    const stepIndex = getCountdownStepIndex(elapsed);
    if (stepIndex !== lastCountdownStepIndex) {
      lastCountdownStepIndex = stepIndex;
      const sound = COUNTDOWN_STEPS[stepIndex].sound;
      if (sound) playSound(sound);
    }

    if (elapsed >= COUNTDOWN_TOTAL_DURATION) {
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
  // (クリア画面は4台目のフレームアウト開始と同時に表示されるが、演出自体は最後まで見せる)
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
    if (bgmStarted) soundInstances.bgm.pause();
  } else {
    if (animationFrameId === null) {
      // 非表示だった間の経過時間をdt計算に含めない(タイマーが一気に減るのを防ぐ)
      lastFrameTime = null;
      animationFrameId = requestAnimationFrame(loop);
    }
    if (bgmStarted) soundInstances.bgm.play();
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
  ...CORRECT_EFFECT_SRC.map((src, i) => loadImage(src).then((img) => { correctEffectImages[i] = img; })),
]).catch((err) => console.error('画像の読み込みに失敗しました', err));

})();


// ============================================================
//  POST /api/name   { deviceId, name }
// ============================================================

async function updateName(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: 'invalid json' }, 400);
  }

  const { deviceId, name } = body;

  if (!UUID_RE.test(String(deviceId ?? ''))) {
    return json(request, { error: 'invalid deviceId' }, 400);
  }

  const cleanName = String(name ?? '').trim().slice(0, 20);
  if (!cleanName) {
    return json(request, { error: 'empty name' }, 400);
  }

  const result = await env.DB.prepare(
    `UPDATE scores SET name = ? WHERE device_id = ?`
  )
    .bind(cleanName, deviceId)
    .run();

  return json(request, {
    ok: true,
    name: cleanName,
    updated: result.meta.changes,
  });
}

