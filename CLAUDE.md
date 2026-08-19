# sample-game (test_20260815)

スマホ縦持ち専用(横持ち非対応)、PCブラウザでも開けるWebゲーム。「鮨職人になろう!」というタイトルの、お手本通りに鮨を握るタイピング/リズムゲーム。

## ファイル構成

- `index.html` / `style.css` — canvasの器のみ。ロジックは全て`main.js`(ESモジュールとして読み込み)
- `index_debug.html` — デバッグ用。`index.html`と同内容+右上に「通信を強制エラーにする」チェックボックス(`debugFlags.js`の`DebugFlags.forceNetworkError`を切り替える)。本番の`index.html`はこれを一切読み込まない
- `main.js` — フェーズを横断する合成ルートのみ。DOM取得・`Engine`初期化・アセットのpreload起動・フェーズレジストリと`goTo(name, payload)`・入力(タップ/キー)の振り分け・共通描画(タイマー表示・各フェーズのcanvasボタン描画・エラーバナー)を持つ。ゲーム内容そのものは持たない。**ファイル全体を即時関数(IIFE)で囲んでおり、トップレベルの変数・関数はグローバル(window)に漏れない**(冒頭のimport文のみIIFEの外)
- `engine.js` — canvas座標変換・リサイズ(contain方式スケーリング)・RAFループ駆動を担うクロージャ(`Engine`)。ゲーム内容を一切知らない。フェーズ固有の要件(名前入力欄のレイアウト追従等)は`onResize`フックで、BGMの一時停止/再開は`onHide`/`onShow`フックで外側から差し込む。`BASE_WIDTH`/`BASE_HEIGHT`もここから名前付きexportする
- `sounds.js` — 全SEの定義(ファイルパス・音量・ループ有無)とHowlインスタンスを集約するクロージャ(`Sounds`)。`Sounds.play('名前')`(単一)/`Sounds.playRandom(['名前', ...])`(複数候補からランダム)で再生する。ネタ種別とSE名の対応(ゲーム固有の知識)はここには置かず、呼び出し側(`phases/gameplay.js`)が持つ
- `images.js` — 画像アセットの読み込み・保持を行うクロージャ(`Images`)。`preloadAll()`でfire-and-forgetに並行読み込みを開始し、各getter(`bg`/`moridai`/`neta`/`correctEffect`)は未読み込みの間`null`(またはキー未セット)を返す
- `globalError.js` — 通信エラーの共通バナー表示を持つクロージャ(`GlobalError`)。どのフェーズで通信に失敗しても`GlobalError.trigger(message)` → `GlobalError.draw(ctx)`(画面最上部・赤枠・3秒で自動非表示)で共通表示する。フェーズ専用のエラー表示は個別に作らない
- `phases/` — フェーズごとのモジュール。フェーズ同士は直接importし合わず、`main.js`から渡された`goTo(name, payload)`でのみ遷移する
  - `phases/title.js` — `title`フェーズ。タイトルの「現在○位」表示(60秒おきのポーリング)を持つ
  - `phases/gameplay.js` — `countdown`/`playing`/`cleared`の3つを内部サブフェーズとして持つ1つのフェーズ。この3つはタイマー・盛り台内容・通算スタッツが連続して引き継がれる1セッションであり完全に独立させられないため、まとめて1モジュールにしている。タイムアウト(またはMISSペナルティでの0秒到達)でのみ`goTo('gameover', stats)`で抜ける
  - `phases/gameover.js` — `gameover`フェーズ。表示時点での自動送信(NO NAMEでも即送信)・自己ベスト比較・順位変動の算出を持つ。この自動送信状態(送信済みID等)は`nameEntry.js`からも参照される
  - `phases/nameEntry.js` — `nameEntry`フェーズ。実際の入力欄・OKボタンはHTML要素(`<input>`。IME操作が必要なため)をcanvasの上に重ねて表示している。唯一、`gameover.js`を一方向にimportする(送信済みIDの参照・rename後の遷移のため)
  - `phases/ranking.js` — `ranking`フェーズ。ランキング一覧の取得・自己ベスト更新/順位変動の表示・「GAMEOVERに戻る」ボタンの出し分けを持つ
