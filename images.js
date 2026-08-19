// --- 画像アセットの読み込み・保持 ---
// ゲーム内容を一切知らない、汎用的な「画像を読み込んで保持する」だけの仕組み。
// 読み込みはfire-and-forgetで開始するだけで、完了を待つゲートは持たない。
// 未読み込みの間は各getterがnull(またはキー未セット)を返すので、呼び出し側の
// 描画関数が「まだ読み込まれていなければ何もしない」形で自然に無視すればよい。
export const Images = (() => {
  const NETA_SRC = {
    toro: 'imgs/toro.png',
    tamago: 'imgs/tamago.png',
    ebi: 'imgs/ebi.png',
  };
  const BG_SRC = 'imgs/ddc24c3d-e386-4c9d-bd7a-acf1f2776841_.png';
  const MORIDAI_SRC = 'imgs/moridai.png';

  // 正解エフェクト用のパラパラアニメ(5コマ)
  const CORRECT_EFFECT_SRC = [
    'imgs/ef01.png',
    'imgs/ef02.png',
    'imgs/ef03.png',
    'imgs/ef04.png',
    'imgs/ef05.png',
  ];

  let bg = null;
  let moridai = null;
  const neta = {};
  const correctEffect = [];

  function load(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function preloadAll() {
    return Promise.all([
      load(BG_SRC).then((img) => { bg = img; }),
      load(MORIDAI_SRC).then((img) => { moridai = img; }),
      ...Object.entries(NETA_SRC).map(([type, src]) => load(src).then((img) => { neta[type] = img; })),
      ...CORRECT_EFFECT_SRC.map((src, i) => load(src).then((img) => { correctEffect[i] = img; })),
    ]).catch((err) => console.error('画像の読み込みに失敗しました', err));
  }

  return {
    preloadAll,
    get bg() { return bg; },
    get moridai() { return moridai; },
    get neta() { return neta; },
    get correctEffect() { return correctEffect; },
  };
})();
