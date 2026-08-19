import { PlayerIdentity } from './playerIdentity.js';
import { DebugFlags } from './debugFlags.js';
import { StatManager } from './statManager.js';

// --- ランキングサーバとの通信(低レベル。RankingManagerの内部でのみ使う) ---
const serverApi = (() => {
  const BASE = 'https://game-api.ssdp-jun-20260816.workers.dev';
  const GAME_VERSION = '1.0';

  // デバッグパネルで「通信を強制エラーにする」が有効な間は、実際に通信せず即座に失敗させる
  function checkForcedError() {
    if (DebugFlags.forceNetworkError) throw new Error('debug: forced network error');
  }

  async function submitScore({ score, stages, playTime }) {
    checkForcedError();
    const res = await fetch(`${BASE}/api/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: PlayerIdentity.getDeviceId(),
        name: PlayerIdentity.getPlayerName() || 'NO NAME',
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
    checkForcedError();
    const res = await fetch(`${BASE}/api/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: PlayerIdentity.getDeviceId(), id, name: newName }),
    });
    if (!res.ok) throw new Error(`rename failed: ${res.status}`);
    return res.json();
  }

  async function fetchRanking(limit) {
    checkForcedError();
    const res = await fetch(`${BASE}/api/ranking?limit=${limit}`);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const data = await res.json();
    return data.ranking;
  }

  // 自分の現在の順位を問い合わせる。{ registered: false } または
  // { registered: true, rank, totalPlayers, best, plays, bestPlayId } を返す
  async function fetchMyRank() {
    checkForcedError();
    const res = await fetch(`${BASE}/api/me?deviceId=${PlayerIdentity.getDeviceId()}`);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return res.json();
  }

  return { submitScore, renameRecord, fetchRanking, fetchMyRank };
})();

// 「タイトル画面が直近のポーリングで取得した順位」。ページ内でのみ保持する(永続化しない)
let sessionStartRank = null;

// --- ランキング管理(高レベル。main.js側からはこちらだけを使う) ---
export const RankingManager = {
  // 以下4つは、成功/失敗を{ok, data}/{ok, error}という一貫した形で返す。
  // 失敗時のログもここで一元的に出すので、呼び出し側は.catch()を書く必要がない。
  async submitScore(args) {
    try {
      const data = await serverApi.submitScore(args);
      return { ok: true, data };
    } catch (err) {
      console.error('スコア送信に失敗しました', err);
      return { ok: false, error: err };
    }
  },
  async renameRecord(id, newName) {
    try {
      const data = await serverApi.renameRecord(id, newName);
      return { ok: true, data };
    } catch (err) {
      console.error('名前の変更に失敗しました', err);
      return { ok: false, error: err };
    }
  },
  async fetchMyRank() {
    try {
      const data = await serverApi.fetchMyRank();
      return { ok: true, data };
    } catch (err) {
      console.error('順位の取得に失敗しました', err);
      return { ok: false, error: err };
    }
  },
  async fetchRanking(limit) {
    try {
      const data = await serverApi.fetchRanking(limit);
      return { ok: true, data };
    } catch (err) {
      console.error('ランキング取得に失敗しました', err);
      return { ok: false, error: err };
    }
  },

  // 自己ベスト(ローカル)の取得・比較更新。サーバ通信かローカル保存かはゲーム側が意識する必要がないため、
  // StatManager(ローカル永続化担当)はここに隠蔽し、main.js側は本メソッド経由でのみ扱う
  getCurrentBests() {
    return StatManager.currentBests();
  },
  compareAndUpdateBests(stat) {
    return StatManager.compareAndUpdateBests(stat);
  },

  // 「直前のプレイ時点の順位」。ゲームをプレイして送信した時だけ更新する(タイトルの定期取得では更新しない)
  getLastKnownRank() {
    const v = localStorage.getItem('lastKnownRank');
    return v === null ? null : Number(v);
  },
  setLastKnownRank(rank) {
    if (rank === null || rank === undefined) return;
    localStorage.setItem('lastKnownRank', String(rank));
  },

  // 「タイトル画面が直近のポーリングで取得した順位」。GAMEOVER画面での順位変動矢印の
  // 比較基準に使う(lastKnownRankより新しい可能性があるライブな値。永続化はしない)
  getSessionStartRank() {
    return sessionStartRank;
  },
  setSessionStartRank(rank) {
    sessionStartRank = rank;
  },
};
