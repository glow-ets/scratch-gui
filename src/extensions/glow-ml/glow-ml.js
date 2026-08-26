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
 * Glow: labels a fresh project starts with, so the dropdowns are never empty.
 * The pool behaves like Scratch's broadcast messages, except that a label is
 * never removed just because nothing uses it any more.
 */
const DEFAULT_LABELS = ['label A', 'label B'];

/** Menu value meaning 'every label', used by reset, delete and counts. */
const ALL = 'all';

/** Menu value meaning 'whichever label was recognised', used by when received. */
const ANY = 'any';

// Glow: the same artwork as the library inset icon, so the palette, the
// blocks and the library card all read as one extension. Upstream's icon is
// green, which clashed with the pink blocks.
const blockIconURI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAFOUlEQVR4Xu2az4oUSRDGo6rHVZQRvCzKIANCy6JP4BsIzjyBIIuCiHgVxbsiwt5FELz4BKPgyYOXfYJd/LM0LIsoHjyMIDJ2VRlfVsVMdk11T3ZGVXePGzm0U2NXZGX+8ouMzMhKhvS5ICvRBNJoSzN0BAygUggG0AAqCSjNTYEGUElAaW4KNIBKAkpzU6ABVBJQmpsCDaCSgNLcFGgAlQSU5qZAA6gkoDQ3BRpAJQGluSnQACoJKM1NgUqAS7H2T+hprOnC2P1OF9VtSWKONT/e36Rfb56khAr+If69f4o7wy343zSlTw/+o+O3j6oaPzVAKO9Sfp0OJD+B9z8bUrb+RQUwikJS5O6hWZ5TzqO5nz4Ftzer2o8+aKeiqDmwqJw2TRJK+LPfStLiuxhxCqyItdiO/TYG2+2NUuCk3iKsYI6GLgEYKg0pmAb8OycpG27oYgECGBuxH4Q8opN7WgVYRmS4ddlW6VZIpA4F7eqtHjBN/Z3Q40pbAwjlOSVwZHv351vX3v6505Rd6FEvRIVsN1LWltwiyVfXuGckDfd2Baxeb2sA0VEo7Z8K3ql7JyijL9TbWCbiDsJF6ypDFO/xegzQ/eXE4M4H6tNpAhixE3Xj3sfrD7f78Ype0pXixtzcOCqI1EdBgslWNiSAw0cK1LhVZA6eH3Qwjzl4XESxYuPby//JvNekrK1qWTKPoNYKQOkUPLW+rgKMX56XXcu99VcuOFlRTcBm5YLa7VyrAMd1GgrL+Mse715clOYfXDepbxbgZCop1nh+5ikGW9PYBfVMAEJhvSpI5DmrUXxtzupzAYrn2ZVbq3T+/nrU2M0EoCgNG8BempC4b33ui+qB0ki2dStnV6JqmhlAqDD9FwiT0n35ep5zn9BKlYvwmQF0Knz0miNymYjA9SIUbeRubR0YAgOKG1AJbhHUF9Lmve6ZKcCfCdzOFLAXYvt+IoGZzoGLOBbaPM7/HiD22prS+RyIxICUeuCQ7w4fPaI63HH7ZJbS9n65JqtJ+ULZj7//6z0dp+kPmDoHiJQWVvvYyg3o713Rt3/3DH3LMxpsvomOzEtpz43RuJxiPRPkp8Vg5+BFns51CrBMS3E6iwu62L/6G72rljG47q8eoyHDO1QBiHUlt01E6osrqM9p+LsO1gm2uhFptBjlSVs7BehcdqN8lFPBakpQnBS4nKgnFh7s/PxgUz1XNq45wHhe/agAiYRY9TnVaxpet500H6PhgIhO4OMm75BMtbKBSBIA8JB3QGhDPa+ogdcaQHEbmZClz34AQQrGuVL1cUeifOOkRKnPLpb1i9ulC/i5SL/e2DRW6y7s3JGTBBjxwWYZeRFdnet4Zxvj1l2414/KK2vHXB07B0hlRhtpfrjkXm7rQ3IunO64cOighYi/tTlQOorcWr1MWkY4t2IDsauf4I0cdUrFDPEyn4OIW448z6sAoPxXULp4CaA1gNIJf6JuOkhqGlVxZXTQvx6nAHlG4/s5o4fLroqm4BGirpB7ogCW72Q1l1JR5ffTnvXKcfleSvGfsasVuw6hu339JAqgJCFdRMUI13ohItg+OAoZSsxv1X0hdhP3sCMN4ojvPR92oZ4R0uypX29DpV+/H6blpYMh9S/2PS283halwM0/PtJy5BnCIhGN3f/6fYhS4CJBmHdbWt2JzLsz83i+AVRSN4AGUElAaW4KNIBKAkpzU6ABVBJQmpsCDaCSgNLcFGgAlQSU5qZAA6gkoDQ3BRpAJQGluSnQACoJKM1NgQZQSUBpbgo0gEoCSvMfVmgck4O62jUAAAAASUVORK5CYII=';