- `canvasButtons.js` — canvasボタン(角丸矩形)の描画・当たり判定・押下/ホバー状態を集約するクロージャ。ネイティブ`<button>`相当の「押して、同じボタンの上で離したら発火」をpointerdown/pointerupで再現する(押した後ずらして離せばキャンセルできる)
- `rankingManager.js` — ランキングサーバとの通信、および自己ベスト管理の唯一の窓口(他のモジュールはここの公開メソッドしか呼ばない)。低レベルの通信処理(`serverApi`)と`statManager.js`を内部に隠蔽している
- `statManager.js` — 自己ベスト(ローカル)の永続化・比較を行うクロージャ。`rankingManager.js`の内部実装としてのみ使われ、他のモジュールから直接importしない
- `stat.js` — スタッツ(到達ステージ・貫数・最大コンボ等7項目)を表す値構造体クラス。項目一覧は`Stat.defs`
- `rankRecord.js` — ランキング1レコード(Stat+順位+プレイヤー名等)を表す値構造体クラス。現状ライブの画面表示では未使用(将来、順位一覧をこの構造で持つ想定で温存)
- `playerIdentity.js` — 端末ID・プレイヤー名のlocalStorage管理を行うクロージャ
- `debugFlags.js` — デバッグ用フラグ(`forceNetworkError`)を持つだけのモジュール。`index_debug.html`からのみ操作される想定
- `server.js` — 依存パッケージなしのNode.js製簡易静的Webサーバ
- `imgs/` — 背景・ネタ・盛り台・正解エフェクトの画像
- `imgs_ignore/` — 参考資料・透かし入り素材など、gitで追跡しないもの(`.gitignore`で除外)
- `SE/` — 効果音・BGM(mp3)

## モジュール設計の方針

