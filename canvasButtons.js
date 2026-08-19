// --- canvasボタン(角丸矩形)モジュール ---
// 描画・当たり判定・押下/ホバー状態をこの中に閉じ込める。外部(各フェーズ)からは
// CanvasButtons.setButtons/draw/drawButtons/bind/PRIMARY_HEIGHT/SECONDARY_HEIGHTだけを使う。
// ネイティブのbutton要素と同じ「押して、同じボタンの上で離したら発火」を
// pointerdown/pointerupの組で判定する(押した後ずらして離せばキャンセルできる)。
//
// 「今どのボタンが有効か」はsetButtons(buttons)で外部(main.jsのgoTo)から書き込む。
// 各フェーズは自分がアクティブになったタイミング(enter())で自分のボタンを書き込むだけでよく、
// フェーズ切り替えのたびにmain.js側が必ずsetButtons(null)で一度クリアしてから次のenter()を呼ぶため、
// ボタンを持たないフェーズ(gameplay/nameEntry)が明示的に「ボタンなし」を書き込む必要はない。
export const CanvasButtons = (() => {
  const CORNER_RADIUS = 6;
  const PRIMARY_HEIGHT = 40; // 主役ボタン(GAME START等)の高さ
  const SECONDARY_HEIGHT = 34; // それ以外のボタンの高さ

  let pressed = null; // 現在押し下げ中のボタン(離した時に同じボタンの上かの判定に使う)
  let pointerPos = null; // 直近のポインタ位置(canvas座標系、ホバー・範囲外ドラッグ判定に使う)
  let currentButtons = null; // 今アクティブなフェーズのボタン配列。nullなら「ボタンなしフェーズ」

  function setButtons(buttons) {
    currentButtons = buttons;
  }

  function isPointInRect(pos, x, y, w, h) {
    return pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h;
  }

  function findHit(buttons, pos) {
    for (const btn of buttons) {
      if (isPointInRect(pos, btn.x, btn.y, btn.w, btn.h)) return btn;
    }
    return null;
  }

  // 'default' | 'hover'(範囲内にポインタがあるだけ) | 'pressed'(押下中・範囲内)
  // | 'draggedOut'(押下中だが範囲外にドラッグされた=今離しても発火しない)
  function getVisualState(btn) {
    if (!pointerPos) return 'default';
    const isOver = isPointInRect(pointerPos, btn.x, btn.y, btn.w, btn.h);
    if (pressed?.id === btn.id) return isOver ? 'pressed' : 'draggedOut';
    if (!pressed && isOver) return 'hover';
    return 'default';
  }

  // primary: trueなら塗りつぶしの主役ボタン(GAME START等)、falseなら枠線だけの副次ボタン
  function draw(ctx, btn, primary = false) {
    const { x, y, w, h, label } = btn;
    const state = getVisualState(btn);
    const r = CORNER_RADIUS;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();

    if (primary) {
      ctx.fillStyle = state === 'pressed' ? '#25a25a' : state === 'hover' ? '#3ddb84' : '#2ecc71';
      ctx.fill();
    } else if (state === 'pressed') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // 押下中(範囲内)は少し明るくして反応を示す
      ctx.fill();
    } else if (state === 'hover') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; // ホバーは押下より弱め
      ctx.fill();
    }
    // 'draggedOut'(今離しても発火しない)、非primaryのdefaultは塗りなし=見た目上は通常状態に戻す

    if (!primary) {
      ctx.strokeStyle = '#999999';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = primary ? '#ffffff' : '#cccccc';
    ctx.font = primary ? 'bold 18px sans-serif' : '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    ctx.restore();
  }

  // 今アクティブなボタンを全て描画する。ボタンなしフェーズでは何もしない。
  function drawButtons(ctx) {
    if (!currentButtons) return;
    for (const btn of currentButtons) {
      draw(ctx, btn, btn.primary);
    }
  }

  // canvasのpointerイベントを配線する。
  // getPos(clientX, clientY): クライアント座標をcanvas座標系に変換する
  // fallback(e): ボタンなしフェーズでのpointerdown処理
  function bind(canvas, { getPos, fallback }) {
    canvas.addEventListener('pointerdown', (e) => {
      if (currentButtons) {
        pointerPos = getPos(e.clientX, e.clientY);
        pressed = findHit(currentButtons, pointerPos);
        return;
      }
      fallback(e);
    });

    canvas.addEventListener('pointermove', (e) => {
      pointerPos = currentButtons ? getPos(e.clientX, e.clientY) : null;
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!pressed) return;
      const releasedOn = currentButtons ? findHit(currentButtons, getPos(e.clientX, e.clientY)) : null;
      if (releasedOn && releasedOn.id === pressed.id) {
        releasedOn.onClick();
      }
      pressed = null;
    });

    canvas.addEventListener('pointercancel', () => { pressed = null; });
    canvas.addEventListener('pointerleave', () => { pressed = null; pointerPos = null; });
  }

  return { PRIMARY_HEIGHT, SECONDARY_HEIGHT, setButtons, draw, drawButtons, bind };
})();
