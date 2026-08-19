// --- 通信エラーの共通バナー表示(画面上部・全フェーズ共通) ---
// どのフェーズで通信に失敗しても、trigger(message)で表示をセットし、
// draw(ctx)で画面最上部に赤枠バナーとして表示する(3秒で自動非表示)。
// フェーズ専用のエラー表示は個別に作らず、必ずここを使う。
import { BASE_WIDTH } from './engine.js';

export const GlobalError = (() => {
  const DISPLAY_DURATION = 3000; // ms

  let message = '';
  let until = 0;

  function trigger(msg) {
    message = msg;
    until = performance.now() + DISPLAY_DURATION;
  }

  function draw(ctx) {
    const now = performance.now();
    if (now >= until) return;

    const height = 20;
    ctx.save();
    ctx.fillStyle = 'rgba(120, 0, 0, 0.85)';
    ctx.fillRect(0, 0, BASE_WIDTH, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, BASE_WIDTH / 2, height / 2);
    ctx.restore();
  }

  return { trigger, draw };
})();
