// --- nameEntryフェーズ ---
// 実際の入力欄・OKボタンはHTML要素をcanvasの上に重ねて表示している(IME操作が必要なため)。
// canvas側の描画は背景の暗転のみ。
import { PlayerIdentity } from '../playerIdentity.js';
import { RankingManager } from '../rankingManager.js';
import { Engine, BASE_WIDTH, BASE_HEIGHT } from '../engine.js';
import { GameoverPhase } from './gameover.js';
import { Images } from '../images.js';

export const NameEntryPhase = (() => {
  let goTo = null;
  let active = false;
  let returnTo = 'submit'; // 'submit'(ゲームオーバー経由) | 'title'(タイトルの「名前を変える」経由) | 'gameoverRename'(GAMEOVER画面上での名前変更)

  const nameEntryLabel = document.getElementById('name-entry-label');
  const nameInput = document.getElementById('name-input');
  const nameConfirmBtn = document.getElementById('name-confirm-btn');

  // 名前入力欄はcanvas座標ではなく、実際に見えている範囲(window.visualViewport)基準で配置する。
  // iOS Safariはソフトキーボード表示時にwindow.innerHeightを縮めないことが多く、
  // canvas基準(position:fixedの座標系)のままだとキーボードの下(画面外)に入力欄が来てしまうため。
  function layoutElements() {
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

  Engine.onResize(() => {
    if (active) layoutElements();
  });

  function hideElements() {
    nameEntryLabel.style.display = 'none';
    nameInput.style.display = 'none';
    nameConfirmBtn.style.display = 'none';
  }

  function confirm() {
    if (!active) return;
    const name = PlayerIdentity.setPlayerName(nameInput.value);
    active = false;
    hideElements();

    if (returnTo === 'title') {
      goTo('title');
    } else if (returnTo === 'gameoverRename') {
      // 直前のGAMEOVERで送信済みのレコードの名前だけを書き換える(空欄なら変更しない)
      // 失敗してもログはRankingManager内で出力済み。送信済みの記録自体(NO NAME)は残っているのでエラー扱いにはしない
      const lastSubmittedId = GameoverPhase.getLastSubmittedId();
      if (name && lastSubmittedId) {
        RankingManager.renameRecord(lastSubmittedId, name);
      }
      goTo('gameover', { resume: true });
    } else {
      GameoverPhase.confirmRenameAndGoToRanking(name);
    }
  }

  nameConfirmBtn.addEventListener('click', confirm);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirm();
    }
  });

  function enter(now, payload) {
    active = true;
    returnTo = (payload && payload.returnTo) || 'submit';
    nameInput.value = PlayerIdentity.getPlayerName();
    layoutElements();
    nameEntryLabel.style.display = 'block';
    nameInput.style.display = 'block';
    nameConfirmBtn.style.display = 'block';
    nameInput.focus();
  }

  function drawBackground(ctx) {
    const bgImage = Images.bg;
    if (!bgImage) return;
    const scale = BASE_WIDTH / bgImage.width;
    ctx.drawImage(bgImage, 0, 0, BASE_WIDTH, bgImage.height * scale);
  }

  function draw(ctx) {
    drawBackground(ctx);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
    ctx.restore();
  }

  function init(goToFn) {
    goTo = goToFn;
  }

  return { init, enter, draw };
})();
