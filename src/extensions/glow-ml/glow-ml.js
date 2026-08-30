// Glow Lab integration of ML2Scratch by Junya Ishihara (champierre), AGPL-3.0.
// Upstream: https://github.com/champierre/ml2scratch  (see GLOW-NOTES.md)
//
// Upstream ships this file as a scratch-vm built-in extension, so it required
// scratch-vm internals and the 'ml5' npm package. Glow loads it instead as a
// same-origin (therefore unsandboxed) TurboWarp custom extension, so the same
// values come from the global Scratch API and from ml5 fetched at load time.
// Everything below this preamble is champierre's original code, apart from the
// Glow renaming, the block review recorded in GLOW-NOTES.md, and the
// registration block at the end of the file.

/* global Scratch */

const ArgumentType = Scratch.ArgumentType;
const BlockType = Scratch.BlockType;
const Cast = Scratch.Cast;
const log = console;

/**
 * ml5.js is not bundled: it is loaded from a CDN just before the extension is
 * registered, and assigned here. ml5 downloads the MobileNet weights over the
 * network anyway, so this extension cannot work offline either way.
 * TODO glow-ets/scratch-gui#21: self-host ml5 to drop the third-party origin.
 * @type {object}
 */
let ml5 = null;

/**
 * Where ml5 is loaded from. The self-hosted copy is preferred; drop
 * ml5.min.js next to this file and webpack ships it to static/extensions/.
 * The CDN is only a fallback for a checkout that has not vendored it yet.
 * See GLOW-NOTES.md.
 */
const ML5_LOCAL_URL = new URL('static/extensions/glow-ml/ml5.min.js', location.href).href;
const ML5_CDN_URL = 'https://unpkg.com/ml5@0.12.2/dist/ml5.min.js';

/**
 * Loading ml5 is only half of going offline: featureExtractor('MobileNet')
 * then fetches two models of its own, a tfjs LayersModel from
 * storage.googleapis.com and a GraphModel from tfhub.dev. Both are plain
 * options on the constructor, so no patching of ml5 is needed - point them at
 * vendored copies and nothing leaves the origin. See GLOW-NOTES.md for what to
 * download.
 */
const MOBILENET_LOCAL_URL = new URL('static/extensions/glow-ml/mobilenet/model.json', location.href).href;
const MOBILENET_GRAPH_LOCAL_URL = new URL('static/extensions/glow-ml/mobilenet-graph/model.json', location.href).href;

/**
 * Options handed to featureExtractor. Empty means 'use ml5's own remote URLs',
 * which is what happens when the models have not been vendored. Resolved once,
 * before the extension registers.
 * @type {object}
 */
let mobilenetOptions = {};

/**
 * Formatter which is used for translating.
 * Upstream expects scratch-vm's 'format-message'; the unsandboxed extension API
 * exposes the same thing as Scratch.translate, minus the setup() accessor that
 * setLocale() reads below.
 * @type {Function}
 */
let formatMessage = message => Scratch.translate(message);
formatMessage.setup = () => ({locale: Scratch.vm.getLocale()});

/**
 * URL to get this extension as a module.
 * When it was loaded as a module, 'extensionURL' will be replaced a URL which is retrieved from.
 * @type {string}
 */
let extensionURL = new URL('static/extensions/glow-ml/glow-ml.js', location.href).href;

const HAT_TIMEOUT = 100;

/**
 * Glow: categories a fresh project starts with, so the dropdowns are never empty.
 * The pool behaves like Scratch's broadcast messages, except that a category is
 * never removed just because nothing uses it any more.
 */
const DEFAULT_CATEGORIES = ['category A', 'category B'];

/** Menu value meaning 'every category', used by reset, delete and counts. */
const ALL = 'all';

/** Menu value meaning 'whichever category was recognised', used by when received. */
const ANY = 'any';

/**
 * Glow: what the runtime calls the 'when received category' block. Extension
 * opcodes are prefixed with the extension id.
 */
const RECEIVED_HAT = 'glowML_whenReceived';

/**
 * Where the training data lives inside the project, via the VM's asset manager
 * (glow-ets/scratch-gui#22). Stored as a real asset rather than in project.json,
 * so restore points share one copy of it instead of duplicating it per snapshot.
 */
const ASSET_OWNER = 'glowML';
const ASSET_NAME = 'training';

/** How long to wait after the last change before writing the data again. */
const SAVE_DEBOUNCE_MS = 1000;

/**
 * How often a repeated problem may raise a speech bubble. A click always gets
 * through; a 'forever' loop is capped, because the bubble only ever shows the
 * last message anyway and emitting sixty SAY events a second is waste.
 */
const SAY_THROTTLE_MS = 200;

/**
 * How long a speech bubble stays up, as a base plus reading time per character.
 * Both are generous on purpose: for every problem after the first the bubble is
 * the only place the message is ever shown, and a pupil who reads slowly should
 * not lose it before finishing the sentence. The cap stops a very long message
 * from parking a bubble over the sprite for the rest of the lesson.
 */
const BUBBLE_BASE_MS = 4000;
const BUBBLE_MS_PER_CHAR = 90;
const BUBBLE_MAX_MS = 30000;

/**
 * How long the bubble for a message should stay up.
 * @param {string} message - what the bubble says
 * @returns {number} milliseconds
 */
const bubbleDuration = message => Math.min(
  BUBBLE_MAX_MS,
  BUBBLE_BASE_MS + (String(message).length * BUBBLE_MS_PER_CHAR)
);

/**
 * How many training examples to keep. A MobileNet feature vector is 1024 floats,
 * which serialises to roughly 7 KB, so 500 of them is about 3.5 MB - comfortably
 * inside the asset manager's 8 MB ceiling with room for other extensions.
 *
 * This is the real defence against 'forever [train category A]'. Without it the
 * examples grow without bound, and long before memory runs out the extension is
 * spending twenty seconds per save serialising megabytes it is then told it
 * cannot store.
 *
 * Refusing rather than rotating is deliberate: rotation would let that same
 * forever loop run at full cost indefinitely, and would quietly throw away a
 * pupil's earlier examples.
 */
const MAX_EXAMPLES_TOTAL = 500;

/** And no single category may take all of it. */
const MAX_EXAMPLES_PER_CATEGORY = 200;

/**
 * Byte counts shown to a person. Mirrors GlowAssetManager.formatBytes, which is
 * not reachable from here because the extension is loaded as a plain script.
 * @param {number} bytes - a byte count
 * @return {string} the same count, readable
 */
