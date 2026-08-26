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

const ML5_URL = 'https://unpkg.com/ml5@0.12.2/dist/ml5.min.js';

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

const blockIconURI = 'data:image/png;base64,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';

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
  labels_block: {
    'ja': 'ラベルのリスト',
    'ja-Hira': 'ラベルのリスト',
    'en': 'labels',
    'it': 'etichette',
    'zh-cn': '标签列表',
    'zh-tw': '標籤列表'
  },
  counts_block: {
    'ja': '枚数のリスト',
    'ja-Hira': 'まいすうのリスト',
    'en': 'counts',
    'it': 'conteggi',
    'zh-cn': '数量列表',
    'zh-tw': '數量列表'
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
    return 'Glow Machine Learning';
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
      color1: '#fc00ee',
      color2: '#c900be',
      color3: '#9c0093',
      blocks: [
        {
          opcode: 'trainAny',
          text: Message.train[this.locale],
          blockType: BlockType.COMMAND,
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              defaultValue: ''
            }
          }
        },
        {
          opcode: 'getLabel',
          text: Message.label_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'whenReceivedAny',
          text: Message.when_received_block[this.locale],
          blockType: BlockType.HAT,
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              defaultValue: ''
            }
          }
        },
        {
          opcode: 'getCountByLabel',
          text: Message.counts_label[this.locale],
          blockType: BlockType.REPORTER,
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              defaultValue: ''
            }
          }
        },
        {
          opcode: 'getLabels',
          text: Message.labels_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'getCounts',
          text: Message.counts_block[this.locale],
          blockType: BlockType.REPORTER
        },
        {
          opcode: 'reset',
          blockType: BlockType.COMMAND,
          text: Message.reset[this.locale],
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              menu: 'reset_menu',
              defaultValue: 'all'
            }
          }
        },
        {
          opcode: 'resetAny',
          blockType: BlockType.COMMAND,
          text: Message.reset[this.locale],
          arguments: {
            LABEL: {
              type: ArgumentType.STRING,
              defaultValue: '11'
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
        reset_menu: {
          items: this.getMenu('reset')
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

  trainAny(args) {
    this.train(args);
  }

  getLabel() {
    return this.label;
  }

  whenReceived(args) {
    if (args.LABEL === 'any') {
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

  whenReceivedAny(args) {
    if (args.LABEL === '') {
      return this.whenReceived({ LABEL: 'any' });
    }
    return this.whenReceived(args);
  }

  getCountByLabel(args) {
    if (!this.counts) {
      return 0;
    }
    if (args.LABEL === '') {
      return Object.values(this.counts).reduce((total, count) => total + count, 0);
    }
    if (this.counts[args.LABEL]) {
      return this.counts[args.LABEL];
    } else {
      return 0;
    }
  }

  /**
   * Glow: Scratch has no list-valued reporter, so the labels and their example
   * counts are reported as two comma separated strings that line up index by
   * index. Both read the same object, so the order matches.
   * @return {string} - the trained labels, comma separated
   */
  getLabels() {
    if (!this.counts) {
      return '';
    }
    return Object.keys(this.counts).join(',');
  }

  /**
   * @return {string} - the example count of each trained label, comma separated
   */
  getCounts() {
    if (!this.counts) {
      return '';
    }
    return Object.values(this.counts).join(',');
  }

  reset(args) {
    if (this.actionRepeated()) { return };

    setTimeout(() => {
      let result = confirm(Message.confirm_reset[this.locale]);
      if (result) {
        if (args.LABEL == 'all') {
          this.knnClassifier.clearAllLabels();
          for (let label in this.counts) {
            this.counts[label] = 0;
          }
        } else {
          if (this.counts[args.LABEL] > 0) {
            this.knnClassifier.clearLabel(args.LABEL);
            this.counts[args.LABEL] = 0;
          }
        }
      }
    }, 1000);
  }

  resetAny(args) {
    this.reset(args);
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

  getMenu(name) {
    let arr = [];
    let defaultValue = 'any';
    let text = Message.any[this.locale];
    if (name == 'reset') {
      defaultValue = 'all';
      text = Message.all[this.locale];
    }
    arr.push({ text: text, value: defaultValue });
    for (let i = 1; i <= 10; i++) {
      let obj = {};
      obj.text = i.toString(10);
      obj.value = i.toString(10);
      arr.push(obj);
    };
    return arr;
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
const loadMl5 = () => new Promise((resolve, reject) => {
  if (typeof window.ml5 !== 'undefined') {
    resolve(window.ml5);
    return;
  }
  const script = document.createElement('script');
  script.src = ML5_URL;
  script.onload = () => resolve(window.ml5);
  script.onerror = () => reject(new Error(`Glow Machine Learning: could not load ml5 from ${ML5_URL}`));
  document.head.appendChild(script);
});

loadMl5().then(loaded => {
  ml5 = loaded;
  Scratch.extensions.register(new GlowMLBlocks(Scratch.vm.runtime));
}).catch(error => {
  // The extension manager has no way to hear about this: it is waiting for a
  // register() call that will never come, so it would otherwise hang silently.
  // Say out loud what went wrong instead.
  console.error(error);
  alert(`Glow Machine Learning could not start because ml5.js did not load.\n\nCheck the internet connection and add the extension again.\n\n${error.message}`);
});
