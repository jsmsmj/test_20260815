// main.jsはフェーズを横断する合成ルートだけを持つ。ゲーム内容そのものは各フェーズモジュール
// (phases/*.js)に、土台となる仕組みはengine.js/sounds.js/images.js/globalError.jsに分かれている。
// フェーズ同士は直接importし合わない。遷移はgoTo(name, payload)を介して行い、フェーズ間で
// 引き継ぐ必要がある値はpayloadで渡す(例外的にnameEntry.jsだけはgameover.jsを一方向にimportする。
// 理由は各ファイル冒頭のコメントを参照)。
import { CanvasButtons } from './canvasButtons.js';
import { Engine, BASE_WIDTH, BASE_HEIGHT } from './engine.js';
import { Sounds } from './sounds.js';
import { Images } from './images.js';
import { GlobalError } from './globalError.js';
import { DebugFlags } from './debugFlags.js';
import { TitlePhase } from './phases/title.js';
import { GameplayPhase } from './phases/gameplay.js';
import { GameoverPhase } from './phases/gameover.js';
import { NameEntryPhase } from './phases/nameEntry.js';
import { RankingPhase } from './phases/ranking.js';

(function () {

const MAX_DPR = 2;

const canvas = document.getElementById('game-canvas');
const nameInput = document.getElementById('name-input');
const ctx = Engine.init({ canvas, baseWidth: BASE_WIDTH, baseHeight: BASE_HEIGHT, maxDpr: MAX_DPR });

// --- フェーズレジストリと画面遷移 ---
const phases = {
  title: TitlePhase,
  gameplay: GameplayPhase,
  gameover: GameoverPhase,
  nameEntry: NameEntryPhase,
  ranking: RankingPhase,
};

let current = 'title';

function goTo(name, payload) {
  phases[current].exit?.();
  CanvasButtons.setButtons(null); // 前フェーズのボタンを必ず一度クリアしてから次のenter()に入る
  current = name;
  phases[name].enter(performance.now(), payload);
}

for (const phase of Object.values(phases)) {
  phase.init(goTo);
}

// デバッグパネル(index_debug.html)の「ゲームオーバー画面へ」「ステージクリア画面へ」ボタン用。
// 実プレイなしで画面レイアウトを確認できるよう、ダミーの記録で直接該当フェーズへ遷移する。
const DEBUG_DUMMY_GAMEOVER_STATS = {
  stage: 3, plates: 10, pieces: 45, miss: 4, maxCombo: 12, noMissPlates: 6, maxNoMissStreak: 4, playTime: 42000,
};
DebugFlags.forceGameOver = () => goTo('gameover', DEBUG_DUMMY_GAMEOVER_STATS);
DebugFlags.forceCleared = () => {
  goTo('gameplay');
  GameplayPhase.debugForceClearedScreen();
};

// --- 入力 ---
// canvasボタンを持つフェーズ(title/gameover/ranking)は、自分のenter()でCanvasButtons.setButtons()
// を呼んでおり、押下判定はCanvasButtonsが内部で持つ配列を見て行う。持たないフェーズ(gameplay)は
// fallbackでフェーズ自身のhandleInputに委ねる(nameEntryはHTML要素側が入力を処理するので、
// handleInputを持たずここでは何もしない)。
CanvasButtons.bind(canvas, {
  getPos: Engine.getBasePos,
  fallback(e) {
    const pos = Engine.getBasePos(e.clientX, e.clientY);
    phases[current].handleInput?.(pos);
  },
});

// ゲームが反応するキーはa/s/d/スペースのみ(SHIFT/CTRL/ALTなどの修飾キーの状態は見ない)。
const ACCEPTED_KEYS = ['a', 's', 'd', ' '];

window.addEventListener('keydown', (e) => {
  if (e.target === nameInput) return; // 名前入力中はゲームのキー割り当てを無視する
  const key = e.key.toLowerCase();
  if (!ACCEPTED_KEYS.includes(key)) return;
  phases[current].handleKey?.(key);
});

// --- 描画 ---
function draw() {
  ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  phases[current].draw(ctx);
  CanvasButtons.drawButtons(ctx);

  GlobalError.draw(ctx);
}

// --- 更新(時間ベース。フレームレートに依存しない) ---
function update(now, dt) {
  phases[current].update?.(now, dt);
}

// タブが非アクティブ(バックグラウンド)になったらBGMを止め、復帰したら再開する
// (ゲームループ自体の一時停止/再開はEngine側が担う)
Engine.onHide(Sounds.pauseBgm);
Engine.onShow(Sounds.resumeBgm);

goTo('title');
Engine.start((now, dt) => {
  update(now, dt);
  draw();
});

Images.preloadAll();

})();