- **クロージャ vs クラス**: ゲーム内に1つしか存在しないシングルトン的な概念はクロージャ(IIFEで`{公開API}`を返す形。`CanvasButtons`/`RankingManager`/`PlayerIdentity`/`StatManager`/`Engine`/`Sounds`/`Images`/`GlobalError`/各フェーズモジュール)で実装する。複数インスタンスが必要な値・構造体的な概念はESクラス(`Stat`/`RankRecord`)で実装する
- **フェーズモジュールの構造**: `phases/*.js`は「入力を受け取り→自分の描画をし→システム(main.js)が共通描画(canvasボタン・エラーバナー)をする」構造。各モジュールは慣習として`init(goTo)`(起動時に1回、遷移関数を受け取る)/`enter(now, payload)`/`exit()`(任意)/`handleInput(pos)`・`handleKey(key)`(canvasボタンを持たないフェーズのみ)/`update(now, dt)`(任意)/`draw(ctx)`を持つ(全てのフェーズが全メソッドを持つ必要はない。main.js側は`phase.xxx?.()`のように任意呼び出しする)
- **フェーズ間の遷移(`goTo`)**: フェーズ同士は直接importし合わない。画面遷移は`goTo(phaseName, payload)`(main.js側が実装し、起動時に各フェーズの`init`へ配る)を介して行い、引き継ぐ必要がある値は`payload`で渡す。例外は`nameEntry.js`が`gameover.js`を一方向にimportしている点(送信済みIDの参照・rename後の遷移に必要なため。複数フェーズをまたいで参照される値は所有元のモジュールが公開する、という以下の「状態の境界」の原則に沿った例外)
- **RankingManagerのエラー処理**: 公開メソッド(`submitScore`/`renameRecord`/`fetchMyRank`/`fetchRanking`)はthrow/rejectしない。内部でtry/catchし、失敗時のログもRankingManager内で一元的に出力した上で`{ok: true, data}` / `{ok: false, error}`を返す。呼び出し側は`.catch()`を書かず`result.ok`で分岐する
- **通信エラーの共通バナー**: どのフェーズで通信に失敗しても、`GlobalError.trigger(message)` → `GlobalError.draw(ctx)`(画面最上部・赤枠・3秒で自動非表示、main.js側の共通描画から毎フレーム呼ばれる)で共通表示する。フェーズ専用のエラー表示は個別に作らない
- **画面専用のローカル状態 vs マネージャが持つ状態の境界**: 「この画面の表示にしか使わない値」(例: `title.js`の`titleRankText`、`ranking.js`の`rankingList`/`rankingLoading`)は各フェーズモジュール側のローカル変数として持つ。「ドメインデータとして永続化・複数フェーズをまたいで参照される値」(例: `lastKnownRank`、自己ベスト、タイトルの直近ポーリングで得た`sessionStartRank`)はマネージャ(`RankingManager`)側に持たせる
- **null と 空配列/0 の区別**: 「まだ記録がない/取得に失敗した」は`null`、「取得できたが0件」は空配列(または値0)、と明確に区別する規約を全体で使う(例: 自己ベストの各項目、`RankingManager.getLastKnownRank()`、`rankingList`)
- **canvasボタン**: `CanvasButtons`(`canvasButtons.js`)は「今アクティブなボタン配列」を内部に1つだけ持つ。canvasボタンで操作するフェーズ(`title`/`gameover`/`ranking`)は自分の`enter()`で`CanvasButtons.setButtons(配列)`を呼んで登録するだけで、押下判定・視覚的な描画(`CanvasButtons.drawButtons(ctx)`、main.js側の共通描画から毎フレーム呼ばれる)は`CanvasButtons`に一任する。フェーズを切り替えるたびに`main.js`の`goTo()`が必ず`CanvasButtons.setButtons(null)`で一度クリアしてから次の`enter()`を呼ぶため、ボタンを持たないフェーズ(`gameplay`/`nameEntry`)が明示的に「ボタンなし」を書き込む必要はない。HTML要素のボタンは名前入力(`<input>`。IME操作が必要なため、`nameEntry.js`)以外は使わない
- **フェーズ(`title` / `gameplay` / `gameover` / `nameEntry` / `ranking`)**: `countdown`/`playing`/`cleared`はタイマー・盛り台内容・通算スタッツが連続して引き継がれる1セッションのため、独立フェーズではなく`gameplay`フェーズの内部サブフェーズとして扱う。「サーバ通信中」を表す専用フェーズは持たない。通信を伴う画面遷移でも遷移先のフェーズへ直接入り、そのフェーズ自身がローディング用フラグ(例: `ranking`フェーズの`rankingLoading`)で読み込み中かどうかを表現する。「〇〇する」という名前のサブルーチン(例: `gameover.js`の内部関数`submitStat`)自体はフェーズを切り替えず、Promiseを返すだけにして、次にどの画面へ進むかは呼び出し側が決める
- **デバッグモード**: `index_debug.html`を開くと画面右上にデバッグパネルが出る(`debugFlags.js`の`DebugFlags`をESモジュールの同一importキャッシュ経由で共有する、という仕組みは共通)
  - 「通信を強制エラーにする」: `DebugFlags.forceNetworkError`を`rankingManager.js`内の`serverApi`が参照し、trueの間は実際に通信せず即座に失敗させる
  - 「自己ベスト更新中を強制する」: `DebugFlags.forceBestUpdate`を`phases/gameplay.js`(プレイ中・クリア画面の表示)と`phases/gameover.js`(ゲームオーバー画面の各項目)が参照し、trueの間は実際の記録に関わらず「自己ベスト更新中」表示を強制する(画面レイアウト確認用)
  - 「ゲームオーバー画面へ」/「ステージクリア画面へ」: `DebugFlags.forceGameOver`/`forceCleared`に、実際の遷移処理(main.js側で登録)を関数として持たせておき、ボタン押下時にそれを呼ぶだけにする。実プレイなしでダミーの記録を使い該当フェーズへ直接遷移できる(画面レイアウト確認用)

## 起動方法

```
npm start
```

`http://localhost:8080/` で確認。静的ファイルを都度読み直すので、HTML/CSS/JSを編集してもサーバー再起動は不要(ブラウザのリロードのみでよい)。

## 画面設計の方針(確定事項)

- 基準解像度は `engine.js` の `BASE_WIDTH`(360) / `BASE_HEIGHT`(600)。
- 拡縮は **contain方式**(`scale = Math.min(innerWidth/BASE_WIDTH, innerHeight/BASE_HEIGHT)`)。**canvasが見切れる(クロップされる)ことは禁止**。縦横比を保ったまま常に全体が画面内に収まるように縮小する。ストレッチはしない。
- 余り(レターボックス)は許容する。`#game-container` は横`center`・縦`center`。

## ゲーム仕様

### 画面構成(上から)

- 背景画像(上寄せ・横幅フィットで配置)
- 残り時間(0.1秒単位、画面上部やや大きめ表示。残り3秒以下で赤く警告)
- お手本(白い箱、常時2枠表示)— 2段×4列=8貫のグリッドで正解の並びを常時全表示。次に押すべき1貫をグレー枠のカーソルで表示
- 盛り台(木製トレー、常時2枠表示)— 台形の奥行きに沿って2段×4列で配置。正解するたびに1貫ずつ、上から落ちて着地するアニメで出現
- ネタ選択ボタン(下段、常時3つ)— タップ/クリックまたはPCキー**A/S/D**。押した瞬間、少し拡大+緑がかった色でフィードバック

