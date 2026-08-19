// --- スタッツ(自己ベスト)の永続化・比較を行うマネージャ ---
// ゲーム内に1つしかないシングルトンなのでクロージャ。Stat(構造体)を読み書きする。
import { Stat } from './stat.js';

export const StatManager = (() => {
  // 記録の有無はキーの存在で判定する(値0を「記録なし」の意味には使わない)
  function getBestStat(storageKey) {
    const v = localStorage.getItem(storageKey);
    return v === null ? null : Number(v);
  }

  // 記録がなければそのまま保存(updatedはfalse)。記録があって上回っていれば保存してupdated:trueを返す
  function updateBestStat(storageKey, value, lower) {
    const previousBest = getBestStat(storageKey);
    const hadRecord = previousBest !== null;
    let updated = false;
    if (!hadRecord) {
      localStorage.setItem(storageKey, String(value));
    } else if (lower ? value < previousBest : value > previousBest) {
      localStorage.setItem(storageKey, String(value));
      updated = true;
    }
    return { hadRecord, previousBest, updated };
  }

  // 保存されている自己ベストを7項目ぶん読み出し、Statとして返す(記録がない項目はnull)
  function currentBests() {
    const values = {};
    for (const def of Stat.defs) {
      values[def.key] = getBestStat(def.storageKey);
    }
    return new Stat(values);
  }

  // 指定のStatの各項目を保存済みの自己ベストと比較し、更新があれば保存する。
  // 項目ごとの{hadRecord, previousBest, updated}を返す
  function compareAndUpdateBests(stat) {
    const results = {};
    for (const def of Stat.defs) {
      results[def.key] = updateBestStat(def.storageKey, stat.values[def.key], def.lower);
    }
    return results;
  }

  return { currentBests, compareAndUpdateBests };
})();
