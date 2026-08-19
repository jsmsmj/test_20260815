// --- rankingフェーズ ---
import { CanvasButtons } from '../canvasButtons.js';
import { RankingManager } from '../rankingManager.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../engine.js';
import { GlobalError } from '../globalError.js';
import { Images } from '../images.js';

export const RankingPhase = (() => {
  let goTo = null;

  const RANKING_IGNORE_DURATION = 1000; // ms, 表示直後にキー/タップ入力を無視する時間
  const RANKING_DISPLAY_COUNT = 10; // 画面に何件表示するか

  let enterTime = 0;
  let rankingList = []; // fetchRankingの結果({rank, name, score}の配列)。null=取得失敗、[]=0件
  let rankingLoading = false;
  let myRank = null; // 直近の送信/取得で分かった自分の順位(nullなら未送信/失敗)
  let rankChangeArrow = ''; // プレイ前後の順位変動('↑' | '↓' | '')
  let reachedFromGameOver = false; // 今の表示がプレイ後の遷移で来たものか(「戻る」ボタンの表示判定用)
  let isNewBest = false; // 今回のプレイが自己ベストを更新したか

  // サーバ応答が遅い/固まった場合でも待たされ続けないよう、読み込み中も含めて常にボタンは押せるようにする
  function buildButtons() {
    const buttons = [];
    if (reachedFromGameOver) {
      buttons.push({
        id: 'rankingBack',
        x: BASE_WIDTH / 2 - 90, y: BASE_HEIGHT - 100, w: 180, h: CanvasButtons.SECONDARY_HEIGHT,
        label: 'GAMEOVERに戻る',
        onClick() {
          goTo('gameover', { resume: true });
        },
      });
    }
    buttons.push({
      id: 'rankingToTitle',
      x: BASE_WIDTH / 2 - 90, y: BASE_HEIGHT - 58, w: 180, h: CanvasButtons.SECONDARY_HEIGHT,
      label: 'タイトルに戻る',
      onClick() {
        const now = performance.now();
        if (now - enterTime >= RANKING_IGNORE_DURATION) goTo('title');
      },
    });
    return buttons;
  }

  // payload: { myRank, isNewBest, rankChangeArrow, reachedFromGameOver }(gameover.js/title.jsから渡される)
  function enter(now, payload) {
    enterTime = now;
    myRank = (payload && payload.myRank) ?? null;
    isNewBest = !!(payload && payload.isNewBest);
    rankChangeArrow = (payload && payload.rankChangeArrow) || '';
    reachedFromGameOver = !!(payload && payload.reachedFromGameOver);
    rankingLoading = true;
    CanvasButtons.setButtons(buildButtons());

    RankingManager.fetchRanking(RANKING_DISPLAY_COUNT).then((result) => {
      if (result.ok) {
        rankingList = result.data;
      } else {
        // 失敗時のログはRankingManager内で出力済み。取得失敗と「本当に記録がない」を区別するため
        // 空配列ではなくnullにする(空配列は0件取得できた=記録なし、という意味で使う)
        rankingList = null;
        GlobalError.trigger('ランキングとの通信に失敗しました');
      }
      rankingLoading = false;
    });
  }

  function drawBackground(ctx) {
    const bgImage = Images.bg;
    if (!bgImage) return;
    const scale = BASE_WIDTH / bgImage.width;
    ctx.drawImage(bgImage, 0, 0, BASE_WIDTH, bgImage.height * scale);
  }

  function draw(ctx) {
    drawBackground(ctx);

    if (rankingLoading) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('サーバアクセス中…', BASE_WIDTH / 2, BASE_HEIGHT / 2);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('ランキング TOP10', BASE_WIDTH / 2, 62);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#bbbbbb';
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

    if (rankingList === null) {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#ff8080';
      ctx.fillText('ランキングを取得できませんでした', BASE_WIDTH / 2, BASE_HEIGHT / 2);
    } else if (rankingList.length === 0) {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('まだ記録がありません', BASE_WIDTH / 2, BASE_HEIGHT / 2);
    } else {
      rankingList.forEach((r, i) => {
        const y = startY + i * rowHeight;
        const isOwn = myRank !== null && r.rank === myRank;

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
        ctx.fillStyle = isOwn ? '#e6c200' : '#bbbbbb';
        ctx.textAlign = 'right';
        ctx.fillText(`${r.plays ?? '-'}回プレイ`, BASE_WIDTH - 30, y + 8);
      });

      if (myRank !== null && !rankingList.some((r) => r.rank === myRank)) {
        ctx.font = '14px sans-serif';
        ctx.fillStyle = '#cccccc';
        ctx.textAlign = 'center';
        ctx.fillText(`あなたの順位: ${myRank}位`, BASE_WIDTH / 2, startY + rankingList.length * rowHeight + 24);
      }
    }

    ctx.restore();
  }

  function init(goToFn) {
    goTo = goToFn;
  }

  return { init, enter, draw };
})();
