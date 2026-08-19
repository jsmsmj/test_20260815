// --- ランキングの1レコード(ある時点で問い合わせた、あるプレイヤーの順位情報)を表す構造体 ---
// Stat(プレイの記録そのもの)と、ランキングサーバとのやり取りに関する情報(順位・名前・
// プレイ回数・問い合わせ日時)を分けて持つ。「いつプレイしたか」はstat.recordedAt側、
// 「いつ順位を問い合わせたか」はこちらのrankFetchedAt側、と役割を分離している。
// 将来的にリプレイ用の情報などが増える可能性がある。
export class RankRecord {
  // stat: Statインスタンス(stat.recordedAtに「いつプレイしたか」が入る)
  // playerName: 表示名
  // playCount: そのプレイヤーの通算プレイ回数
  // rank: サーバから返ってきた時点での順位
  // rankFetchedAt: rankを問い合わせた日時
  constructor({ stat, playerName, playCount, rank, rankFetchedAt }) {
    this.stat = stat;
    this.playerName = playerName;
    this.playCount = playCount;
    this.rank = rank;
    this.rankFetchedAt = rankFetchedAt;
  }
}
