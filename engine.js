// --- ゲームエンジン部分(canvas座標変換・リサイズ・RAFループ駆動) ---
// ゲーム内容を一切知らない、汎用的な「画面に描く土台」だけを担当する。
// フェーズ固有の要件(例: 名前入力欄のレイアウト追従)はonResizeフックで、
// BGMの一時停止/再開はonHide/onShowフックで、外側から差し込む形にして
// このモジュール自身はゲームの構成要素(フェーズ・サウンド等)を一切importしない。

// スマホ縦持ちを基準とした基準解像度。各フェーズの描画レイアウトもこの座標系を基準にする。
export const BASE_WIDTH = 360;
export const BASE_HEIGHT = 600;

export const Engine = (() => {
  const resizeHooks = [];
  const hideHooks = [];
  const showHooks = [];

  let canvas = null;
  let ctx = null;
  let baseWidth = 0;
  let baseHeight = 0;
  let maxDpr = 2;

  let animationFrameId = null;
  let lastFrameTime = null; // 前回フレームの時刻(dt計算用)
  let frameCallback = null; // start()で登録された、毎フレーム呼ぶ関数

  function init({ canvas: canvasEl, baseWidth: bw, baseHeight: bh, maxDpr: mdpr }) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    baseWidth = bw;
    baseHeight = bh;
    maxDpr = mdpr;

    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    // iOS Safari 等はアドレスバーの表示/非表示だけでは resize が発火しないことがあるため
    // visualViewport の変化も監視する
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize);
      window.visualViewport.addEventListener('scroll', resize);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    resize();
    return ctx;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    // canvasが欠けることは許容しないため、必ず全体が収まる側(小さい方)に合わせて拡大する(contain方式)。
    const scale = Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight);

    canvas.style.width = `${baseWidth * scale}px`;
    canvas.style.height = `${baseHeight * scale}px`;
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;

    // 以降の描画は常に baseWidth x baseHeight の座標系で行える
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const hook of resizeHooks) hook();
  }

  // リサイズのたびに追加で実行したい処理を登録する(例: 名前入力欄の位置合わせ)
  function onResize(hook) {
    resizeHooks.push(hook);
  }

  function getBasePos(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * baseWidth,
      y: ((clientY - rect.top) / rect.height) * baseHeight,
    };
  }

  // タブが非アクティブ(バックグラウンド)になった時/復帰した時に追加で実行したい処理を登録する
  function onHide(hook) {
    hideHooks.push(hook);
  }
  function onShow(hook) {
    showHooks.push(hook);
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      for (const hook of hideHooks) hook();
    } else {
      if (animationFrameId === null && frameCallback) {
        // 非表示だった間の経過時間をdt計算に含めない(タイマーが一気に減るのを防ぐ)
        lastFrameTime = null;
        animationFrameId = requestAnimationFrame(loop);
      }
      for (const hook of showHooks) hook();
    }
  }

  function loop(now) {
    const dt = lastFrameTime === null ? 0 : (now - lastFrameTime) / 1000; // 秒
    lastFrameTime = now;
    frameCallback(now, dt);
    animationFrameId = requestAnimationFrame(loop);
  }

  // callback(now, dt): 毎フレーム呼ばれる。dtは前フレームからの経過秒数(秒単位)
  function start(callback) {
    frameCallback = callback;
    animationFrameId = requestAnimationFrame(loop);
  }

  return {
    init,
    onResize,
    getBasePos,
    onHide,
    onShow,
    start,
    get ctx() {
      return ctx;
    },
    get canvas() {
      return canvas;
    },
  };
})();
