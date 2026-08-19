// --- titleフェーズ ---
import { CanvasButtons } from '../canvasButtons.js';
import { RankingManager } from '../rankingManager.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../engine.js';
import { GlobalError } from '../globalError.js';
import { Images } from '../images.js';

export const TitlePhase = (() => {
  let goTo = null;

  const START_IGNORE_DURATION = 500; // 表示直後にGAME STARTを無視する時間(ms)
  const TITLE_RANK_REFRESH_INTERVAL = 60000; // ms(画面側の更新頻度なのでここに置く)

  let enterTime = 0;
  let titleRankText = ''; // タイトル画面表示専用のローカル変数
  let titleRankArrow = ''; // '↑' | '↓' | ''(タイトル画面表示専用のローカル変数)
  let titleRankRefreshTimer = null;

  function refreshTitleRank() {
    RankingManager.fetchMyRank().then((result) => {
      if (!result.ok) {
        // 失敗時のログはRankingManager内で出力済み。古い順位を残したままにすると
        // 「通信できていないのに順位が出ている」ように見えてしまうため、表示をクリアする
        titleRankText = '順位を取得できませんでした';
        titleRankArrow = '';
        GlobalError.trigger('ランキングとの通信に失敗しました');
        return;
      }
      const data = result.data;
      if (!data.registered) {
        titleRankText = 'まだ記録がありません';
        titleRankArrow = '';
        RankingManager.setSessionStartRank(null);
        return;
      }
      const newRank = data.rank;
      const baseline = RankingManager.getLastKnownRank(); // 直前のプレイ時点の順位(ここでは更新しない)
      titleRankArrow = baseline !== null && newRank !== baseline ? (newRank < baseline ? '↑' : '↓') : '';
      titleRankText = `現在 ${newRank}位`;
      RankingManager.setSessionStartRank(newRank); // 次にプレイする時の「プレイ前の順位」として保持
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

  function buildButtons() {
    return [
      {
        id: 'titleStart',
        x: BASE_WIDTH / 2 - 100, y: BASE_HEIGHT / 2 + 90, w: 200, h: CanvasButtons.PRIMARY_HEIGHT,
        label: 'GAME START',
        primary: true,
        onClick() {
          const now = performance.now();
          if (now - enterTime >= START_IGNORE_DURATION) {
            stopTitleRankRefresh();
            goTo('gameplay');
          }
        },
      },
      {
        id: 'titleRanking',
        x: BASE_WIDTH / 2 - 90, y: BASE_HEIGHT / 2 + 172, w: 180, h: CanvasButtons.SECONDARY_HEIGHT,
        label: 'ランキングを見る',
        onClick() {
          stopTitleRankRefresh();
          goTo('ranking', { reachedFromGameOver: false });
        },
      },
      {
        id: 'titleChangeName',
        x: BASE_WIDTH / 2 - 90, y: BASE_HEIGHT / 2 + 214, w: 180, h: CanvasButtons.SECONDARY_HEIGHT,
        label: '名前を変える',
        onClick() {
          stopTitleRankRefresh();
          goTo('nameEntry', { returnTo: 'title' });
        },
      },
    ];
  }

  function enter(now) {
    enterTime = now;
    startTitleRankRefresh();
    CanvasButtons.setButtons(buildButtons());
  }

  function exit() {
    stopTitleRankRefresh();
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

    ctx.restore();
  }

  function init(goToFn) {
    goTo = goToFn;
  }

  return { init, enter, exit, draw };
})();
