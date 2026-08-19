// --- サウンド(Howler.js) ---
// 全SEの定義(ファイルと音量)をここに集約する。鳴らす箇所は名前だけを使って呼び出す。
// ネタ種別とSE名の対応(どのネタでどの音を鳴らすか)はゲーム固有の知識なので、
// ここではなく呼び出し側(gameplay側)が持つ。
export const Sounds = (() => {
  const SOUNDS = {
    correctToro: { src: 'SE/SE05.mp3', volume: 1.0 },
    correctTamago: { src: 'SE/SE06.mp3', volume: 1.0 },
    correctEbi: { src: 'SE/SE01.mp3', volume: 1.0 },
    plateComplete: { src: 'SE/SE03.mp3', volume: 1.0 },
    miss: { src: 'SE/SE04.mp3', volume: 1.0 },
    plateNoMissA: { src: 'SE/SE08.mp3', volume: 1.0 },
    plateNoMissB: { src: 'SE/SE09.mp3', volume: 1.0 },
    countdownTick: { src: 'SE/SE10.mp3', volume: 1.0 }, // カウントダウン「3」「2」「1」
    countdownGo: { src: 'SE/SE11.mp3', volume: 1.0 }, // カウントダウン「GO」
    bgm: { src: 'SE/iwashiro_kokage_biyori.mp3', volume: 0.4, loop: true },
  };

  const soundInstances = {};
  for (const [name, def] of Object.entries(SOUNDS)) {
    soundInstances[name] = new Howl({ src: [def.src], volume: def.volume, loop: !!def.loop });
  }

  function play(name) {
    const sound = soundInstances[name];
    if (sound) sound.play();
  }

  // 複数候補からランダムに1つ再生する(例: ノーミス盛り台のSEはA/Bどちらか)
  function playRandom(names) {
    play(names[Math.floor(Math.random() * names.length)]);
  }

  let bgmStarted = false;
  function startBgmOnce() {
    if (bgmStarted) return;
    bgmStarted = true;
    soundInstances.bgm.play();
  }
  function pauseBgm() {
    if (bgmStarted) soundInstances.bgm.pause();
  }
  function resumeBgm() {
    if (bgmStarted) soundInstances.bgm.play();
  }

  return { play, playRandom, startBgmOnce, pauseBgm, resumeBgm };
})();
