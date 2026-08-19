// --- gameoverフェーズ ---
// 離脱による記録消失を防ぐため、表示された時点で名前未入力でも(NO NAMEで)即送信する。
// あとから名前入力があった場合は、送信済みIDを使ってレコードの名前だけを書き換える(rename)。
// この自動送信・rename待ちの状態はnameEntry.jsからも参照される(submitStat/getLastSubmittedId)。
import { CanvasButtons } from '../canvasButtons.js';
import { RankingManager } from '../rankingManager.js';
import { PlayerIdentity } from '../playerIdentity.js';
import { Stat } from '../stat.js';
import { BASE_WIDTH, BASE_HEIGHT } from '../engine.js';
import { GlobalError } from '../globalError.js';
import { Images } from '../images.js';
import { DebugFlags } from '../debugFlags.js';

export const GameoverPhase = (() => {
  let goTo = null;

  const START_IGNORE_DURATION = 500; // 表示直後にボタンを無視する時間(ms)

  let enterTime = 0;
  let gameOverStats = { stage: 0, plates: 0, pieces: 0, miss: 0, maxCombo: 0, noMissPlates: 0, maxNoMissStreak: 0, playTime: 0 };
  let gameOverBestResults = {}; // Stat.defsの各keyごとの{hadRecord, previousBest, updated}
  let isNewBest = false; // 今回のプレイが自己ベストを更新したか

  let gameOverSubmitPromise = null; // 表示時点の自動送信のPromise(完了待ちに使う)
  let lastSubmittedId = null; // 自動送信で得られたレコードID(renameRecordに使う。失敗時はnull)
  let pendingRenameName = null; // 名前入力で確定された、送信後に反映すべき名前(null/空なら変更不要)
  let nameEntryHandledThisGameOver = false; // このGAMEOVERで名前入力/送信待ちの工程を既に済ませたか(「戻る」から再度進んだ時に使う)
  let myRank = null; // 直近の送信/取得で分かった自分の順位
  let rankChangeArrow = ''; // プレイ前後の順位変動('↑' | '↓' | '')

  // 表示時点で開始済みの自動送信の完了を待ち、必要なら名前変更(rename)を反映する。
  // 完了を表すPromiseを返すだけで、次にどの画面に進むかは呼び出し側が決める。
  function submitStat() {
    return gameOverSubmitPromise.then(() => {
      // 失敗してもログはRankingManager内で出力済み。送信済みの記録自体(NO NAME)は残っているのでエラー扱いにはしない
      if (lastSubmittedId && pendingRenameName) {
        const nameToApply = pendingRenameName;
        pendingRenameName = null;
        return RankingManager.renameRecord(lastSubmittedId, nameToApply);
      }
    });
  }

  function goToRanking() {
    submitStat().then(() => {
      goTo('ranking', { myRank, isNewBest, rankChangeArrow, reachedFromGameOver: true });
    });
  }

  // nameEntry.jsの「名前を入力してGAMEOVER直後の送信に反映し、ランキングへ進む」経路から呼ばれる
  function confirmRenameAndGoToRanking(name) {
    pendingRenameName = name || null; // 空欄のままならrename不要('NO NAME'のまま)
    goToRanking();
  }

  // GAMEOVER画面から次へ進む処理(タップ/キー入力どちらからも呼ばれる共通ロジック)
  function proceedFromGameOver(now) {
    if (nameEntryHandledThisGameOver) {
      // 「戻る」で見返しているだけなので、名前入力は行わずランキングへ(送信自体は表示時点で済んでいる)
      goToRanking();
    } else if (PlayerIdentity.getPlayerName()) {
      // 名前は登録済みなので入力を省略。送信(表示時点で自動送信済み)の完了を待つだけ
      nameEntryHandledThisGameOver = true;
      goToRanking();
    } else {
      // 初回のみ名前を聞く
      nameEntryHandledThisGameOver = true;
      goTo('nameEntry', { returnTo: 'submit' });
    }
  }

  function buildButtons() {
    return [
      {
        id: 'gameoverToRanking',
        x: BASE_WIDTH / 2 - 110, y: BASE_HEIGHT / 2 + 140, w: 220, h: CanvasButtons.PRIMARY_HEIGHT,
        label: 'ランキングを表示する',
        primary: true,
        onClick() {
          const now = performance.now();
          if (now - enterTime >= START_IGNORE_DURATION) proceedFromGameOver(now);
        },
      },
      {
        id: 'gameoverRename',
        x: BASE_WIDTH / 2 - 90, y: BASE_HEIGHT / 2 + 192, w: 180, h: CanvasButtons.SECONDARY_HEIGHT,
        label: '名前を変える',
        onClick() {
          goTo('nameEntry', { returnTo: 'gameoverRename' });
        },
      },
    ];
  }

  // payload: 通常はgameplayフェーズからの通算スタッツ。{resume: true}ならrankingの「戻る」からの
  // 再表示で、送信済みのgameOverStatsは維持したままタップ受付だけ再開する(再送信しない)。
  function enter(now, payload) {
    enterTime = now;
    CanvasButtons.setButtons(buildButtons());
    if (payload && payload.resume) return;

    gameOverStats = payload;

    // 自己ベストはローカルだけで完結する判定なので、通信結果を待たずに確定させる
    gameOverBestResults = RankingManager.compareAndUpdateBests(new Stat(gameOverStats));
    isNewBest = gameOverBestResults.pieces.updated;

    lastSubmittedId = null;
    pendingRenameName = null;
    nameEntryHandledThisGameOver = false;
    myRank = null;
    rankChangeArrow = '';

    // 名前入力を待たず、この時点で(未入力なら'NO NAME'で)即送信する。
    // こうしないと、名前を入れる前に離脱された場合に記録が一切残らないため。
    gameOverSubmitPromise = RankingManager.submitScore({
      score: gameOverStats.pieces,
      stages: gameOverStats.stage,
      playTime: Math.round(gameOverStats.playTime),
    }).then((submitResult) => {
      if (!submitResult.ok) {
        GlobalError.trigger('ランキングとの通信に失敗しました');
        return;
      }
      lastSubmittedId = submitResult.data.id;
      // /api/scoreのrankは「今回送信したスコアそのもの」の順位であり、
      // 自己ベストを更新できなかった場合は実際の順位と食い違う。
      // タイトル画面の「現在○位」と同じ、自己ベストに基づく順位(/api/me)を正として使う。
      return RankingManager.fetchMyRank().then((rankResult) => {
        if (!rankResult.ok) {
          GlobalError.trigger('ランキングとの通信に失敗しました');
          return;
        }
        const data = rankResult.data;
        if (!data.registered) return; // 送信直後なので通常ここには来ないはずだが念のため
        myRank = data.rank;

        const sessionStartRank = RankingManager.getSessionStartRank();
        if (sessionStartRank !== null && myRank !== sessionStartRank) {
          rankChangeArrow = myRank < sessionStartRank ? '↑' : '↓';
        }
        RankingManager.setLastKnownRank(myRank); // 次にタイトルに戻った時の比較基準を更新
      });
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

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    ctx.fillStyle = '#ff4d4d';
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('GAME OVER', BASE_WIDTH / 2, BASE_HEIGHT / 2 - 130);

    const rowStartY = BASE_HEIGHT / 2 - 95;
    const rowStep = 34;
    Stat.defs.forEach((def, i) => {
      const y = rowStartY + i * rowStep;
      const value = gameOverStats[def.key];
      // 画面レイアウト確認用: 強制フラグが立っている間は、実際の記録に関わらず「自己ベスト更新」表示にする
      const result = DebugFlags.forceBestUpdate
        ? { hadRecord: true, updated: true, previousBest: def.lower ? value + 1 : Math.max(0, value - 1) }
        : gameOverBestResults[def.key];

      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${def.label}: ${value}${def.unit}`, BASE_WIDTH / 2, y);

      if (result && result.hadRecord) {
        ctx.font = 'bold 11px sans-serif';
        if (result.updated) {
          const diff = Math.abs(value - result.previousBest);
          const sign = def.lower ? '-' : '+';
          ctx.fillStyle = '#ffd700';
          ctx.fillText(
            `(自己ベスト ${result.previousBest}${def.unit} → 自己ベスト更新 ${sign}${diff})`,
            BASE_WIDTH / 2,
            y + 16
          );
        } else {
          ctx.fillStyle = '#dddddd';
          ctx.fillText(`(自己ベスト ${result.previousBest}${def.unit})`, BASE_WIDTH / 2, y + 16);
        }
      }
    });

    ctx.restore();
  }

  function init(goToFn) {
    goTo = goToFn;
  }

  return {
    init,
    enter,
    draw,
    confirmRenameAndGoToRanking,
    getLastSubmittedId: () => lastSubmittedId,
  };
})();
