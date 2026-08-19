// --- プレイヤー身元(端末ID・表示名)モジュール ---
// ゲームのルールやランキングを一切知らない、汎用的な「この端末/プレイヤーを継続的に識別する」だけの仕組み。
// 外部からはPlayerIdentity.xxxの形でだけ使う。
export const PlayerIdentity = (() => {
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

  return { getDeviceId, getPlayerName, setPlayerName };
})();