### ネタと入力

- `NETA_TYPES = ['toro', 'tamago', 'ebi']`
- 正解判定: お手本の並び順(行優先、左上→右下)通りにネタボタンを押す
- 盛り台は常に2台表示。左が入力対象、右は次の内容をプレビュー表示。左が完成すると1秒かけて左へフレームアウト、右が左へスライド、新しい盛り台が右からフレームインする。**遷移中も右側(次)への入力を受け付ける**(スライド中に手が止まらない)

### ステージ進行

- 1ステージ = 盛り台`STAGE_PLATE_COUNT`(4台)を完成させると即クリア(4台目のフレームアウト開始と同時にクリア画面表示、スライド演出自体は裏で最後まで再生される)
- ステージ開始前に「ステージ開始!→3→2→1→GO」のカウントダウン(入力不可)。「3」「2」「1」でSE、「GO」で別のSE
- 各ステージの盛り台内容(`stageOrders`)はステージ開始時にまとめて確定させる(4台丸ごと事前生成、それ以降は追加生成しない)
- 状態遷移: `title → countdown → playing → (cleared → countdown → playing → ...) → gameover → title`。`title`/`cleared`/`gameover`はタップ/キー入力で次に進む(`title`/`gameover`は表示から0.5秒間入力を無視)

### 制限時間(スコアの代わり)

- 開始 `INITIAL_TIME`(30秒)
- ステージクリアで `+STAGE_CLEAR_TIME_BONUS`(2秒)
- 盛り台1台をノーミスで完成させるたびに `+PLATE_NO_MISS_BONUS`(1秒)。タイマー付近に「ノーミス +1秒」と緑文字で表示(上に少し上がるアニメ)
- MISS1回につき `-ステージ番号 × MISS_TIME_PENALTY_PER_STAGE`(0.5秒/ステージ)。MISS表示にペナルティ秒数も表示
- 0秒でゲームオーバー(即座に画面表示、タイトルへ)

### 難易度調整(出題)

- 3種類目のネタ(`NETA_TYPES[2]` = エビ)の出現重みは、ステージ1で`DIFFICULTY_THIRD_TYPE_START_WEIGHT`(0.05、ほぼ出ない)、`DIFFICULTY_FULL_RANDOM_STAGE`(ステージ3)で重み1.0(完全ランダム)になるよう線形に増える(`getThirdTypeWeight`)
- 決まった組み合わせのお手本(`PRESET_ORDERS`)が1ステージにつき必ず1台出現する(名前+8貫の並び+`minThirdWeight`を持つ。現在の3種類目重みがしきい値以上のものだけが候補になり、出現時はお手本右上に名前を表示)。プリセットの追加・編集はこの配列を直接編集すればよい

### 演出

- 正解時: 画面中央に半透明のパラパラアニメ(`ef01〜05.png`、5コマ)、正解シェイク(背景・盛り台のみ揺れる。お手本・ボタン・タイマーは揺れない)
- MISS時: MISS用の別シェイク(揺れ幅・時間などのパラメータは正解時と独立して調整可能)、赤文字で上昇しながらMISS表示
- 盛り台完成時: GOOD!表示(退場する盛り台と一緒にスライド)

### サウンド

全SEの定義(ファイルパス・音量・ループ有無)は`sounds.js`内の`SOUNDS`オブジェクトに集約。呼び出し側は`Sounds.play('名前')`(単一)/`Sounds.playRandom(['名前', ...])`(複数候補からランダム)で再生し、ファイル名やHowlインスタンスを直接触らない。音量調整は`SOUNDS`の該当エントリの`volume`を編集するだけでよい。

### スタッツ表示

- ステージクリア画面: そのステージのタイム・MISS数・連続成功数(コンボ)・ノーミス盛り台数・クリアボーナス秒数
- ゲームオーバー画面: 通算(タイトルからここまで)の到達ステージ・握った貫数・最大コンボ・完成した盛り台数・ノーミス盛り台数・連続ノーミス盛り台数・MISS回数

## 作業上の注意

- **ユーザーの明示的な許可なくファイルを編集しないこと。** 設計・仕様に関わる変更は、内容を文章で提示し明確な同意を得てから実装する。「どうすべきか」「意味通じる?」等の質問は実装許可ではない。方向性を示す発言だけでも実装許可とみなさない。「実装して」等の明確な指示があってから着手する。
