// Glow ML Webcam: train and recognise pictures from the webcam.
// Part of the Glow Lab integration of ML2Scratch by Junya Ishihara (champierre),
// AGPL-3.0; see glow-ml.js for the shared part and glow-ets/scratch-gui#21.
//
// Everything that touches the camera lives here and nowhere else, so that
// glow-ml-stage.js cannot use it even by accident. Its training data holds
// features of webcam pictures, i.e. of the pupils in front of it.

/* global Scratch */

(function () {
  'use strict';

  // Glow: captured now. The extension manager replaces the global Scratch for each
  // extension it loads, and this one must register with its own.
  const api = Scratch;
  const ArgumentType = api.ArgumentType;
  const BlockType = api.BlockType;
  const Cast = api.Cast;

  const GLOW_ML_URL = new URL('static/extensions/glow-ml/glow-ml.js', location.href).href;
  const EXTENSION_URL = new URL('static/extensions/glow-ml/glow-ml-webcam.js', location.href).href;

  /**
   * Glow: how often the extension may ask the browser for the camera again after being
   * refused. Every block that needs the camera goes through one shared attempt, so that
   * a 'forever' loop cannot turn a missing camera into a stream of permission requests.
   */
  const CAMERA_RETRY_MS = 3000;

  // Glow: the same artwork as the library inset icon, glow-ml-webcam-small.svg.
  const BLOCK_ICON_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8IS0tIEdsb3cgTUwgV2ViY2FtOiB0aGUgc21hbGwgaWNvbiBvZiB0aGUgZXh0ZW5zaW9uIGxpYnJhcnkgYW5kIHRoZSBibG9jayBwYWxldHRlLgogICAgICAgZ2xvdy1ldHMvc2NyYXRjaC1ndWkjMjEgLS0+CiAgPHJlY3QgeD0iMCIgeT0iMCIgd2lkdGg9IjgwIiBoZWlnaHQ9IjgwIiByeD0iMTIiIHJ5PSIxMiIgZmlsbD0iI2ZjMDBlZSIvPgogIDxyZWN0IHg9IjciIHk9IjIzIiB3aWR0aD0iNjYiIGhlaWdodD0iMzQiIHJ4PSI2IiByeT0iNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjQiLz4KICA8dGV4dCB4PSI0MCIgeT0iNDkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZvbnQtZmFtaWx5PSInQ291cmllciBOZXcnLCBDb3VyaWVyLCBtb25vc3BhY2UiIGZvbnQtd2VpZ2h0PSJib2xkIiBmb250LXNpemU9IjI1IiBmaWxsPSIjZmZmZmZmIj5NTFc8L3RleHQ+Cjwvc3ZnPgo=';

  /**
   * Glow: load the shared glow-ml.js once for the page, whichever Glow ML
   * extension asks first. A failed load is forgotten, so adding the extension
   * again retries it. The same function is in glow-ml-stage.js.
   * @returns {Promise<object>} window.GlowML
   */
  const loadGlowML = () => {
    if (!window.glowMLLoading) {
      window.glowMLLoading = new Promise((resolve, reject) => {
        if (window.GlowML) {
          resolve(window.GlowML);
          return;
        }
        const script = document.createElement('script');
        script.src = GLOW_ML_URL;
        script.onload = () => (window.GlowML ? resolve(window.GlowML) :
          reject(new Error(`Glow ML: ${GLOW_ML_URL} did not define GlowML`)));
        script.onerror = () => {
          script.remove();
          reject(new Error(`Glow ML: could not load ${GLOW_ML_URL}`));
        };
        document.head.appendChild(script);
      }).catch(error => {
        window.glowMLLoading = null;
        throw error;
      });
    }
    return window.glowMLLoading;
  };

  const define = GlowML => {
    const {GlowMLBase, Message} = GlowML;

    class GlowMLWebcamBlocks extends GlowMLBase {

      static get EXTENSION_ID() {
        return 'glowMLWebcam';
      }

      /**
       * Also the stage monitor prefix ('<name>: <block text>') and the palette
       * category heading, so it has to stay short.
       * @return {string} - the name of this extension
       */
      static get EXTENSION_NAME() {
        return 'Glow MLW';
      }

      static get EXTENSION_URL() {
        return EXTENSION_URL;
      }

      static get BLOCK_ICON_URI() {
        return BLOCK_ICON_URI;
      }

      static get COLORS() {
        return ['#f000ee', '#c000be', '#950094'];
      }

      constructor(runtime) {
        super(runtime);

        // The in-flight camera retry, and when the last one started.
        this.cameraRetry = null;
        this.cameraRetriedAt = 0;
        this.refreshingDevices = false;
        this.devices = [{ text: 'default', value: '' }];

        this.globalVideoTransparency = 0;
        this.setVideoTransparency({
          TRANSPARENCY: this.globalVideoTransparency
        });

        // Glow: VideoProvider._setupVideo() catches getUserMedia failures, calls its
        // own onError and resolves undefined, so there is nothing here to .catch().
        // A refused or missing camera arrives as a null video instead, which used to
        // surface much later as ml5 reading '.elt' of null, reported as a broken model.
        this.input = null;
        this.runtime.ioDevices.video.enableVideo().then(() => {
          this.input = this.runtime.ioDevices.video.provider.video;
        });

        // Glow: enumerateDevices() reports neither labels nor ids before permission is
        // granted, so the list has to be rebuilt - here, whenever the dropdown is opened,
        // and whenever a camera is plugged in.
        this.refreshDevices();
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
          navigator.mediaDevices.addEventListener('devicechange', () => this.refreshDevices());
        }
      }

      variantBlocks() {
        return [
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
            opcode: 'toggleVideo',
            text: Message.toggle_video[this.locale],
            blockType: BlockType.COMMAND,
            arguments: {
              VIDEO_STATE: {
                type: ArgumentType.STRING,
                menu: 'video_menu',
                defaultValue: 'off'
              }
            }
          }
        ];
      }

      variantMenus() {
        return {
          video_menu: this.getVideoMenu(),
          mediadevices: {
            acceptReporters: true,
            items: 'getDevices'
          }
        };
      }

      getInput() {
        return this.input;
      }

      /**
       * Checks the camera rather than just this.input, because a permission
       * revoked mid-session leaves the video element in place but dead.
       * @return {boolean} - whether there is a live picture, without saying anything
       */
      inputAvailable() {
        return Boolean(this.input) && this.hasWorkingCamera();
      }

      ensureInput() {
        return this.ensureCamera();
      }

      checkInput(block, util) {
        return this.checkCamera(block, util);
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

      toggleVideo(args, util) {
        let state = args.VIDEO_STATE;
        if (state === 'off') {
          this.runtime.ioDevices.video.disableVideo();
          // Glow: and stop reporting on a picture that is no longer arriving. The
          // classifier keeps its training - this is not a reset - but the last thing it
          // recognised is not an answer about now, so the reporters go quiet and the
          // hats stop firing rather than repeating a stale category.
          this.input = null;
          this.category = null;
          this.confidence = 0;
          this.when_received = false;
          this.whenReceivedFlags.clear();
        } else {
          const block = this.blockName('toggle_video', {VIDEO_STATE: state});
          this.runtime.ioDevices.video.enableVideo().then(() => {
            this.input = this.runtime.ioDevices.video.provider.video;
            // Glow: enableVideo() resolves whether or not permission was given, so
            // this is the only place the block can find out that nothing happened.
            // Without it the failure was a console line and a dead stage.
            this.checkCamera(block, util);
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

      /**
       * Glow: ask for the camera again, once, and say whether it is usable now.
       *
       * A camera that *did* work and was then taken away needs tearing down first:
       * _setupVideo()'s cached promise is resolved, so enableVideo() hands it straight
       * back without retrying. disableVideo()'s teardown runs in a .then gated on
       * enabled still being false, so the two cannot be called in the same tick - hence
       * the await between them.
       *
       * Known limitation, glow-ets/scratch-gui#25: a camera *refused* once cannot be
       * recovered at all. src/lib/video/camera.js caches the first getUserMedia promise,
       * rejection included, and nothing pops a rejected entry.
       * @returns {Promise<boolean>} whether the camera can be used now
       */
      ensureCamera() {
        if (this.hasWorkingCamera()) {
          return Promise.resolve(true);
        }
        const video = this.runtime.ioDevices.video;
        if (!video || !video.provider) {
          return Promise.resolve(false);
        }
        // Glow: 'turn video off' means off. provider.enabled is the difference between
        // a camera somebody switched off and one that was refused - disableVideo() sets
        // it false, enableVideo() sets it true before it even asks for a stream. Without
        // this check the classify timer called ensureCamera a second later and switched
        // the camera straight back on.
        if (!video.provider.enabled) {
          return Promise.resolve(false);
        }
        // One attempt at a time, shared by every block and by the classify timer, so
        // that a 'forever' loop cannot turn into a stream of getUserMedia requests.
        if (this.cameraRetry) {
          return this.cameraRetry;
        }
        const now = Date.now();
        if (this.cameraRetriedAt && now - this.cameraRetriedAt < CAMERA_RETRY_MS) {
          return Promise.resolve(false);
        }
        this.cameraRetriedAt = now;

        const provider = video.provider;
        const track = provider._track;
        const stale = Boolean(track && track.readyState === 'ended');

        this.cameraRetry = Promise.resolve()
          .then(() => {
            if (!stale) {
              return null;
            }
            video.disableVideo();
            // Let the teardown's .then run before asking again.
            return new Promise(resolve => setTimeout(resolve, 0));
          })
          .then(() => video.enableVideo())
          // enableVideo resolves even when getUserMedia was refused - the provider
          // swallows the error into onError - so the answer is whether it works now,
          // not whether this settled.
          .catch(() => null)
          .then(() => {
            this.cameraRetry = null;
            const working = this.hasWorkingCamera();
            if (working) {
              // Glow: a torn-down provider comes back with a new video element, so
              // follow it rather than inferring on the dead one.
              this.input = provider.video;
              // Let the problem be reported again if it comes back.
              this.reportedProblems.clear();
            }
            return working;
          });
        return this.cameraRetry;
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
       * Glow: the single place that decides whether there is a picture to work with,
       * and what to tell someone when there is not.
       * @param {string} block - the block name, from blockName()
       * @param {object} [util] - block utility, for the speech bubble
       * @return {boolean} - whether there is something to look at
       */
      checkCamera(block, util) {
        if (this.hasWorkingCamera() && this.input) {
          return true;
        }
        // Glow: a camera that was switched off is not a camera that was refused, and
        // "allow the camera in your browser" is the wrong thing to tell a child who
        // turned it off a moment ago. Say which block turns it back on instead.
        const video = this.runtime.ioDevices.video;
        if (video && video.provider && !video.provider.enabled) {
          this.reportProblem(Message.video_is_off[this.locale]
            .replace('[BLOCK]', block)
            .replace('[TURN_ON]', this.blockName('toggle_video', {VIDEO_STATE: Message.on[this.locale]})),
          util);
          return false;
        }
        this.reportProblem(Message.no_input[this.locale].replace('[BLOCK]', block), util);
        return false;
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
            return navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId } }).then(
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
            ).catch(error => {
              // Glow: the old track was already stopped and cannot be restarted, so ask
              // the provider for a camera from scratch rather than leaving it dead.
              console.warn('Glow ML: could not switch to that camera.', error);
              this.cameraRetriedAt = 0;
              return this.ensureCamera().then(working => {
                if (!working) {
                  this.reportProblem(Message.no_cameras[this.locale]
                    .replace('[BLOCK]', this.blockName('switch_webcam', {DEVICE: this.deviceName(args.DEVICE)})),
                  util);
                }
              });
            });
          }
          return undefined;
        }
      }

      getDevices() {
        // Glow: the menu is dynamic, so this runs every time the dropdown is opened -
        // the right moment to rebuild a list that was gathered before the child granted
        // camera permission, when enumerateDevices() reports neither labels nor ids.
        this.refreshDevices();
        return this.devices;
      }

      /**
       * Glow: rebuild the camera list, at most one enumeration at a time.
       */
      refreshDevices() {
        if (this.refreshingDevices || !navigator.mediaDevices) {
          return;
        }
        this.refreshingDevices = true;
        Promise.resolve(navigator.mediaDevices.enumerateDevices())
          .then(media => {
            const found = [{ text: 'default', value: '' }];
            for (const device of media) {
              if (device.kind === 'videoinput') {
                found.push({
                  text: device.label,
                  value: device.deviceId
                });
              }
            }
            // Keep the old list if this enumeration told us nothing useful, so an
            // unlucky refresh cannot empty a dropdown that was working.
            if (found.length > 1 || this.devices.length <= 1) {
              this.devices = found;
            }
          })
          .catch(error => {
            console.warn('Glow ML: could not list the cameras.', error);
          })
          .then(() => {
            this.refreshingDevices = false;
          });
      }

      /**
       * Glow: the camera's name as the dropdown shows it. The block stores a deviceId,
       * which is 64 hex characters and means nothing to a pupil.
       *
       * The name can be missing either way round - enumerateDevices() reports empty
       * labels before permission, and a project can name a camera this machine has never
       * seen - so both fall back to a generic phrase rather than the raw id.
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

    return GlowMLWebcamBlocks;
  };

  loadGlowML()
    .then(GlowML => GlowML.whenReady().then(() => define(GlowML)))
    .then(GlowMLWebcamBlocks => {
      api.extensions.register(new GlowMLWebcamBlocks(api.vm.runtime));
    })
    .catch(error => {
      // The extension manager has no way to hear about this: it is waiting for a
      // register() call that will never come, so it would otherwise hang silently.
      // Say out loud what went wrong instead.
      console.error(error);
      alert(`Glow ML could not start because ml5.js did not load.\n\nCheck the internet connection and add the extension again.\n\n${error.message}`);
    });
})();
