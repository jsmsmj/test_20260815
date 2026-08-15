// スマホ縦持ちを基準とした基準解像度。実機ごとの解像度差はこの比率のまま拡大縮小して吸収する。
const BASE_WIDTH = 360;
const BASE_HEIGHT = 600;
const MAX_DPR = 2;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// レイアウト定数(静的なモックアップ。実際のゲームロジックは未実装)
const COLUMN_COUNT = 3;
const SIDE_MARGIN = 12;
const COLUMN_GAP = 8;
const COLUMN_WIDTH =
  (BASE_WIDTH - SIDE_MARGIN * 2 - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

const SAMPLE_ROW_Y = 195;
const SAMPLE_ROW_HEIGHT = 130;
const PLATE_ROW_Y = 340;
const NETA_ROW_Y = 495;
const NETA_ROW_HEIGHT = 95;

// ネタ種類は一時的にトロ・サーモン・エビ(マグロ・イカ・タマゴの画像が用意でき次第差し替え予定)
const NETA_TYPES = ['toro', 'salmon', 'ebi'];
const NETA_SRC = {
  toro: 'imgs/toro.png',
  salmon: 'imgs/salmon.png',
  ebi: 'imgs/ebi.png',
};
const BG_SRC = 'imgs_ignore/ddc24c3d-e386-4c9d-bd7a-acf1f2776841.png';
const MORIDAI_SRC = 'imgs/moridai.png';

let bgImage = null;
let moridaiImage = null;
const netaImages = {};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function columnX(index) {
  return SIDE_MARGIN + index * (COLUMN_WIDTH + COLUMN_GAP);
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

  draw();
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

// お手本に並べる仮の握りセット(3列x3段のグリッドで整列。実際の組み合わせ抽選ロジックは未実装)
const NIGIRI_GRID_COLS = 3;
const NIGIRI_GRID_ROWS = 3;
const NIGIRI_GRID_PADDING = 0.02; // box幅に対する内側余白の比率
const NIGIRI_CELL_FILL = 1.3; // セルに対する握りの占有率(1.0超で隣のセルと重なる)

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

// お手本・盛り台に表示するネタの配置をボックスごとにランダム生成しておく(1回だけ生成し、以降の再描画でも固定)
function randomNigiriGrid() {
  return Array.from(
    { length: NIGIRI_GRID_ROWS * NIGIRI_GRID_COLS },
    () => NETA_TYPES[Math.floor(Math.random() * NETA_TYPES.length)]
  );
}
const sampleNigiriGrids = Array.from({ length: COLUMN_COUNT }, randomNigiriGrid);
const plateNigiriGrids = Array.from({ length: COLUMN_COUNT }, randomNigiriGrid);

// お手本(白い正方形の箱)用: 均等な3x3グリッド。
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

// 盛り台(木製トレー)は奥が狭く手前が広い台形なので、行ごとに幅を変えて台の天板に沿わせる。
// 配列は奥(上)→手前(下)の順。天板部分(前面の厚み・脚を除いた範囲)にのみ収める。
const PLATE_ROW_WIDTH_RATIO = [0.80, 0.90, 0.96];
const PLATE_ROW_Y_RATIO = [0.16, 0.38, 0.60];
const PLATE_ROW_HEIGHT_RATIO = 0.26;
const PLATE_CELL_FILL = 1.3;

function drawNigiriOnPlate(x, y, w, h, grid) {
  for (let row = 0; row < NIGIRI_GRID_ROWS; row++) {
    const rowWidth = w * PLATE_ROW_WIDTH_RATIO[row];
    const rowX = x + (w - rowWidth) / 2;
    const cellW = rowWidth / NIGIRI_GRID_COLS;
    const cellH = h * PLATE_ROW_HEIGHT_RATIO;
    const centerY = y + h * PLATE_ROW_Y_RATIO[row];

    for (let col = 0; col < NIGIRI_GRID_COLS; col++) {
      const img = netaImages[grid[row * NIGIRI_GRID_COLS + col]];
      if (!img) continue;

      const centerX = rowX + cellW * (col + 0.5);
      drawNigiriPiece(img, centerX, centerY, cellW * PLATE_CELL_FILL, cellH * PLATE_CELL_FILL);
    }
  }
}

function drawSampleRow() {
  for (let i = 0; i < COLUMN_COUNT; i++) {
    const x = columnX(i);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, SAMPLE_ROW_Y, COLUMN_WIDTH, SAMPLE_ROW_HEIGHT);
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, SAMPLE_ROW_Y, COLUMN_WIDTH, SAMPLE_ROW_HEIGHT);
    drawNigiriSet(x, SAMPLE_ROW_Y, COLUMN_WIDTH, SAMPLE_ROW_HEIGHT, sampleNigiriGrids[i]);
  }
}

function drawPlateRow() {
  if (!moridaiImage) return;
  const plateHeight = COLUMN_WIDTH * (moridaiImage.height / moridaiImage.width);
  for (let i = 0; i < COLUMN_COUNT; i++) {
    const x = columnX(i);
    ctx.drawImage(moridaiImage, x, PLATE_ROW_Y, COLUMN_WIDTH, plateHeight);
    drawNigiriOnPlate(x, PLATE_ROW_Y, COLUMN_WIDTH, plateHeight, plateNigiriGrids[i]);
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
  }
}

function draw() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  drawBackground();
  drawSampleRow();
  drawPlateRow();
  drawNetaRow();
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// iOS Safari 等はアドレスバーの表示/非表示だけでは resize が発火しないことがあるため
// visualViewport の変化も監視する
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}

resize();

Promise.all([
  loadImage(BG_SRC).then((img) => { bgImage = img; }),
  loadImage(MORIDAI_SRC).then((img) => { moridaiImage = img; }),
  ...NETA_TYPES.map((type) => loadImage(NETA_SRC[type]).then((img) => { netaImages[type] = img; })),
])
  .then(draw)
  .catch((err) => console.error('画像の読み込みに失敗しました', err));