const Message = {
  train: {
    'ja': 'ラベル[LABEL]を学習する',
    'ja-Hira': 'ラベル[LABEL]をがくしゅうする',
    'en': 'train label [LABEL]',
    'it': 'addestra etichetta [LABEL]',
    'zh-cn': '学习标签[LABEL]',
    'zh-tw': '學習標籤[LABEL]'
  },
  when_received_block: {
    'ja': 'ラベル[LABEL]を受け取ったとき',
    'ja-Hira': 'ラベル[LABEL]をうけとったとき',
    'en': 'when received label [LABEL]',
    'it': 'quando ricevo etichetta [LABEL]',
    'zh-cn': '接收到类别[LABEL]时',
    'zh-tw': '接收到類別[LABEL]時'
  },
  label_block: {
    'ja': 'ラベル',
    'ja-Hira': 'ラベル',
    'en': 'label',
    'it': 'etichetta',
    'zh-cn': '标签',
    'zh-tw': '標籤'
  },
  confidence_block: {
    'ja': '確信度',
    'ja-Hira': 'かくしんど',
    'en': 'confidence',
    'it': 'confidenza',
    'zh-cn': '置信度',
    'zh-tw': '信心度'
  },
  labels_and_counts_block: {
    'ja': 'ラベルと枚数',
    'ja-Hira': 'ラベルとまいすう',
    'en': 'labels and counts',
    'it': 'etichette e conteggi',
    'zh-cn': '标签和数量',
    'zh-tw': '標籤和數量'
  },
  counts_label: {
    'ja': 'ラベル[LABEL]の枚数',
    'ja-Hira': 'ラベル[LABEL]のまいすう',
    'en': 'counts of label [LABEL]',
    'it': 'conteggio etichetta [LABEL]',
    'zh-cn': '标签数量[LABEL]',
    'zh-tw': '標籤數量[LABEL]'
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
  new_label_button: {
    'ja': '新しいラベルを作る',
    'ja-Hira': 'あたらしいラベルをつくる',
    'en': 'New label',
    'it': 'Nuova etichetta',
    'zh-cn': '新建标签',
    'zh-tw': '新增標籤'
  },
  new_label_prompt: {
    'ja': '新しいラベルの名前は？',
    'ja-Hira': 'あたらしいラベルのなまえは？',
    'en': 'Name of the new label?',
    'it': 'Nome della nuova etichetta?',
    'zh-cn': '新标签的名称？',
    'zh-tw': '新標籤的名稱？'
  },
  label_exists: {
    'ja': 'そのラベルはすでにあります。',
    'ja-Hira': 'そのラベルはすでにあります。',
    'en': 'That label already exists.',
    'it': 'Questa etichetta esiste già.',
    'zh-cn': '该标签已存在。',
    'zh-tw': '該標籤已存在。'
  },
  delete_label: {
    'ja': 'ラベル[LABEL]を削除',
    'ja-Hira': 'ラベル[LABEL]をさくじょ',
    'en': 'delete label [LABEL]',
    'it': 'elimina etichetta [LABEL]',
    'zh-cn': '删除标签[LABEL]',
    'zh-tw': '刪除標籤[LABEL]'
  },
  confirm_delete_all: {
    'ja': '本当にすべてのラベルを削除してもよろしいですか？',
    'ja-Hira': 'ほんとうにすべてのラベルをさくじょしてもよろしいですか？',
    'en': 'Delete every label and everything it learned?',
    'it': 'Vuoi davvero eliminare tutte le etichette e quanto hanno imparato?',
    'zh-cn': '确定要删除所有标签及其学习内容吗？',
    'zh-tw': '確定要刪除所有標籤及其學習內容嗎？'
  },
  reset: {
    'ja': 'ラベル[LABEL]の学習をリセット',
    'ja-Hira': 'ラベル[LABEL]のがくしゅうをリセット',
    'en': 'reset label [LABEL]',
    'it': 'resetta etichetta [LABEL]',
    'zh-cn': '重置[LABEL]',
    'zh-tw': '重置[LABEL]'
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
    'ja': 'ラベル付けを[CLASSIFICATION_STATE]にする',
    'ja-Hira': 'ラベルづけを[CLASSIFICATION_STATE]にする',
    'en': 'turn classification [CLASSIFICATION_STATE]',
    'it': 'Imposta classificazione [CLASSIFICATION_STATE]',
    'zh-cn': '[CLASSIFICATION_STATE]分类',
    'zh-tw': '[CLASSIFICATION_STATE]分類'
  },
  set_classification_interval: {
    'ja': 'ラベル付けを[CLASSIFICATION_INTERVAL]秒間に1回行う',
    'ja-Hira': 'ラベルづけを[CLASSIFICATION_INTERVAL]びょうかんに1かいおこなう',
    'en': 'Label once every [CLASSIFICATION_INTERVAL] seconds',
    'it': 'Classifica una volta ogni [CLASSIFICATION_INTERVAL] secondi',
    'zh-cn': '每隔[CLASSIFICATION_INTERVAL]秒标记一次',
    'zh-tw': '每隔[CLASSIFICATION_INTERVAL]秒標記一次'
  },
  video_toggle: {
    'ja': 'ビデオを[VIDEO_STATE]にする',
    'ja-Hira': 'ビデオを[VIDEO_STATE]にする',
    'en': 'turn video [VIDEO_STATE]',
    'it': 'Imposta video [VIDEO_STATE]',
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
    'en': 'Learn/Classify [INPUT] image',
    'it': 'Addestra / classifica immagine da [INPUT]',
    'zh-cn': '学习/分类[INPUT]图像',
    'zh-tw': '學習/分類[INPUT]影像'
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
  first_training_warning: {
    'ja': '最初の学習にはしばらく時間がかかるので、何度もクリックしないで下さい。',
    'ja-Hira': 'さいしょのがくしゅうにはしばらくじかんがかかるので、なんどもクリックしないでください。',
    'en': 'The first training will take a while, so DO *NOT* CLICK AGAIN AND AGAIN !',
    'it': "Il primo addestramento ci metterà un po', perciò *NON* CLICCARE A RIPETIZIONE!!",
    'zh-cn': '第一项研究需要一段时间，所以不要一次又一次地点击。',
    'zh-tw': '第一次訓練需要一段時間，請稍後，不要一直點擊。'
  },
  switch_webcam: {
    'ja': 'カメラを[DEVICE]に切り替える',
    'ja-Hira': 'カメラを[DEVICE]にきりかえる',
    'en': 'switch webcam to [DEVICE]',
    'it': 'imposta webcam a [DEVICE]',
    'zh-cn': '网络摄像头切换到[DEVICE]',
    'zh-tw': '網路攝影機切換到[DEVICE]'
  }
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
    return 'glowMl';
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
    this.label = null;
    this.confidence = 0;
    this.locale = this.setLocale();

    this.blockClickedAt = null;

    this.counts = null;
    this.firstTraining = true;

    this.interval = 1000;
    this.globalVideoTransparency = 0;
    this.setVideoTransparency({
      TRANSPARENCY: this.globalVideoTransparency
    });

    this.canvas = document.querySelector('canvas');

    this.runtime.ioDevices.video.enableVideo().then(() => { this.input = this.runtime.ioDevices.video.provider.video });

    this.knnClassifier = ml5.KNNClassifier();
    this.featureExtractor = ml5.featureExtractor('MobileNet', () => {
      console.log('[featureExtractor] Model Loaded!');
      this.timer = setInterval(() => {
        this.classify();
      }, this.interval);
    });

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
          text: Message.new_label_button[this.locale],
          func: 'createLabel'
        },
        {
          opcode: 'train',
          text: Message.train[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              menu: 'train_menu'
            }
          }
        },
        {
          opcode: 'getLabel',
          text: Message.label_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'whenReceived',
          text: Message.when_received_block[this.locale],
          blockType: BlockType.HAT,
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              menu: 'received_menu'
            }
          }
        },
        {
          opcode: 'getConfidence',
          text: Message.confidence_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'getCountByLabel',
          text: Message.counts_label[this.locale],
          blockType: BlockType.REPORTER,
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              menu: 'count_menu'
            }
          }
        },
        {
          opcode: 'getLabelsAndCounts',
          text: Message.labels_and_counts_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'reset',
          blockType: BlockType.COMMAND,
          text: Message.reset[this.locale],
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              menu: 'reset_menu'
            }
          }
        },
        {
          opcode: 'deleteLabel',
          blockType: BlockType.COMMAND,
          text: Message.delete_label[this.locale],
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              menu: 'delete_menu'
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

  train(args) {
    this.firstTrainingWarning();
    let features = this.featureExtractor.infer(this.input);
    this.knnClassifier.addExample(features, args.LABEL);
    this.updateCounts();
  }

  getLabel() {
    return this.label;
  }

  /**
   * Glow: how sure the classifier is about the label it is currently reporting.
   * @return {number} - confidence of the current label, 0 to 1
   */
  getConfidence() {
    // Rounded, because a k-nearest-neighbour vote share reads as
    // 0.6666666666666666 on a stage monitor otherwise.
    return Math.round(this.confidence * 100) / 100;
  }

  whenReceived(args) {
    if (args.LABEL === ANY) {
      if (this.when_received) {
        setTimeout(() => {
          this.when_received = false;
        }, HAT_TIMEOUT);
        return true;
      }
      return false;
    } else {
      if (this.when_received_arr[args.LABEL]) {
        setTimeout(() => {
          this.when_received_arr[args.LABEL] = false;
        }, HAT_TIMEOUT);
        return true;
      }
      return false;
    }
  }

  getCountByLabel(args) {
    if (!this.counts) {
      return 0;
    }
    if (args.LABEL === ALL) {
      return Object.values(this.counts).reduce((total, count) => total + count, 0);
    }
    if (this.counts[args.LABEL]) {
      return this.counts[args.LABEL];
    } else {
      return 0;
    }
  }

  /**
   * Glow: Scratch has no list-valued reporter, so every label and its example
   * count go into one string, 'label:count' pairs separated by two spaces.
   * Labels with nothing trained yet are included, so the reporter doubles as a
   * view of the pool.
   * @return {string} - e.g. 'label A:12  label B:9'
   */
  getLabelsAndCounts() {
    return this.labels
      .map(label => `${label}:${(this.counts && this.counts[label]) || 0}`)
      .join('  ');
  }

  reset(args) {
    if (this.actionRepeated()) { return };

    setTimeout(() => {
      let result = confirm(Message.confirm_reset[this.locale]);
      if (result) {
        if (args.LABEL == ALL) {
          this.knnClassifier.clearAllLabels();
          for (let label in this.counts) {
            this.counts[label] = 0;
          }
        } else {
          // Glow: this.counts is null until something has been trained.
          if (this.counts && this.counts[args.LABEL] > 0) {
            this.knnClassifier.clearLabel(args.LABEL);
            this.counts[args.LABEL] = 0;
          }
        }
      }
    }, 1000);
  }

  /**
   * Glow: reset forgets what a label learned but keeps the label; delete takes
   * it out of the pool as well, so the dropdowns stop offering it.
   * @param {object} args - the block arguments
   * @param {string} args.LABEL - a label, or ALL
   */
  deleteLabel(args) {
    if (this.actionRepeated()) { return };

    setTimeout(() => {
      if (args.LABEL === ALL) {
        if (!confirm(Message.confirm_delete_all[this.locale])) {
          return;
        }
        this.knnClassifier.clearAllLabels();
        this.counts = null;
        this.labels = DEFAULT_LABELS.slice();
        return;
      }
      if (this.counts && this.counts[args.LABEL] > 0) {
        this.knnClassifier.clearLabel(args.LABEL);
        delete this.counts[args.LABEL];
      }
      this.labels = this.labels.filter(label => label !== args.LABEL);
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

  toggleClassification(args) {
    let state = args.CLASSIFICATION_STATE;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (state === 'on') {
      this.timer = setInterval(() => {
        this.classify();
      }, this.interval);
    }
  }

  setClassificationInterval(args) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.interval = args.CLASSIFICATION_INTERVAL * 1000;
    this.timer = setInterval(() => {
      this.classify();
    }, this.interval);
  }

  videoToggle(args) {
    let state = args.VIDEO_STATE;
    if (state === 'off') {
      this.runtime.ioDevices.video.disableVideo();
    } else {
      this.runtime.ioDevices.video.enableVideo().then(() => { this.input = this.runtime.ioDevices.video.provider.video });
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

  setInput(args) {
    let input = args.INPUT;
    if (input === 'webcam') {
      this.input = this.runtime.ioDevices.video.provider.video;
    } else {
      this.input = this.canvas;
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
    let numLabels = this.knnClassifier.getNumLabels();
    if (numLabels == 0) return;

    let features = this.featureExtractor.infer(this.input);
    this.knnClassifier.classify(features, (err, result) => {
      if (err) {
        console.error(err);
      } else {
        this.label = this.getTopConfidenceLabel(result.confidencesByLabel);
        this.confidence = result.confidencesByLabel[this.label] || 0;
        this.when_received = true;
        this.when_received_arr[this.label] = true
      }
    });
  }

  getTopConfidenceLabel(confidences) {
    let topConfidenceLabel;
    let topConfidence = 0;

    for (let label in confidences) {
      if (confidences[label] > topConfidence) {
        // Glow: upstream never advances topConfidence, so this returns the last
        // label with a non-zero confidence rather than the best one.
        topConfidence = confidences[label];
        topConfidenceLabel = label;
      }
    }

    return topConfidenceLabel;
  }

  updateCounts() {
    this.counts = this.knnClassifier.getCountByLabel();
    console.debug(this.counts);
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
   * Glow: the label pool, kept in runtime.extensionStorage so that it is saved
   * into project.json and comes back with the project. Read through here rather
   * than cached, because the storage is replaced wholesale when a project loads.
   * @return {string[]} - the labels this project knows about
   */
  get labels() {
    const stored = this.runtime.extensionStorage[GlowMLBlocks.EXTENSION_ID];
    if (!stored || !Array.isArray(stored.labels) || stored.labels.length === 0) {
      // Deleting the last label brings the defaults back rather than leaving a
      // dropdown with nothing in it.
      return DEFAULT_LABELS.slice();
    }
    // Anything that has been trained belongs in the pool even if the stored
    // list has fallen behind, so a dropdown never hides a label that exists.
    const trained = this.counts ? Object.keys(this.counts) : [];
    return stored.labels.concat(trained.filter(label => !stored.labels.includes(label)));
  }

  set labels(labels) {
    const stored = this.runtime.extensionStorage[GlowMLBlocks.EXTENSION_ID] || {};
    stored.labels = labels;
    this.runtime.extensionStorage[GlowMLBlocks.EXTENSION_ID] = stored;
  }

  /**
   * Palette button. Scratch's own 'new message' lives inside the dropdown, but
   * scratch-blocks gives extensions no hook on dropdown selection, so this
   * follows the 'Make a Variable' pattern instead. The menus below are dynamic,
   * so a new label shows up in all of them straight away.
   */
  createLabel() {
    const name = prompt(Message.new_label_prompt[this.locale], '');
    if (name === null) {
      return;
    }
    const label = name.trim();
    if (label === '' || label === ALL || label === ANY) {
      return;
    }
    if (this.labels.includes(label)) {
      alert(Message.label_exists[this.locale]);
      return;
    }
    this.labels = this.labels.concat([label]);
  }

  /**
   * @return {object[]} - one menu item per label
   */
  getLabelItems() {
    return this.labels.map(label => ({ text: label, value: label }));
  }

  getTrainMenu() {
    return this.getLabelItems();
  }

  getReceivedMenu() {
    return [{ text: Message.any[this.locale], value: ANY }].concat(this.getLabelItems());
  }

  getResetMenu() {
    return [{ text: Message.all[this.locale], value: ALL }].concat(this.getLabelItems());
  }

  getDeleteMenu() {
    // 'all' last here, unlike the other menus: a block dragged out of the
    // palette takes the first item as its default, and that must not be the
    // one that wipes everything.
    return this.getLabelItems().concat([{ text: Message.all[this.locale], value: ALL }]);
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

  firstTrainingWarning() {
    if (this.firstTraining) {
      alert(Message.first_training_warning[this.locale]);
      this.firstTraining = false;
    }
  }

  setLocale() {
    let locale = formatMessage.setup().locale;
    if (AvailableLocales.includes(locale)) {
      return locale;
    } else {
      return 'en';
    }
  }

  switchCamera(args) {
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

loadMl5().then(loaded => {
  ml5 = loaded;
  Scratch.extensions.register(new GlowMLBlocks(Scratch.vm.runtime));
}).catch(error => {
  // The extension manager has no way to hear about this: it is waiting for a
  // register() call that will never come, so it would otherwise hang silently.
  // Say out loud what went wrong instead.
  console.error(error);
  alert(`Glow ML could not start because ml5.js did not load.\n\nCheck the internet connection and add the extension again.\n\n${error.message}`);
});