const formatBytes = bytes => {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${Math.round(value * 10) / 10} ${units[unit]}`;
};

/**
 * Glow: categories are shown in order everywhere, so a dropdown and the reporter
 * never disagree. Numeric so that 'category 10' sorts after 'category 2', and
 * case-insensitive so that capitalisation does not scatter related categories.
 * @param {string[]} categories - categories to sort, sorted in place
 * @return {string[]} - the same array
 */
const sortCategories = categories => categories.sort(
  (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
);

// Glow: the same artwork as the library inset icon, so the palette, the
// blocks and the library card all read as one extension. Upstream's icon is
// green, which clashed with the pink blocks.
const blockIconURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFOUlEQVR4Xu2az4oUSRDGo6rHVZQRvCzKIANCy6JP4BsIzjyBIIuCiHgVxbsiwt5FELz4BKPgyYOXfYJd/LM0LIsoHjyMIDJ2VRlfVsVMdk11T3ZGVXePGzm0U2NXZGX+8ouMzMhKhvS5ICvRBNJoSzN0BAygUggG0AAqCSjNTYEGUElAaW4KNIBKAkpzU6ABVBJQmpsCDaCSgNLcFGgAlQSU5qZAA6gkoDQ3BRpAJQGluSnQACoJKM1NgUqAS7H2T+hprOnC2P1OF9VtSWKONT/e36Rfb56khAr+If69f4o7wy343zSlTw/+o+O3j6oaPzVAKO9Sfp0OJD+B9z8bUrb+RQUwikJS5O6hWZ5TzqO5nz4Ftzer2o8+aKeiqDmwqJw2TRJK+LPfStLiuxhxCqyItdiO/TYG2+2NUuCk3iKsYI6GLgEYKg0pmAb8OycpG27oYgECGBuxH4Q8opN7WgVYRmS4ddlW6VZIpA4F7eqtHjBN/Z3Q40pbAwjlOSVwZHv351vX3v6505Rd6FEvRIVsN1LWltwiyVfXuGckDfd2Baxeb2sA0VEo7Z8K3ql7JyijL9TbWCbiDsJF6ypDFO/xegzQ/eXE4M4H6tNpAhixE3Xj3sfrD7f78Ype0pXixtzcOCqI1EdBgslWNiSAw0cK1LhVZA6eH3Qwjzl4XESxYuPby//JvNekrK1qWTKPoNYKQOkUPLW+rgKMX56XXcu99VcuOFlRTcBm5YLa7VyrAMd1GgrL+Mse715clOYfXDepbxbgZCop1nh+5ikGW9PYBfVMAEJhvSpI5DmrUXxtzupzAYrn2ZVbq3T+/nrU2M0EoCgNG8BempC4b33ui+qB0ki2dStnV6JqmhlAqDD9FwiT0n35ep5zn9BKlYvwmQF0Knz0miNymYjA9SIUbeRubR0YAgOKG1AJbhHUF9Lmve6ZKcCfCdzOFLAXYvt+IoGZzoGLOBbaPM7/HiD22prS+RyIxICUeuCQ7w4fPaI63HH7ZJbS9n65JqtJ+ULZj7//6z0dp+kPmDoHiJQWVvvYyg3o713Rt3/3DH3LMxpsvomOzEtpz43RuJxiPRPkp8Vg5+BFns51CrBMS3E6iwu62L/6G72rljG47q8eoyHDO1QBiHUlt01E6osrqM9p+LsO1gm2uhFptBjlSVs7BehcdqN8lFPBakpQnBS4nKgnFh7s/PxgUz1XNq45wHhe/agAiYRY9TnVaxpet500H6PhgIhO4OMm75BMtbKBSBIA8JB3QGhDPa+ogdcaQHEbmZClz34AQQrGuVL1cUeifOOkRKnPLpb1i9ulC/i5SL/e2DRW6y7s3JGTBBjxwWYZeRFdnet4Zxvj1l2414/KK2vHXB07B0hlRhtpfrjkXm7rQ3IunO64cOighYi/tTlQOorcWr1MWkY4t2IDsauf4I0cdUrFDPEyn4OIW448z6sAoPxXULp4CaA1gNIJf6JuOkhqGlVxZXTQvx6nAHlG4/s5o4fLroqm4BGirpB7ogCW72Q1l1JR5ffTnvXKcfleSvGfsasVuw6hu339JAqgJCFdRMUI13ohItg+OAoZSsxv1X0hdhP3sCMN4ojvPR92oZ4R0uypX29DpV+/H6blpYMh9S/2PS283halwM0/PtJy5BnCIhGN3f/6fYhS4CJBmHdbWt2JzLsz83i+AVRSN4AGUElAaW4KNIBKAkpzU6ABVBJQmpsCDaCSgNLcFGgAlQSU5qZAA6gkoDQ3BRpAJQGluSnQACoJKM1NgQZQSUBpbgo0gEoCSvMfVmgck4O62jUAAAAASUVORK5CYII=';

const Message = {
  train: {
    'ja': 'カテゴリー[CATEGORY]を学習する',
    'ja-Hira': 'カテゴリー[CATEGORY]をがくしゅうする',
    'en': 'train category [CATEGORY]',
    'it': 'addestra categoria [CATEGORY]',
    'zh-cn': '学习类别[CATEGORY]',
    'zh-tw': '學習類別[CATEGORY]'
  },
  when_received_block: {
    'ja': 'カテゴリー[CATEGORY]を受け取ったとき',
    'ja-Hira': 'カテゴリー[CATEGORY]をうけとったとき',
    'en': 'when received category [CATEGORY]',
    'it': 'quando ricevo categoria [CATEGORY]',
    'zh-cn': '接收到类别[CATEGORY]时',
    'zh-tw': '接收到類別[CATEGORY]時'
  },
  category_block: {
    'ja': 'カテゴリー',
    'ja-Hira': 'カテゴリー',
    'en': 'category',
    'it': 'categoria',
    'zh-cn': '类别',
    'zh-tw': '類別'
  },
  confidence_block: {
    'ja': '確信度',
    'ja-Hira': 'かくしんど',
    'en': 'confidence',
    'it': 'confidenza',
    'zh-cn': '置信度',
    'zh-tw': '信心度'
  },
  categories_and_counts_block: {
    'ja': 'カテゴリーと枚数',
    'ja-Hira': 'カテゴリーとまいすう',
    'en': 'categories and counts',
    'it': 'categorie e conteggi',
    'zh-cn': '类别和数量',
    'zh-tw': '類別和數量'
  },
  counts_category: {
    'ja': 'カテゴリー[CATEGORY]の枚数',
    'ja-Hira': 'カテゴリー[CATEGORY]のまいすう',
    'en': 'count of category [CATEGORY]',
    'it': 'conteggio categoria [CATEGORY]',
    'zh-cn': '类别数量[CATEGORY]',
    'zh-tw': '類別數量[CATEGORY]'
  },
  any: {
    'ja': 'のどれか',
    'ja-Hira': 'のどれか',
    'en': 'any',
    'it': 'qualunque',
    'zh-cn': '任何',
    'zh-tw': '任何'
  },
  all: {
    'ja': 'の全て',
    'ja-Hira': 'のすべて',
    'en': 'all',
    'it': 'tutte',
    'zh-cn': '所有',
    'zh-tw': '所有量'
  },
  new_category_button: {
    'ja': '新しいカテゴリーを作る',
    'ja-Hira': 'あたらしいカテゴリーをつくる',
    'en': 'New category',
    'it': 'Nuova categoria',
    'zh-cn': '新建类别',
    'zh-tw': '新增類別'
  },
  new_category_prompt: {
    'ja': '新しいカテゴリーの名前は？',
    'ja-Hira': 'あたらしいカテゴリーのなまえは？',
    'en': 'Name of the new category?',
    'it': 'Nome della nuova categoria?',
    'zh-cn': '新类别的名称？',
    'zh-tw': '新類別的名稱？'
  },
  category_exists: {
    'ja': 'そのカテゴリーはすでにあります。',
    'ja-Hira': 'そのカテゴリーはすでにあります。',
    'en': 'That category already exists.',
    'it': 'Questa categoria esiste già.',
    'zh-cn': '该类别已存在。',
    'zh-tw': '該類別已存在。'
  },
  delete_category: {
    'ja': 'カテゴリー[CATEGORY]を削除',
    'ja-Hira': 'カテゴリー[CATEGORY]をさくじょ',
    'en': 'delete category [CATEGORY]',
    'it': 'elimina categoria [CATEGORY]',
    'zh-cn': '删除类别[CATEGORY]',
    'zh-tw': '刪除類別[CATEGORY]'
  },
  confirm_delete_all: {
    'ja': '本当にすべてのカテゴリーを削除してもよろしいですか？',
    'ja-Hira': 'ほんとうにすべてのカテゴリーをさくじょしてもよろしいですか？',
    'en': 'Delete every category and learnt data ?',
    'it': 'Vuoi davvero eliminare tutte le categorie e i dati imparati?',
    'zh-cn': '确定要删除所有类别及其学习内容吗？',
    'zh-tw': '確定要刪除所有類別及其學習內容嗎？'
  },
  reset: {
    'ja': 'カテゴリー[CATEGORY]の学習をリセット',
    'ja-Hira': 'カテゴリー[CATEGORY]のがくしゅうをリセット',
    'en': 'reset category [CATEGORY]',
    'it': 'resetta categoria [CATEGORY]',
    'zh-cn': '重置[CATEGORY]',
    'zh-tw': '重置[CATEGORY]'
  },
  download_learning_data: {
    'ja': '学習データをダウンロード',
    'ja-Hira': 'がくしゅうデータをダウンロード',
    'en': 'download learning data',
    'it': 'scarica dati apprendimento',
    'zh-cn': '下载学习数据',
    'zh-tw': '下載學習資料'
  },
  upload_learning_data: {
    'ja': '学習データをアップロード',
    'ja-Hira': 'がくしゅうデータをアップロード',
    'en': 'upload learning data',
    'it': 'carica dati apprendimento',
    'zh-cn': '上传学习数据',
    'zh-tw': '上傳學習資料'
  },
  upload: {
    'ja': 'アップロード',
    'ja-Hira': 'アップロード',
    'en': 'upload',
    'it': 'carica',
    'zh-cn': '上传',
    'zh-tw': '上傳'
  },
  close: {
    'ja': '閉じる',
    'ja-Hira': 'とじる',
    'en': 'close',
    'it': 'chiudi',
    'zh-cn': '关闭',
    'zh-tw': '關閉'
  },
  select_file: {
    'ja': 'JSONファイルを選んで下さい。',
    'ja-Hira': 'JSONファイルをえらんでください。',
    'en': 'Please select a JSON file.',
    'it': 'Seleziona un file JSON.',
    'zh-cn': '请选择JSON文件。',
    'zh-tw': '請選擇JSON檔案。'
  },
  uploaded: {
    'ja': 'アップロードが完了しました。',
    'ja-Hira': 'アップロードがかんりょうしました。',
    'en': 'The upload is complete.',
    'it': 'Il caricamento è completo',
    'zh-cn': '上传完成。',
    'zh-tw': '上傳完成。'
  },
  upload_instruction: {
    'ja': 'ファイルを選び、アップロードボタンをクリックして下さい。',
    'ja-Hira': 'ファイルをえらび、アップロードボタンをクリックしてください。',
    'en': 'Select a file and click the upload button.',
    'it': 'Seleziona un file e clicca il bottone di caricamento',  
    'zh-cn': '选择一个文件，然后单击上传按钮。',
    'zh-tw': '選擇一個檔案，然後點擊上傳按鈕'
  },
  confirm_reset: {
    'ja': '本当にリセットしてもよろしいですか？',
    'ja-Hira': 'ほんとうにリセットしてもよろしいですか？',
    'en': 'Are you sure to reset?',
    'it': 'Sei sicuro di voler resettare i dati?',
    'zh-cn': '你确定要重置吗？',
    'zh-tw': '您確定要重置嗎？'
  },
  toggle_classification: {
    'ja': '分類を[CLASSIFICATION_STATE]にする',
    'ja-Hira': 'ぶんるいを[CLASSIFICATION_STATE]にする',
    'en': 'turn classification [CLASSIFICATION_STATE]',
    'it': 'imposta classificazione [CLASSIFICATION_STATE]',
    'zh-cn': '[CLASSIFICATION_STATE]分类',
    'zh-tw': '[CLASSIFICATION_STATE]分類'
  },
  set_classification_interval: {
    'ja': '分類を[CLASSIFICATION_INTERVAL]秒間に1回行う',
    'ja-Hira': 'ぶんるいを[CLASSIFICATION_INTERVAL]びょうかんに1かいおこなう',
    'en': 'classify once every [CLASSIFICATION_INTERVAL] seconds',
    'it': 'classifica una volta ogni [CLASSIFICATION_INTERVAL] secondi',
    'zh-cn': '每隔[CLASSIFICATION_INTERVAL]秒标记一次',
    'zh-tw': '每隔[CLASSIFICATION_INTERVAL]秒標記一次'
  },
  video_toggle: {
    'ja': 'ビデオを[VIDEO_STATE]にする',
    'ja-Hira': 'ビデオを[VIDEO_STATE]にする',
    'en': 'turn video [VIDEO_STATE]',
    'it': 'imposta video [VIDEO_STATE]',
    'zh-cn': '[VIDEO_STATE]摄像头',
    'zh-tw': '視訊設為[VIDEO_STATE]'
  },
  set_video_transparency: {
    'ja': 'ビデオの透明度を[TRANSPARENCY]にする',
    'ja-Hira': 'ビデオのとうめいどを[TRANSPARENCY]にする',
    'en': 'set video transparency to [TRANSPARENCY]',
    'it': 'imposta trasparenza video a [TRANSPARENCY]',
    'zh-cn': '将视频透明度设为[TRANSPARENCY]',
    'zh-tw': '將視訊透明度設為[TRANSPARENCY]'
  },
  set_input: {
    'ja': '[INPUT]の画像を学習/判定する',
    'ja-Hira': '[INPUT]のがぞうをがくしゅう/はんていする',
    'en': 'learn/classify [INPUT] image',
    'it': 'addestra / classifica immagine da [INPUT]',
    'zh-cn': '学习/分类[INPUT]图像',
    'zh-tw': '學習/分類[INPUT]影像'
  },
  switch_webcam: {
    'ja': 'カメラを[DEVICE]に切り替える',
    'ja-Hira': 'カメラを[DEVICE]にきりかえる',
    'en': 'switch webcam to [DEVICE]',
    'it': 'imposta webcam a [DEVICE]',
    'zh-cn': '网络摄像头切换到[DEVICE]',
    'zh-tw': '網路攝影機切換到[DEVICE]'
  },
  on: {
    'ja': '入',
    'ja-Hira': 'いり',
    'en': 'on',
    'it': 'accesa',
    'zh-cn': '开启',
    'zh-tw': '開啟'
  },
  off: {
    'ja': '切',
    'ja-Hira': 'きり',
    'en': 'off',
    'it': 'spenta',
    'zh-cn': '关闭',
    'zh-tw': '關閉'
  },
  video_on_flipped: {
    'ja': '左右反転',
    'ja-Hira': 'さゆうはんてん',
    'en': 'on flipped',
    'it': 'acceso rovesciato',
    'zh-cn': '镜像开启',
    'zh-tw': '翻轉'
  },
  webcam: {
    'ja': 'カメラ',
    'ja-Hira': 'カメラ',
    'en': 'webcam',
    'it': 'webcam',
    'zh-cn': '网络摄像头',
    'zh-tw': '網路攝影機'
  },
  stage: {
    'ja': 'ステージ',
    'ja-Hira': 'ステージ',
    'en': 'stage',
    'it': 'stage',
    'zh-cn': '舞台',
    'zh-tw': '舞台'
  },
  unnamed_camera: {
    'ja': '選んだカメラ',
    'ja-Hira': 'えらんだカメラ',
    'en': 'the chosen camera',
    'it': 'la webcam scelta',
    'zh-cn': '所选摄像头',
    'zh-tw': '所選攝影機'
  },
  no_cameras: {
    'ja': '[BLOCK]は何もしませんでした。切り替えられるカメラがありません。ブラウザでカメラを許可して下さい。',
    'ja-Hira': '[BLOCK]はなにもしませんでした。きりかえられるカメラがありません。ブラウザでカメラをきょかしてください。',
    'en': "[BLOCK] FAILED: can't find cameras! Allow the camera in your browser.",
    'it': "[BLOCK] E' FALLITO: non ci sono webcam a cui passare! Permetti la webcam nel browser.",
    'zh-cn': '[BLOCK]没有任何作用：没有可切换的摄像头。请在浏览器中允许摄像头。',
    'zh-tw': '[BLOCK]沒有任何作用：沒有可切換的攝影機。請在瀏覽器中允許攝影機。'
  },
  no_input: {
    'ja': '[BLOCK]を停止しました。カメラの映像がありません。ブラウザでカメラを許可するか、「[INPUT]」でステージから学習して下さい。',
    'ja-Hira': '[BLOCK]をていししました。カメラのえいぞうがありません。ブラウザでカメラをきょかするか、「[INPUT]」でステージからがくしゅうしてください。',
    'en': '[BLOCK] FAILED: there is no picture to learn from! Allow the camera in your browser, or use "[INPUT]" instead.',
    'it': "[BLOCK] E' FALLITO: non c'è nessuna immagine da cui imparare! Permetti la webcam nel browser, oppure usa \"[INPUT]\".",
    'zh-cn': '[BLOCK]已停止：没有可学习的画面。请在浏览器中允许摄像头，或使用“[INPUT]”改从舞台学习。',
    'zh-tw': '[BLOCK]已停止：沒有可學習的畫面。請在瀏覽器中允許攝影機，或使用「[INPUT]」改從舞台學習。'
  },
  max_examples_per_category: {
    'ja': '[BLOCK]を停止しました。1つのカテゴリーに保存できる学習例は[N]個までです。[CATEGORY]をリセットするか削除すると、また学習できます。',
    'ja-Hira': '[BLOCK]をていししました。1つのカテゴリーにほぞんできるがくしゅうれいは[N]こまでです。[CATEGORY]をリセットするかさくじょすると、またがくしゅうできます。',
    'en': '[BLOCK] FAILED: a category can hold at most [N] training examples! Reset or delete [CATEGORY] to train it again.',
    'it': "[BLOCK] E' FALLITO: una categoria può contenere al massimo [N] esempi. Resetta o elimina [CATEGORY] per addestrarla ancora.",
    'zh-cn': '[BLOCK]已停止：每个类别最多保存[N]个训练样本。请重置或删除[CATEGORY]后再训练。',
    'zh-tw': '[BLOCK]已停止：每個類別最多儲存[N]個訓練範例。請重置或刪除[CATEGORY]後再訓練。'
  },
  max_examples_total: {
    'ja': '[BLOCK]を停止しました。1つのプロジェクトに保存できる学習例は全部で[N]個までです。現在は[COUNTS]です。カテゴリーをリセットするか削除して下さい。',
    'ja-Hira': '[BLOCK]をていししました。1つのプロジェクトにほぞんできるがくしゅうれいはぜんぶで[N]こまでです。いまは[COUNTS]です。カテゴリーをリセットするかさくじょしてください。',
    'en': '[BLOCK] FAILED: a project can hold at most [N] training examples in total! Currently [COUNTS]. Reset or delete a category to train more.',
    'it': "[BLOCK] E' FALLITO: un progetto può contenere al massimo [N] esempi in tutto. Attualmente [COUNTS]. Resetta o elimina una categoria per addestrarne altri.",
    'zh-cn': '[BLOCK]已停止：每个项目最多共保存[N]个训练样本。当前为[COUNTS]。请重置或删除某个类别后再训练。',
    'zh-tw': '[BLOCK]已停止：每個專案最多共儲存[N]個訓練範例。目前為[COUNTS]。請重置或刪除某個類別後再訓練。'
  },
  too_much_data: {
    'ja': '学習データが大きすぎてプロジェクトに保存できません。カテゴリーを減らすか、学習をリセットして下さい。',
    'ja-Hira': 'がくしゅうデータがおおきすぎてプロジェクトにほぞんできません。カテゴリーをへらすか、がくしゅうをリセットしてください。',
    'en': 'Too much training data ([SIZE], the limit is [LIMIT])! Delete a category or reset some training.',
    'it': "Ci sono troppi dati di addestramento ([SIZE], il limite è [LIMIT])! Elimina una categoria o resetta un po' di addestramento.",
    'zh-cn': '训练数据太多，无法保存在项目中。请删除类别或重置部分训练。',
    'zh-tw': '訓練資料太多，無法儲存在專案中。請刪除類別或重置部分訓練。'
  },
  model_broken: {
    'ja': 'MobileNetモデルを読み込めませんでした。学習と判定はできません。詳しくはコンソールを見て下さい。',
    'ja-Hira': 'MobileNetモデルをよみこめませんでした。がくしゅうとはんていはできません。くわしくはコンソールをみてください。',
    'en': 'The MobileNet model could not be loaded, so training and recognising will not work (see browser console for details)',
    'it': 'Non è stato possibile caricare il modello MobileNet, perciò addestramento e riconoscimento non funzioneranno (per dettagli vedere la console del browser)',
    'zh-cn': '无法加载MobileNet模型，训练和识别将无法使用。详见浏览器控制台。',
    'zh-tw': '無法載入MobileNet模型，訓練和辨識將無法使用。詳見瀏覽器主控台。'
  },
}

const AvailableLocales = ['en', 'it', 'ja', 'ja-Hira', 'zh-cn', 'zh-tw'];

class GlowMLBlocks {

  /**
   * @return {string} - the name of this extension.
   */
  static get EXTENSION_NAME() {
    // Also the stage monitor prefix ('<name>: <block text>') and the palette
    // category heading, so it has to stay short.
    return 'Glow ML';
  }

  /**
   * @return {string} - the ID of this extension.
   */
  static get EXTENSION_ID() {
    return 'glowML';
  }

  /**
   * URL to get this extension.
   * @type {string}
   */
  static get extensionURL() {
    return extensionURL;
  }

  /**
   * Set URL to get this extension.
   * extensionURL will be reset when the module is loaded from the web.
   * @param {string} url - URL
   */
  static set extensionURL(url) {
    extensionURL = url;
  }

  constructor(runtime) {
    this.runtime = runtime;
    if (runtime.formatMessage) {
      // Replace 'formatMessage' to a formatter which is used in the runtime.
      formatMessage = runtime.formatMessage;
    }

    this.when_received = false;
    this.when_received_arr = Array(8).fill(false);
    this.category = null;
    this.confidence = 0;
    this.locale = this.setLocale();

    this.blockClickedAt = null;

    this.counts = null;

    // Glow: set while train() is working, so repeated clicks are dropped
    // instead of stacking identical frames into the training set.
    this.training = false;

    // Glow: the model loads asynchronously and can fail (missing or truncated
    // weight shards, for one). Until it is known good, nothing that calls
    // infer() may run.
    this.modelReady = false;
    this.modelBroken = false;

    this.interval = 1000;
    this.globalVideoTransparency = 0;
    this.setVideoTransparency({
      TRANSPARENCY: this.globalVideoTransparency
    });

    this.canvas = document.querySelector('canvas');

    // Glow: VideoProvider._setupVideo() catches getUserMedia failures, calls its
    // own onError and resolves undefined, so there is nothing here to .catch().
    // A refused or missing camera arrives as a null video instead, which used to
    // surface much later as ml5 reading '.elt' of null, reported as a broken model.
    this.runtime.ioDevices.video.enableVideo().then(() => {
      this.input = this.runtime.ioDevices.video.provider.video;
    });

    this.knnClassifier = ml5.KNNClassifier();

    // Glow: the VM's asset manager, when running against a VM that has one.
    this.assetManager = runtime.glowAssetManager || null;
    this.saveTimer = null;
    this.warnedAboutSize = false;
    // Set to the example count at which a save was refused, so we stop paying to
    // serialise data we already know will not fit. Cleared when it shrinks.
    this.saveRefusedAtExamples = null;
    // Every problem already reported. A Set, not a single slot: several scripts
    // can be stopped by different problems at the same time.
    this.reportedProblems = new Set();
    // When the last speech bubble went up, so a loop cannot emit one per frame.
    this.lastSayAt = 0;
    // The bubble we put up, and the timer that takes it down again.
    this.sayTarget = null;
    this.sayTimer = null;
    // Set while we emit SAY ourselves, so the listener below can tell our own
    // bubble apart from one the project's 'say' block put up.
    this.emittingSay = false;
    if (this.runtime.on) {
      this.runtime.on('SAY', target => {
        // The project said something on the sprite holding our bubble. That
        // message is now the one on screen, so stop counting the bubble as ours
        // and let their block decide when it goes away.
        if (!this.emittingSay && target === this.sayTarget) {
          this.forgetBubble();
        }
      });
    }
    if (this.assetManager) {
      this.assetManager.on('warning', event => {
        console.warn(`Glow ML: the project is holding ${event.totalBytes} bytes of extension data, ` +
          `the limit is ${event.maxBytes}`);
      });
      // Loading a project replaces what the manager holds, so follow it.
      this.runtime.on('PROJECT_LOADED', () => this.loadFromProject());
      // The extension can also be added to a project that is already open.
      this.loadFromProject();
    } else {
      console.warn('Glow ML: this VM has no glowAssetManager, so training data will not be saved ' +
        'inside the project. The download and upload blocks still work. See glow-ets/scratch-gui#22');
    }

    this.featureExtractor = ml5.featureExtractor('MobileNet', mobilenetOptions, error => {
      // Glow: upstream ignores this argument and starts classifying regardless,
      // which turns a failed model into one exception per interval forever and
      // a video pipeline that never settles.
      if (error) {
        this.reportBrokenModel(error);
        return;
      }
      console.log('[featureExtractor] Model Loaded!');
      this.modelReady = true;
      this.timer = setInterval(() => {
        this.classify();
      }, this.interval);
    });

    // The callback above has been seen to fire before a later stage of the load
    // rejects, so watch the promise too.
    if (this.featureExtractor && this.featureExtractor.ready && this.featureExtractor.ready.catch) {
      this.featureExtractor.ready.catch(error => this.reportBrokenModel(error));
    }

    this.devices = [{ text: 'default', value: '' }];

    const dialog = document.createElement("DIALOG");
    dialog.id = "upload-dialog";
    dialog.innerHTML = `
      <html><body>
      <div>${Message.upload_instruction[this.locale]}</p><input type="file" id="upload-files"><input type="button" value="${Message.upload[this.locale]}" id="upload-button"></div>
      <div style="margin-top:10px;display:flex;justify-content:flex-end;"><button id="close" aria-label="${Message.close[this.locale]}" formnovalidate>${Message.close[this.locale]}</button></div>
      </body><body>
    `;
    this.uploadDialog = dialog;
    document.body.appendChild(dialog);


    document.getElementById("upload-button").onclick = () =>{
      this.uploadButtonClicked();
    }

    document.getElementById("close").onclick = () =>{
      dialog.close();
    }

    try {
      navigator.mediaDevices.enumerateDevices().then(media => {
        for (const device of media) {
          if (device.kind === 'videoinput') {
            this.devices.push({
              text: device.label,
              value: device.deviceId
            });
          }
        }
      });
    } catch (e) {
      console.error("failed to load media devices!");
    }
  }

  getInfo() {
    this.locale = this.setLocale();

    return {
      id: GlowMLBlocks.EXTENSION_ID,
      name: GlowMLBlocks.EXTENSION_NAME,
      extensionURL: GlowMLBlocks.extensionURL,
      blockIconURI: blockIconURI,
      color1: '#f000ee',
      color2: '#c000be',
      color3: '#950094',
      blocks: [
        {
          blockType: BlockType.BUTTON,
          text: Message.new_category_button[this.locale],
          func: 'createCategory'
        },
        {
          opcode: 'train',
          text: Message.train[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            CATEGORY: {
              type: ArgumentType.STRING,
              menu: 'train_menu'
            }
          }
        },
        {
          opcode: 'whenReceived',
          text: Message.when_received_block[this.locale],
          blockType: BlockType.HAT,
          // Glow: this is 'when key pressed', not 'when I receive'. It is an
          // event, fired by classify() rather than polled once a frame, and a
          // firing is *ignored* while the script it would start is still
          // running. Stated rather than left to the extension API's default,
          // which is the opposite (isEdgeActivated true) and gives the block
          // the shape of a sensor like 'when [timer] > 0'.
          // See GLOW-NOTES.md, "The hat is an event, not a sensor".
          isEdgeActivated: false,
          shouldRestartExistingThreads: false,
          arguments: {
            CATEGORY: {
              type: ArgumentType.STRING,
              menu: 'received_menu'
            }
          }
        },        
        {
          opcode: 'getCategory',
          text: Message.category_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'getConfidence',
          text: Message.confidence_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'getCategoriesAndCounts',
          text: Message.categories_and_counts_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'getCountByCategory',
          text: Message.counts_category[this.locale],
          blockType: BlockType.REPORTER,
          disableMonitor: true,
          arguments: {
            CATEGORY: {
              type: ArgumentType.STRING,
              menu: 'count_menu'
            }
          }
        },

        {
          opcode: 'reset',
          blockType: BlockType.COMMAND,
          text: Message.reset[this.locale],
          arguments: {
            CATEGORY: {
              type: ArgumentType.STRING,
              menu: 'reset_menu'
            }
          }
        },
        {
          opcode: 'deleteCategory',
          blockType: BlockType.COMMAND,
          text: Message.delete_category[this.locale],
          arguments: {
            CATEGORY: {
              type: ArgumentType.STRING,
              menu: 'delete_menu'
            }
          }
        },
        {
          opcode: 'setClassificationInterval',
          text: Message.set_classification_interval[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            CLASSIFICATION_INTERVAL: {
              type: ArgumentType.STRING,
              menu: 'classification_interval_menu',
              defaultValue: '1'
            }
          }
        },
        {
          opcode: 'download',
          text: Message.download_learning_data[this.locale],
          blockType: BlockType.COMMAND
        },
        {
          opcode: 'upload',
          text: Message.upload_learning_data[this.locale],
          blockType: BlockType.COMMAND
        },
        {
          opcode: 'toggleClassification',
          text: Message.toggle_classification[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            CLASSIFICATION_STATE: {
              type: ArgumentType.STRING,
              menu: 'classification_menu',
              defaultValue: 'off'
            }
          }
        },
        {
          opcode: 'setVideoTransparency',
          text: Message.set_video_transparency[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            TRANSPARENCY: {
              type: ArgumentType.NUMBER,
              defaultValue: 50
            }
          }
        },
        {
          opcode: 'switchCamera',
          blockType: BlockType.COMMAND,
          text: Message.switch_webcam[this.locale],
          arguments: {
            DEVICE: {
              type: ArgumentType.STRING,
              defaultValue: '',
              menu: 'mediadevices'
            }
          }
        },
        {
          opcode: 'setInput',
          text: Message.set_input[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            INPUT: {
              type: ArgumentType.STRING,
              menu: 'input_menu',
              defaultValue: 'webcam'
            }
          }
        },
        {
          opcode: 'videoToggle',
          text: Message.video_toggle[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            VIDEO_STATE: {
              type: ArgumentType.STRING,
              menu: 'video_menu',
              defaultValue: 'off'
            }
          }
        }
      ],
      menus: {
        train_menu: {
          items: 'getTrainMenu'
        },
        received_menu: {
          items: 'getReceivedMenu'
        },
        reset_menu: {
          items: 'getResetMenu'
        },
        delete_menu: {
          items: 'getDeleteMenu'
        },
        count_menu: {
          items: 'getCountMenu'
        },
        video_menu: this.getVideoMenu(),
        classification_interval_menu: {
          acceptReporters: true,
          items: this.getClassificationIntervalMenu()
        },
        classification_menu: this.getClassificationMenu(),
        input_menu: this.getInputMenu(),
        mediadevices: {
          acceptReporters: true,
          items: 'getDevices'
        }
      }
    };
  }

  /**
   * The transparency setting of the video preview stored in a value
   * accessible by any object connected to the virtual machine.
   * @type {number}
   */
  get globalVideoTransparency() {
    const stage = this.runtime.getTargetForStage();
    if (stage) {
      return stage.videoTransparency;
    }
    return 50;
  }

  set globalVideoTransparency(transparency) {
    const stage = this.runtime.getTargetForStage();
    if (stage) {
      stage.videoTransparency = transparency;
    }
    return transparency;
  }

  train(args, util) {
    if (!this.checkModelReady()) {
      return;
    }
    if (!this.checkInputReady(args, util)) {
      return;
    }
    // Glow: a click arriving while the previous one is still working is dropped.
    // Upstream relied on a one-off alert telling people not to click again; the
    // block now shows that it is busy, and ignores the extra clicks either way.
    if (this.training) {
      return;
    }
    if (!this.checkExampleLimits(args.CATEGORY, util)) {
      return;
    }
    this.training = true;

    // Returning a promise puts the thread in STATUS_PROMISE_WAIT
    // (scratch-vm execute.js), which keeps the block glowing until it settles.
    // infer() blocks, and the first call also compiles the WebGL shaders, so
    // wait for the glow to be on screen before starting it.
    return new Promise(resolve => {
      afterPaint(() => {
        try {
          const features = this.featureExtractor.infer(this.input);
          this.knnClassifier.addExample(features, args.CATEGORY);
          this.updateCounts();
          this.scheduleSave();
        } catch (error) {
          // The camera can die between the check above and here. That is not a
          // broken model, and saying so would be the old misleading message.
          if (!this.usingStageInput() && !this.hasWorkingCamera()) {
            this.checkCamera(this.blockName('train', {CATEGORY: args.CATEGORY}), util);
          } else {
            this.reportBrokenModel(error);
          }
        }
        this.training = false;
        resolve();
      });
    });
  }

  getCategory() {
    return this.category;
  }

  /**
   * Glow: how sure the classifier is about the category it is currently reporting.
   * @return {number} - confidence of the current category, 0 to 1
   */
  getConfidence() {
    // Rounded, because a k-nearest-neighbour vote share reads as
    // 0.6666666666666666 on a stage monitor otherwise.
    return Math.round(this.confidence * 100) / 100;
  }

  whenReceived(args) {
    if (args.CATEGORY === ANY) {
      if (this.when_received) {
        setTimeout(() => {
          this.when_received = false;
        }, HAT_TIMEOUT);
        return true;
      }
      return false;
    } else {
      if (this.when_received_arr[args.CATEGORY]) {
        setTimeout(() => {
          this.when_received_arr[args.CATEGORY] = false;
        }, HAT_TIMEOUT);
        return true;
      }
      return false;
    }
  }

  getCountByCategory(args) {
    if (!this.counts) {
      return 0;
    }
    if (args.CATEGORY === ALL) {
      return Object.values(this.counts).reduce((total, count) => total + count, 0);
    }
    if (this.counts[args.CATEGORY]) {
      return this.counts[args.CATEGORY];
    } else {
      return 0;
    }
  }

  /**
   * Glow: Scratch has no list-valued reporter, so every category and its example
   * count go into one string, 'category:count' pairs separated by two spaces.
   * Categories with nothing trained yet are included, so the reporter doubles as a
   * view of the pool.
   * @return {string} - e.g. 'category A:12  category B:9'
   */
  getCategoriesAndCounts() {
    return this.categories
      .map(category => `${category}:${(this.counts && this.counts[category]) || 0}`)
      .join('  ');
  }

  reset(args) {
    if (this.actionRepeated()) { return };

    setTimeout(() => {
      if (args.CATEGORY == ALL) {
        // Glow: only wiping everything is worth interrupting for. Resetting one
        // category used to ask too, which trained people to click through it.
        if (!confirm(Message.confirm_reset[this.locale])) {
          return;
        }
        this.knnClassifier.clearAllLabels();
        for (let category in this.counts) {
          this.counts[category] = 0;
        }
      } else {
        // Glow: this.counts is null until something has been trained.
        if (this.counts && this.counts[args.CATEGORY] > 0) {
          this.knnClassifier.clearLabel(args.CATEGORY);
          this.counts[args.CATEGORY] = 0;
        }
      }
      this.reportedProblems.clear();
      this.scheduleSave();
    }, 1000);
  }

  /**
   * Glow: reset forgets what a category learned but keeps the category; delete takes
   * it out of the pool as well, so the dropdowns stop offering it.
   * @param {object} args - the block arguments
   * @param {string} args.CATEGORY - a category, or ALL
   */
  deleteCategory(args) {
    if (this.actionRepeated()) { return };

    setTimeout(() => {
      if (args.CATEGORY === ALL) {
        if (!confirm(Message.confirm_delete_all[this.locale])) {
          return;
        }
        this.knnClassifier.clearAllLabels();
        this.counts = null;
        this.categories = DEFAULT_CATEGORIES.slice();
        this.reportedProblems.clear();
        this.scheduleSave();
        return;
      }
      if (this.counts && this.counts[args.CATEGORY] > 0) {
        this.knnClassifier.clearLabel(args.CATEGORY);
        delete this.counts[args.CATEGORY];
      }
      this.categories = this.categories.filter(category => category !== args.CATEGORY);
      this.reportedProblems.clear();
      this.scheduleSave();
    }, 1000);
  }

  download() {
    if (this.actionRepeated()) { return };
    let fileName = String(Date.now());
    this.knnClassifier.save(fileName);
  }

  upload() {
    if (this.actionRepeated()) { return };

    document.getElementById('upload-dialog').showModal();
  }

  toggleClassification(args, util) {
    let state = args.CLASSIFICATION_STATE;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (state === 'on') {
      // Glow: classify() is on a timer and has to stay silent, so turning it on
      // is the moment to say that it will not see anything.
      this.checkCamera(this.blockName('toggle_classification', {CLASSIFICATION_STATE: state}), util);
      this.timer = setInterval(() => {
        this.classify();
      }, this.interval);
    }
  }

  setClassificationInterval(args, util) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Glow: this restarts the classify timer, so it has the same blind spot.
    this.checkCamera(
      this.blockName('set_classification_interval', {CLASSIFICATION_INTERVAL: args.CLASSIFICATION_INTERVAL}),
      util
    );
    this.interval = args.CLASSIFICATION_INTERVAL * 1000;
    this.timer = setInterval(() => {
      this.classify();
    }, this.interval);
  }

  videoToggle(args, util) {
    let state = args.VIDEO_STATE;
    if (state === 'off') {
      this.runtime.ioDevices.video.disableVideo();
    } else {
      const block = this.blockName('video_toggle', {VIDEO_STATE: state});
      this.runtime.ioDevices.video.enableVideo().then(() => {
        this.input = this.runtime.ioDevices.video.provider.video;
        // Glow: enableVideo() resolves whether or not permission was given, so
        // this is the only place the block can find out that nothing happened.
        // Without it the failure was a console line and a dead stage.
        if (!this.usingStageInput()) {
          this.checkCamera(block, util);
        }
      });
      this.runtime.ioDevices.video.mirror = state === "on";
    }
  }

  /**
   * A scratch command block handle that configures the video preview's
   * transparency from passed arguments.
   * @param {object} args - the block arguments
   * @param {number} args.TRANSPARENCY - the transparency to set the video
   *   preview to
   */
  setVideoTransparency(args) {
    const transparency = Cast.toNumber(args.TRANSPARENCY);
    this.globalVideoTransparency = transparency;
    this.runtime.ioDevices.video.setPreviewGhost(transparency);
  }

  setInput(args, util) {
    let input = args.INPUT;
    if (input === 'webcam') {
      this.input = this.runtime.ioDevices.video.provider.video;
      // Glow: switching to a camera that is not there should say so now, rather
      // than leaving the next train block to fail.
      this.checkCamera(this.blockName('set_input', {INPUT: Message.webcam[this.locale]}), util);
    } else {
      this.input = this.canvas;
      if (!this.input) {
        console.warn('Glow ML: no stage canvas found, so the stage cannot be used as input');
      }
    }
  }

  uploadButtonClicked() {
    let files = document.getElementById('upload-files').files;

    if (files.length <= 0) {
      alert(Message.select_file[this.locale]);
      return false;
    }

    let fr = new FileReader();

    fr.onload = (e) => {
      let data = JSON.parse(e.target.result);
      this.knnClassifier.load(data, () => {
        console.log('uploaded!');

        this.updateCounts();
        this.scheduleSave();
        alert(Message.uploaded[this.locale]);
      });
    }

    fr.onloadend = (e) => {
      document.getElementById('upload-files').value = "";
    }

    fr.readAsText(files.item(0));
    this.uploadDialog.close();
  }

  classify() {
    if (!this.checkModelReady()) {
      return;
    }
    // Glow: no picture, nothing to classify. Checks the camera rather than just
    // this.input, because a permission revoked mid-session leaves the video
    // element in place but dead. Silent: the timer runs every second, and
    // train() or 'turn classification on' is where a person finds out.
    if (!this.usingStageInput() && (!this.input || !this.hasWorkingCamera())) {
      return;
    }
    let numCategories = this.knnClassifier.getNumLabels();
    if (numCategories == 0) return;

    let features;
    try {
      features = this.featureExtractor.infer(this.input);
    } catch (error) {
      this.reportBrokenModel(error);
      return;
    }
    this.knnClassifier.classify(features, (err, result) => {
      if (err) {
        console.error(err);
      } else {
        this.category = this.getTopConfidenceCategory(result.confidencesByLabel);
        this.confidence = result.confidencesByLabel[this.category] || 0;
        this.when_received = true;
        this.when_received_arr[this.category] = true
        this.fireReceivedHats(this.category);
      }
    });
  }

  /**
   * Glow: fire 'when received category', the way the keyboard fires
   * 'when key pressed'. Upstream left the hat edge activated, so the runtime
   * polled it once a frame instead; see GLOW-NOTES.md for why that is the wrong
   * shape for this block.
   *
   * No field matching here, unlike broadcast. startHats starts a thread for
   * every 'when received' script that is not already running, and each one's
   * own hat block then decides: whenReceived() returns false for a category
   * that was not the one recognised, and execute() retires a non-edge hat whose
   * predicate is false. That keeps the choosing in the block, where the 'any'
   * option and the category names already live, instead of in an argument that
   * has to name a field the runtime generated.
   * @param {string} category - the category just recognised
   */
  fireReceivedHats(category) {
    if (!category || !this.runtime.startHats) {
      return;
    }
    this.runtime.startHats(RECEIVED_HAT);
  }

  getTopConfidenceCategory(confidences) {
    let topConfidenceCategory;
    let topConfidence = 0;

    for (let category in confidences) {
      if (confidences[category] > topConfidence) {
        // Glow: upstream never advances topConfidence, so this returns the last
        // category with a non-zero confidence rather than the best one.
        topConfidence = confidences[category];
        topConfidenceCategory = category;
      }
    }

    return topConfidenceCategory;
  }

  updateCounts() {
    this.counts = this.knnClassifier.getCountByLabel();
    // Glow: upstream logged the counts here on every training, which a loop turns
    // into thousands of console lines. The 'categories and counts' reporter shows the
    // same thing on the stage.
  }

  actionRepeated() {
    let currentTime = Date.now();
    if (this.blockClickedAt && (this.blockClickedAt + 250) > currentTime) {
      console.log('Please do not repeat trigerring this block.');
      this.blockClickedAt = currentTime;
      return true;
    } else {
      this.blockClickedAt = currentTime;
      return false;
    }
  }

  /**
   * Glow: the category pool, kept in runtime.extensionStorage so that it is saved
   * into project.json and comes back with the project. Read through here rather
   * than cached, because the storage is replaced wholesale when a project loads.
   * @return {string[]} - the categories this project knows about
   */
  get categories() {
    const stored = this.runtime.extensionStorage[GlowMLBlocks.EXTENSION_ID];
    if (!stored || !Array.isArray(stored.categories) || stored.categories.length === 0) {
      // Deleting the last category brings the defaults back rather than leaving a
      // dropdown with nothing in it.
      return sortCategories(DEFAULT_CATEGORIES.slice());
    }
    // Anything that has been trained belongs in the pool even if the stored
    // list has fallen behind, so a dropdown never hides a category that exists.
    const trained = this.counts ? Object.keys(this.counts) : [];
    return sortCategories(stored.categories.concat(trained.filter(category => !stored.categories.includes(category))));
  }

  set categories(categories) {
    const stored = this.runtime.extensionStorage[GlowMLBlocks.EXTENSION_ID] || {};
    stored.categories = categories;
    this.runtime.extensionStorage[GlowMLBlocks.EXTENSION_ID] = stored;
  }

  /**
   * Palette button. Scratch's own 'new message' lives inside the dropdown, but
   * scratch-blocks gives extensions no hook on dropdown selection, so this
   * follows the 'Make a Variable' pattern instead. The menus below are dynamic,
   * so a new category shows up in all of them straight away.
   */
  createCategory() {
    const name = prompt(Message.new_category_prompt[this.locale], '');
    if (name === null) {
      return;
    }
    const category = name.trim();
    if (category === '' || category === ALL || category === ANY) {
      return;
    }
    if (this.categories.includes(category)) {
      alert(Message.category_exists[this.locale]);
      return;
    }
    this.categories = this.categories.concat([category]);
  }

  /**
   * @return {object[]} - one menu item per category
   */
  getCategoryItems() {
    return this.categories.map(category => ({ text: category, value: category }));
  }

  getTrainMenu() {
    return this.getCategoryItems();
  }

  getReceivedMenu() {
    return [{ text: Message.any[this.locale], value: ANY }].concat(this.getCategoryItems());
  }

  getResetMenu() {
    return [{ text: Message.all[this.locale], value: ALL }].concat(this.getCategoryItems());
  }

  getDeleteMenu() {
    // 'all' last here, unlike the other menus: a block dragged out of the
    // palette takes the first item as its default, and that must not be the
    // one that wipes everything.
    return this.getCategoryItems().concat([{ text: Message.all[this.locale], value: ALL }]);
  }

  getCountMenu() {
    return this.getResetMenu();
  }

  getVideoMenu() {
    return [
      {
        text: Message.off[this.locale],
        value: 'off'
      },
      {
        text: Message.on[this.locale],
        value: 'on'
      },
      {
        text: Message.video_on_flipped[this.locale],
        value: 'on-flipped'
      }
    ]
  }

  getInputMenu() {
    return [
      {
        text: Message.webcam[this.locale],
        value: 'webcam'
      },
      {
        text: Message.stage[this.locale],
        value: 'stage'
      }
    ]
  }

  getClassificationIntervalMenu() {
    return [
      {
        text: '1',
        value: '1'
      },
      {
        text: '0.5',
        value: '0.5'
      },
      {
        text: '0.2',
        value: '0.2'
      },
      {
        text: '0.1',
        value: '0.1'
      }
    ]
  }

  getClassificationMenu() {
    return [
      {
        text: Message.off[this.locale],
        value: 'off'
      },
      {
        text: Message.on[this.locale],
        value: 'on'
      }
    ]
  }

  /**
   * Glow: whether the camera is actually delivering frames right now.
   *
   * VideoProvider.videoReady covers a camera that never started - refused at the
   * prompt, or absent from the machine. It does not notice a permission revoked
   * mid-session: the track ends but the video element keeps its last dimensions,
   * so readyState is the only reliable signal for that.
   * @return {boolean} - whether the camera is usable
   */
  hasWorkingCamera() {
    const video = this.runtime.ioDevices.video;
    if (!video || !video.provider || !video.videoReady) {
      return false;
    }
    const track = video.provider._track;
    return !track || track.readyState !== 'ended';
  }

  /**
   * Glow: 'Learn/Classify [stage] image' works with no camera at all, so a
   * missing camera is only a problem when the stage is not the input.
   * @return {boolean} - whether the stage is the current input
   */
  usingStageInput() {
    return Boolean(this.canvas) && this.input === this.canvas;
  }

  /**
   * Glow: build a block's name the way it reads in the palette, for messages
   * that need to say which block stopped.
   * @param {string} key - a key of Message holding the block's text
   * @param {object} [values] - placeholder values, e.g. {CATEGORY: 'cat'}
   * @return {string} - the block text, quoted
   */
  blockName(key, values) {
    let text = Message[key][this.locale];
    for (const placeholder of Object.keys(values || {})) {
      text = text.replace(`[${placeholder}]`, `[${values[placeholder]}]`);
    }
    return `"${text}"`;
  }

  /**
   * Glow: the single place that decides whether there is a picture to work with,
   * and what to tell someone when there is not.
   * @param {string} block - the block name, from blockName()
   * @param {object} [util] - block utility, for the speech bubble
   * @return {boolean} - whether there is something to look at
   */
  checkCamera(block, util) {
    if (this.usingStageInput()) {
      return true;
    }
    if (this.hasWorkingCamera() && this.input) {
      return true;
    }
    this.reportProblem(Message.no_input[this.locale]
      .replace('[BLOCK]', block)
      .replace('[INPUT]', Message.set_input[this.locale].replace('[INPUT]', Message.stage[this.locale])), util);
    return false;
  }

  /**
   * Glow: there is no point inferring without a picture. ml5 would take the null
   * video, read '.elt' off it and throw, and the old catch-all reported that as
   * a broken MobileNet - which is exactly what a pupil who refused the camera
   * used to be told.
   * @param {object} [util] - block utility, for the speech bubble
   * @return {boolean} - whether there is something to learn from
   */
  checkInputReady(args, util) {
    return this.checkCamera(this.blockName('train', {CATEGORY: args.CATEGORY}), util);
  }

  /**
   * Glow: refuse to keep training once the caps are reached, and say why once.
   * Checked before infer() so that a 'forever [train]' loop costs nothing at all
   * from here on rather than continuing to burn a frame per iteration.
   * @param {string} category - the category about to be trained
   * @return {boolean} - whether training may go ahead
   */
  checkExampleLimits(category, util) {
    const counts = this.counts || {};
    const forCategory = counts[category] || 0;
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    // Name the block as it reads in the palette, so the message points at the
    // script that stopped rather than at the extension in the abstract. The
    // value keeps its brackets, or a category called 'category A' would render as
    // "train category category A".
    const block = `"${Message.train[this.locale].replace('[CATEGORY]', `[${category}]`)}"`;

    if (forCategory >= MAX_EXAMPLES_PER_CATEGORY) {
      this.reportProblem(Message.max_examples_per_category[this.locale]
        .replace('[BLOCK]', block)
        .replace(/\[CATEGORY\]/g, category)
        .replace('[N]', MAX_EXAMPLES_PER_CATEGORY), util);
      return false;
    }
    if (total >= MAX_EXAMPLES_TOTAL) {
      this.reportProblem(Message.max_examples_total[this.locale]
        .replace('[BLOCK]', block)
        .replace(/\[CATEGORY\]/g, category)
        .replace('[N]', MAX_EXAMPLES_TOTAL)
        .replace('[COUNTS]', this.getCategoriesAndCounts()), util);
      return false;
    }
    return true;
  }

  /**
   * Glow: put a message in a speech bubble, the way glow-midi reports a missing
   * device. Prefers the sprite whose block ran, so the bubble appears where the
   * pupil was looking.
   * @param {string} message - what to say
   * @param {object} [util] - block utility, when a block is what raised this
   */
  sayOnTarget(message, util) {
    // scratch3_looks drops a bubble whose target is hidden, so pick something
    // that can actually show it: the sprite that ran the block, then whatever is
    // being edited, then the stage.
    const candidates = [
      util && util.target,
      this.runtime.getEditingTarget(),
      this.runtime.getTargetForStage()
    ];
    const target = candidates.find(candidate => candidate && candidate.visible) ||
      this.runtime.getTargetForStage();
    if (!target || !this.runtime.emit) {
      return;
    }
    this.emitSay(target, String(message));
    // Take it down again once there has been time to read it. A bubble that
    // never expires covers the sprite and outlives the problem it describes,
    // and a pupil who fixes the camera is left staring at a stale complaint.
    this.sayTimer = setTimeout(() => {
      this.sayTimer = null;
      this.emitSay(target, '');
    }, bubbleDuration(message));
  }

  /**
   * Glow: put text in this target's bubble, or clear it when the text is empty,
   * cancelling whatever timer the previous bubble had. Emitting SAY is how the
   * looks blocks themselves do it, so scratch3_looks handles rendering and the
   * empty string removal for us.
   * @param {object} target - whose bubble
   * @param {string} text - what to show, '' to clear
   */
  emitSay(target, text) {
    if (this.sayTimer) {
      clearTimeout(this.sayTimer);
      this.sayTimer = null;
    }
    this.sayTarget = text === '' ? null : target;
    this.emittingSay = true;
    try {
      this.runtime.emit('SAY', target, 'say', text);
    } finally {
      this.emittingSay = false;
    }
  }

  /**
   * Glow: give up ownership of the bubble without touching what is on screen,
   * for when somebody else's message has replaced ours.
   */
  forgetBubble() {
    if (this.sayTimer) {
      clearTimeout(this.sayTimer);
      this.sayTimer = null;
    }
    this.sayTarget = null;
  }

  /**
   * Glow: report a problem once, however many scripts run into it.
   *
   * A 'forever' loop hits a limit thousands of times a minute, and several loops
   * can hit *different* limits, so the set holds everything already said - an
   * earlier version remembered only the last message, and two scripts alternating
   * between two messages re-alerted on every single frame.
   *
   * Only the first message opens a modal. A second modal is not a warning any
   * more, it is an obstacle: the scripts keep running behind it and the pupil
   * cannot reach the stop button. Everything after the first goes to a speech
   * bubble instead, which is visible without blocking anything.
   * @param {string} message - what to report
   * @param {object} [util] - block utility, when a block is what raised this
   */
  reportProblem(message, util) {
    if (!this.reportedProblems.has(message)) {
      this.reportedProblems.add(message);
      console.warn(`Glow ML: ${message}`);
      if (this.reportedProblems.size === 1) {
        // The very first problem gets a modal, which is the only one anybody
        // reads. Everything after it, including repeats of this one, is a bubble.
        alert(message);
        return;
      }
    }
    const now = Date.now();
    if (now - this.lastSayAt < SAY_THROTTLE_MS) {
      return;
    }
    this.lastSayAt = now;
    this.sayOnTarget(message, util);
  }

  /**
   * Glow: ml5's save() serialises the classifier and downloads it in one step,
   * so this repeats only the serialising half. The shape is identical to the
   * file the download block produces, which keeps the two interchangeable, and
   * matches what knnClassifier.load() expects back.
   *
   * It reads knnClassifier.mapStringToIndex, which is ml5 internals rather than
   * public API. ml5 is vendored at a pinned 0.12.2, so this cannot drift under
   * us without someone deliberately updating that file.
   * @return {string|null} - the serialised data, or null if nothing is trained
   */
  serializeTrainingData() {
    const dataset = this.knnClassifier.getClassifierDataset();
    if (Object.keys(dataset).length === 0) {
      return null;
    }
    const mapStringToIndex = this.knnClassifier.mapStringToIndex;
    if (mapStringToIndex && mapStringToIndex.length > 0) {
      Object.keys(dataset).forEach(key => {
        if (mapStringToIndex[key]) {
          dataset[key].label = mapStringToIndex[key];
        }
      });
    }
    const tensors = Object.keys(dataset).map(key => (dataset[key] ? dataset[key].dataSync() : null));
    return JSON.stringify({ dataset, tensors });
  }

  /**
   * Glow: write the current training data into the project.
   */
  saveToProject() {
    if (!this.assetManager) {
      return;
    }
    const exampleCount = Object.values(this.counts || {}).reduce((sum, count) => sum + count, 0);
    if (this.saveRefusedAtExamples !== null && exampleCount >= this.saveRefusedAtExamples) {
      // A previous save was refused at this size. Serialising again would build
      // megabytes of JSON only to be told the same thing, which is what made a
      // runaway loop lock the tab up for twenty seconds at a time.
      return;
    }
    const json = this.serializeTrainingData();
    if (json === null) {
      // Nothing trained: take the entry out rather than storing an empty one.
      if (this.assetManager.delete(ASSET_OWNER, ASSET_NAME)) {
        this.runtime.emitProjectChanged();
      }
      return;
    }
    const encoded = new TextEncoder().encode(json);
    try {
      this.assetManager.set(ASSET_OWNER, ASSET_NAME, 'json', encoded);
      // Otherwise the editor has no idea there is anything new to save.
      this.runtime.emitProjectChanged();
      this.warnedAboutSize = false;
      this.saveRefusedAtExamples = null;
    } catch (error) {
      // Over the manager's ceiling. The data stays in memory and still works for
      // this session; it just will not be saved with the project. Remember the
      // size so we do not pay to serialise it again until something is removed.
      this.saveRefusedAtExamples = exampleCount;
      console.error('Glow ML: could not store the training data in the project.', error);
      if (!this.warnedAboutSize) {
        this.warnedAboutSize = true;
        this.reportProblem(Message.too_much_data[this.locale]
          .replace('[SIZE]', formatBytes(error.totalBytes || encoded.length))
          .replace('[LIMIT]', formatBytes(error.maxBytes || this.assetManager.maxBytes)));
      }
    }
  }

  /**
   * Glow: training changes come in bursts - a pupil clicking train repeatedly -
   * and serialising a megabyte of feature vectors each time would be felt. Wait
   * for the burst to end.
   */
  scheduleSave() {
    if (!this.assetManager) {
      return;
    }
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToProject();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Glow: read back whatever the open project stored. A project holding nothing
   * means an empty classifier, not whatever the previous project left behind.
   */
  loadFromProject() {
    if (!this.assetManager) {
      return;
    }
    const asset = this.assetManager.get(ASSET_OWNER, ASSET_NAME);
    if (!asset) {
      this.knnClassifier.clearAllLabels();
      this.counts = null;
      this.category = null;
      this.confidence = 0;
      this.reportedProblems.clear();
      this.saveRefusedAtExamples = null;
      return;
    }
    try {
      const data = JSON.parse(new TextDecoder().decode(asset.data));
      this.knnClassifier.load(data, () => {
        this.updateCounts();
      });
    } catch (error) {
      console.error('Glow ML: the training data stored in this project could not be read.', error);
    }
  }

  /**
   * Glow: say once, loudly, that the model is unusable, and stop the classify
   * loop so it cannot keep throwing.
   * @param {Error} error - what went wrong
   */
  reportBrokenModel(error) {
    if (this.modelBroken) {
      return;
    }
    // Stop everything first, synchronously, so nothing keeps throwing while the
    // diagnosis below runs.
    this.modelBroken = true;
    this.modelReady = false;
    this.training = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.error('Glow ML: MobileNet failed to load.', error);

    const message = Message.model_broken[this.locale];
    if (!mobilenetOptions.mobilenetURL) {
      this.reportProblem(message);
      return;
    }
    diagnoseModelFiles().then(problems => {
      if (problems.length === 0) {
        this.reportProblem(message);
        return;
      }
      const detail = problems.slice(0, 5).join('\n');
      const more = problems.length > 5 ? `\n... and ${problems.length - 5} more` : '';
      console.error(`Glow ML: these vendored model files are missing or wrong:\n${detail}${more}`);
      this.reportProblem(
        `${message}\n\n${detail}${more}\n\n` +
        'Run `node scripts/glow-fetch-mobilenet.mjs`, then restart the dev server ' +
        '(copy-webpack-plugin only picks up files that exist when it starts).'
      );
    });
  }

  /**
   * @return {boolean} - whether infer() can be called
   */
  checkModelReady() {
    if (this.modelReady) {
      return true;
    }
    if (!this.modelBroken) {
      // Still loading. Say nothing: the block was pressed early, that is all.
      return false;
    }
    return false;
  }

  setLocale() {
    let locale = formatMessage.setup().locale;
    if (AvailableLocales.includes(locale)) {
      return locale;
    } else {
      return 'en';
    }
  }

  switchCamera(args, util) {
    // Glow: with no camera permission, enumerateDevices() reports no labels and
    // no ids, so the menu holds only the empty 'default' entry and picking it
    // used to do nothing at all, silently.
    if (args.DEVICE === '' || !this.hasWorkingCamera()) {
      this.reportProblem(Message.no_cameras[this.locale]
        .replace('[BLOCK]', this.blockName('switch_webcam', {DEVICE: this.deviceName(args.DEVICE)})),
      util);
      return;
    }
    if (args.DEVICE !== '') {
      if (this.runtime.ioDevices.video.provider._track !== null) {
        this.runtime.ioDevices.video.provider._track.stop();
        const deviceId = args.DEVICE;
        navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId } }).then(
          stream => {
            try {
              this.runtime.ioDevices.video.provider._video.srcObject = stream;
            } catch (error) {
              this.runtime.ioDevices.video.provider._video.src = window.URL.createObjectURL(stream);
            }
            // Needed for Safari/Firefox, Chrome auto-plays.
            this.runtime.ioDevices.video.provider._video.play();
            this.runtime.ioDevices.video.provider._track = stream.getTracks()[0];
          }
        );
      }
    }
  }

  getDevices() {
    return this.devices;
  }

  /**
   * Glow: the name of a camera as the dropdown shows it. The block stores the
   * deviceId, which is 64 hex characters and means nothing to a pupil, so a
   * message about the block has to look the name back up.
   *
   * The name can be missing either way round: with no camera permission
   * enumerateDevices() reports devices with empty labels, and a project saved on
   * another machine names a camera this one has never seen. Both get a generic
   * phrase rather than the raw id.
   * @param {string} value - the deviceId the block holds, '' for the default
   * @returns {string} something readable
   */
  deviceName(value) {
    const device = this.devices.find(candidate => candidate.value === value);
    if (device && device.text) {
      return device.text;
    }
    return Message.unnamed_camera[this.locale];
  }
}

// Glow: upstream ends with CommonJS exports, because it is built either into
// scratch-vm or into an Xcratch module. Here the file is served as a plain
// script from our own origin, so ml5 is pulled in first and the extension then
// registers itself through the TurboWarp unsandboxed extension API.
const loadScript = url => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = url;
  script.onload = () => resolve(window.ml5);
  script.onerror = () => reject(new Error(`Glow ML: could not load ml5 from ${url}`));
  document.head.appendChild(script);
});

const loadMl5 = () => {
  if (typeof window.ml5 !== 'undefined') {
    return Promise.resolve(window.ml5);
  }
  return loadScript(ML5_LOCAL_URL).catch(() => {
    console.warn(`Glow ML: no self-hosted ml5 at ${ML5_LOCAL_URL}, falling back to ${ML5_CDN_URL}`);
    return loadScript(ML5_CDN_URL);
  });
};

/**
 * Whether a vendored model manifest is really there. A HEAD request is not
 * enough: webpack-dev-server's historyApiFallback answers plenty of misses with
 * index.html and a 200, and a 404 page is still a body tfjs will try to decode.
 * So fetch it and insist it parses as a tfjs manifest.
 * @param {string} url - a model.json on our own origin
 * @returns {Promise<boolean>} - whether it is a real manifest
 */
/**
 * Run a callback after the browser has painted. requestAnimationFrame alone
 * fires *before* the paint, so blocking work started there still hides the
 * frame we wanted to show.
 * @param {Function} callback - what to run once the frame is on screen
 */
const afterPaint = callback => {
  // requestAnimationFrame does not fire in a background tab, and a pupil who
  // switches tabs mid-training must not be left with a block glowing forever on
  // a promise that never settles. Whichever path arrives first wins.
  let done = false;
  const once = () => {
    if (done) {
      return;
    }
    done = true;
    callback();
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => setTimeout(once, 0));
  }
  setTimeout(once, 250);
};

const BYTES_PER_DTYPE = {
  float32: 4, int32: 4, complex64: 8, float16: 2, uint16: 2, uint8: 1, bool: 1
};

/**
 * @param {object} group - one weightsManifest entry
 * @return {number} - how many bytes its shard should be
 */
const groupBytes = group => group.weights.reduce((total, weight) => {
  const elements = weight.shape.reduce((a, b) => a * b, 1);
  return total + (elements * (BYTES_PER_DTYPE[weight.dtype] || 4));
}, 0);

/**
 * Glow: work out what is actually wrong with the vendored models. tfjs reports
 * a missing or truncated weight shard as 'byte length of Float32Array should be
 * a multiple of 4', many frames away from the file that caused it, so name the
 * file instead. Only runs after a failure, so the cost does not matter.
 * @return {Promise<string[]>} - one line per problem, empty if the files are fine
 */
const diagnoseModelFiles = async () => {
  const problems = [];
  for (const manifestURL of [MOBILENET_LOCAL_URL, MOBILENET_GRAPH_LOCAL_URL]) {
    const directory = manifestURL.slice(0, manifestURL.lastIndexOf('/') + 1);
    let manifest;
    try {
      const response = await fetch(manifestURL);
      if (!response.ok) {
        problems.push(`${manifestURL} -> HTTP ${response.status}`);
        continue;
      }
      manifest = await response.json();
    } catch (error) {
      problems.push(`${manifestURL} -> ${error.message}`);
      continue;
    }
    for (const group of manifest.weightsManifest || []) {
      const expected = groupBytes(group);
      for (const shard of group.paths) {
        try {
          const response = await fetch(directory + shard);
          if (!response.ok) {
            problems.push(`${directory}${shard} -> HTTP ${response.status}`);
            continue;
          }
          const actual = (await response.arrayBuffer()).byteLength;
          if (actual !== expected) {
            problems.push(`${directory}${shard} -> ${actual} bytes, expected ${expected}`);
          }
        } catch (error) {
          problems.push(`${directory}${shard} -> ${error.message}`);
        }
      }
    }
  }
  return problems;
};

const isModelManifest = url => fetch(url)
  .then(response => (response.ok ? response.json() : null))
  .then(json => Boolean(json && Array.isArray(json.weightsManifest)))
  .catch(() => false);

/**
 * Use the vendored MobileNet only if both halves of it are present; a
 * half-vendored model would fail at load with a much less obvious error than
 * this warning.
 * @returns {Promise<void>}
 */
const resolveMobilenet = () => Promise.all([
  isModelManifest(MOBILENET_LOCAL_URL),
  isModelManifest(MOBILENET_GRAPH_LOCAL_URL)
]).then(([hasLayers, hasGraph]) => {
  if (hasLayers && hasGraph) {
    mobilenetOptions = {
      mobilenetURL: MOBILENET_LOCAL_URL,
      graphModelURL: MOBILENET_GRAPH_LOCAL_URL
    };
    return;
  }
  console.warn(
    'Glow ML: MobileNet is not vendored (layers manifest: ' + hasLayers +
    ', graph manifest: ' + hasGraph + '), so ml5 will download it from ' +
    'storage.googleapis.com and tfhub.dev. Run ' +
    '`node scripts/glow-fetch-mobilenet.mjs` to vendor it. See GLOW-NOTES.md.'
  );
});

loadMl5().then(loaded => {
  ml5 = loaded;
  return resolveMobilenet();
}).then(() => {
  Scratch.extensions.register(new GlowMLBlocks(Scratch.vm.runtime));
}).catch(error => {
  // The extension manager has no way to hear about this: it is waiting for a
  // register() call that will never come, so it would otherwise hang silently.
  // Say out loud what went wrong instead.
  console.error(error);
  alert(`Glow ML could not start because ml5.js did not load.\n\nCheck the internet connection and add the extension again.\n\n${error.message}`);
});
