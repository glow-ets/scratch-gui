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

  const GLOW_ML_URL = new URL('static/extensions/glow-ml/glow-ml.js', location.href).href;
  const EXTENSION_URL = new URL('static/extensions/glow-ml/glow-ml-webcam.js', location.href).href;

  /**
   * Glow: how often the extension may ask the browser for the camera again after being
   * refused. Every block that needs the camera goes through one shared attempt, so that
   * a 'forever' loop cannot turn a missing camera into a stream of permission requests.
   */
  const CAMERA_RETRY_MS = 3000;

  // Glow: the same artwork as the library inset icon, glow-ml-webcam-small.svg.
  const BLOCK_ICON_URI = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgd2lkdGg9IjgwIgogICBoZWlnaHQ9IjgwIgogICB2aWV3Qm94PSIwIDAgODAgODAiCiAgIHZlcnNpb249IjEuMSIKICAgaWQ9InN2ZzMyOCIKICAgc29kaXBvZGk6ZG9jbmFtZT0iZ2xvdy1tbC13ZWJjYW0tc21hbGwuc3ZnIgogICBpbmtzY2FwZTp2ZXJzaW9uPSIxLjIuMiAoYjBhODQ4NiwgMjAyMi0xMi0wMSkiCiAgIHhtbG5zOmlua3NjYXBlPSJodHRwOi8vd3d3Lmlua3NjYXBlLm9yZy9uYW1lc3BhY2VzL2lua3NjYXBlIgogICB4bWxuczpzb2RpcG9kaT0iaHR0cDovL3NvZGlwb2RpLnNvdXJjZWZvcmdlLm5ldC9EVEQvc29kaXBvZGktMC5kdGQiCiAgIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICAgeG1sbnM6c3ZnPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnMKICAgICBpZD0iZGVmczMzMiIgLz4KICA8c29kaXBvZGk6bmFtZWR2aWV3CiAgICAgaWQ9Im5hbWVkdmlldzMzMCIKICAgICBwYWdlY29sb3I9IiNmZmZmZmYiCiAgICAgYm9yZGVyY29sb3I9IiM2NjY2NjYiCiAgICAgYm9yZGVyb3BhY2l0eT0iMS4wIgogICAgIGlua3NjYXBlOnNob3dwYWdlc2hhZG93PSIyIgogICAgIGlua3NjYXBlOnBhZ2VvcGFjaXR5PSIwLjAiCiAgICAgaW5rc2NhcGU6cGFnZWNoZWNrZXJib2FyZD0iMCIKICAgICBpbmtzY2FwZTpkZXNrY29sb3I9IiNkMWQxZDEiCiAgICAgc2hvd2dyaWQ9ImZhbHNlIgogICAgIGlua3NjYXBlOnpvb209IjUuMjMxODUwNCIKICAgICBpbmtzY2FwZTpjeD0iMTA3Ljk5MjM4IgogICAgIGlua3NjYXBlOmN5PSItMjAuMjYwNTE4IgogICAgIGlua3NjYXBlOndpbmRvdy13aWR0aD0iMjI1NiIKICAgICBpbmtzY2FwZTp3aW5kb3ctaGVpZ2h0PSIxNDY0IgogICAgIGlua3NjYXBlOndpbmRvdy14PSIwIgogICAgIGlua3NjYXBlOndpbmRvdy15PSIwIgogICAgIGlua3NjYXBlOndpbmRvdy1tYXhpbWl6ZWQ9IjEiCiAgICAgaW5rc2NhcGU6Y3VycmVudC1sYXllcj0ic3ZnMzI4IiAvPgogIDwhLS0gR2xvdyBNTCBXZWJjYW06IHRoZSBzbWFsbCBpY29uIG9mIHRoZSBleHRlbnNpb24gbGlicmFyeSBhbmQgdGhlIGJsb2NrIHBhbGV0dGUuCiAgICAgICBnbG93LWV0cy9zY3JhdGNoLWd1aSMyMSAtLT4KICA8cmVjdAogICAgIHg9Ii0wLjA2Njg3NDEwOSIKICAgICB5PSIwLjA2MzAyODYyNiIKICAgICB3aWR0aD0iODAiCiAgICAgaGVpZ2h0PSI4MCIKICAgICByeD0iMTIiCiAgICAgcnk9IjEyIgogICAgIGZpbGw9IiNiODAwYjAiCiAgICAgaWQ9InJlY3QyIgogICAgIHN0eWxlPSJmaWxsOiNmYzAwZWU7ZmlsbC1vcGFjaXR5OjEiIC8+CiAgPGVsbGlwc2UKICAgICBzdHlsZT0iY29sb3I6IzAwMDAwMDtvdmVyZmxvdzp2aXNpYmxlO2ZpbGw6bm9uZTtmaWxsLW9wYWNpdHk6MTtmaWxsLXJ1bGU6ZXZlbm9kZDtzdHJva2U6I2ZmZGFmYjtzdHJva2Utd2lkdGg6NS4zNDkxOTtzdHJva2UtbGluZWpvaW46YmV2ZWw7c3Ryb2tlLW1pdGVybGltaXQ6MTkuMztzdHJva2UtZGFzaGFycmF5Om5vbmU7cGFpbnQtb3JkZXI6c3Ryb2tlIG1hcmtlcnMgZmlsbDtzdG9wLWNvbG9yOiMwMDAwMDAiCiAgICAgaWQ9InBhdGg3MTk0IgogICAgIGN4PSIzOS43MjQxMDYiCiAgICAgY3k9IjM4LjYyNDI3MSIKICAgICByeD0iMTAuMTg0OTk3IgogICAgIHJ5PSIxMC4zNDk3NTYiIC8+CiAgPGVsbGlwc2UKICAgICBzdHlsZT0iY29sb3I6IzAwMDAwMDtvdmVyZmxvdzp2aXNpYmxlO2ZpbGw6bm9uZTtmaWxsLW9wYWNpdHk6MTtmaWxsLXJ1bGU6ZXZlbm9kZDtzdHJva2U6I2ZmZGFmYjtzdHJva2Utd2lkdGg6My44MTEyMjtzdHJva2UtbGluZWpvaW46YmV2ZWw7c3Ryb2tlLW1pdGVybGltaXQ6MTkuMztzdHJva2UtZGFzaGFycmF5Om5vbmU7cGFpbnQtb3JkZXI6c3Ryb2tlIG1hcmtlcnMgZmlsbDtzdG9wLWNvbG9yOiMwMDAwMDAiCiAgICAgaWQ9InBhdGg3MTk0LTciCiAgICAgY3g9IjYwLjkwMjgwMiIKICAgICBjeT0iMjAuMjYwNzgiCiAgICAgcng9IjUuMDI2NDc0IgogICAgIHJ5PSI1LjE3MDMxNzYiIC8+CiAgPHBhdGgKICAgICBzdHlsZT0iZmlsbDpub25lO2ZpbGwtcnVsZTpldmVub2RkO3N0cm9rZTojZmZkYWZiO3N0cm9rZS13aWR0aDo0LjY5NztzdHJva2UtbGluZWNhcDpidXR0O3N0cm9rZS1saW5lam9pbjptaXRlcjtzdHJva2UtZGFzaGFycmF5Om5vbmU7c3Ryb2tlLW9wYWNpdHk6MSIKICAgICBkPSJtIDQ3Ljc3NjAyNiwzMi41MTc3MTMgOC41NTAwNjIsLTcuNTEwNTg1IgogICAgIGlkPSJwYXRoODQ0NiIKICAgICBzb2RpcG9kaTpub2RldHlwZXM9ImNjIiAvPgogIDxyZWN0CiAgICAgc3R5bGU9ImNvbG9yOiMwMDAwMDA7b3ZlcmZsb3c6dmlzaWJsZTtmaWxsOm5vbmU7ZmlsbC1ydWxlOmV2ZW5vZGQ7c3Ryb2tlOiNmZmZmZmY7c3Ryb2tlLXdpZHRoOjIuMDAxNDY7c3Ryb2tlLWxpbmVqb2luOmJldmVsO3N0cm9rZS1taXRlcmxpbWl0OjE5LjM7c3Ryb2tlLWRhc2hhcnJheTpub25lO3BhaW50LW9yZGVyOnN0cm9rZSBtYXJrZXJzIGZpbGw7c3RvcC1jb2xvcjojMDAwMDAwIgogICAgIGlkPSJyZWN0MzA1IgogICAgIHdpZHRoPSI2My44NTI3NDkiCiAgICAgaGVpZ2h0PSI1OS40Njc4OTYiCiAgICAgeD0iOC4wNjM3MjM2IgogICAgIHk9IjkuMDM4MjIxNCIKICAgICByeD0iMy4xMDUxNDQzIgogICAgIHJ5PSI1Ljg3Njg4NzgiIC8+Cjwvc3ZnPgo=';

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

      /**
       * Glow: written into training data this extension saves (see trainingMetadata
       * in glow-ml.js), and the sources it loads. Stage data is pictures of the
       * stage, so Webcam can take it as well.
       */
      static get DATA_SOURCE() {
        return 'webcam';
      }

      static get ACCEPTS_SOURCES() {
        return ['webcam', 'stage'];
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
        ];
      }

      variantMenus() {
        return {
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
        // turned it off a moment ago. Say which block turns it back on instead:
        // Video Sensing's, since Glow ML Webcam leaves turning the video on and off,
        // and its transparency, to that extension.
        const video = this.runtime.ioDevices.video;
        if (video && video.provider && !video.provider.enabled) {
          this.reportProblem(Message.video_is_off[this.locale]
            .replace('[BLOCK]', block)
            .replace('[TURN_ON]', this.blockName('toggle_video', {VIDEO_STATE: Message.on[this.locale]}))
            .replace('[EXTENSION]', () => this.videoSensingName()),
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
              console.warn(`${this.constructor.EXTENSION_NAME}: could not switch to that camera.`, error);
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
            console.warn(`${this.constructor.EXTENSION_NAME}: could not list the cameras.`, error);
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
      alert(`Glow ML Webcam could not start because ml5.js did not load.\n\nCheck the internet connection and add the extension again.\n\n${error.message}`);
    });
})();
