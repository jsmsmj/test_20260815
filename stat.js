// --- スタッツ(自己ベスト対象の7項目)の値を表す構造体 ---
// 値の入れ物と、項目定義(defs)だけを持つ純粋なデータクラス。
// localStorageの読み書きや比較・更新は StatManager(statManager.js)側の仕事。
export class Stat {
  // GAMEOVER画面のスタッツ表示順・各項目の自己ベストの定義。
  // lower: trueの項目(MISS回数)だけ「少ないほど良い」記録として扱う。
  static defs = [
    { key: 'stage', storageKey: 'bestStage', label: '到達ステージ', unit: '', lower: false },
    { key: 'pieces', storageKey: 'bestScore', label: '握った貫数', unit: '貫', lower: false },
    { key: 'maxCombo', storageKey: 'bestMaxCombo', label: '最大コンボ', unit: '貫', lower: false },
    { key: 'plates', storageKey: 'bestPlates', label: '完成した盛り台', unit: '台', lower: false },
    { key: 'noMissPlates', storageKey: 'bestNoMissPlates', label: 'ノーミス盛り台', unit: '台', lower: false },
    { key: 'maxNoMissStreak', storageKey: 'bestNoMissStreak', label: '連続ノーミス盛り台', unit: '台', lower: false },
    { key: 'miss', storageKey: 'bestMiss', label: 'MISS回数', unit: '回', lower: true },
  ];

  // values: { stage, pieces, maxCombo, plates, noMissPlates, maxNoMissStreak, miss }
  // (Stat.defsにない余分なキー(例: gameOverStatsのplayTime)が含まれていても無視される)
  // recordedAt: この値が記録された日時。集計・スナップショット的なStat(自己ベストの現在値まとめ等、
  //             項目ごとに別々の時点で記録されている)では意味を持たないため、その場合はnullのままでよい
  constructor(values, recordedAt = null) {
    this.values = values;
    this.recordedAt = recordedAt;
  }
}
