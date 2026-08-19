// --- デバッグ用フラグ ---
// index_debug.htmlのデバッグパネルからのみ操作される想定。本番のindex.htmlはこれを一切読み込まない。
export const DebugFlags = {
  forceNetworkError: false,
  forceBestUpdate: false, // 自己ベスト更新中の表示を強制するか(画面レイアウト確認用)

  // 「ゲームオーバー画面へ」「ステージクリア画面へ」ボタン用のフック。
  // main.js側が実際の画面遷移処理を代入し、index_debug.html側はボタンクリックで呼び出すだけにする。
  forceGameOver: null,
  forceCleared: null,
};
