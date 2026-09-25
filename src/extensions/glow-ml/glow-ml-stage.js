// Glow ML Stage: train and recognise what is on the stage.
// Part of the Glow Lab integration of ML2Scratch by Junya Ishihara (champierre),
// AGPL-3.0; see glow-ml.js for the shared part and glow-ets/scratch-gui#21.
//
// Never touches the camera

/* global Scratch */

(function () {
  'use strict';

  // Glow: captured now. The extension manager replaces the global Scratch for each
  // extension it loads, and this one must register with its own.
  const api = Scratch;

  const GLOW_ML_URL = new URL('static/extensions/glow-ml/glow-ml.js', location.href).href;
  const EXTENSION_URL = new URL('static/extensions/glow-ml/glow-ml-stage.js', location.href).href;

  // Glow: the same artwork as the library inset icon, glow-ml-stage-small.svg.
  const BLOCK_ICON_URI = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcKICAgd2lkdGg9IjgwIgogICBoZWlnaHQ9IjgwIgogICB2aWV3Qm94PSIwIDAgODAgODAiCiAgIHZlcnNpb249IjEuMSIKICAgaWQ9InN2ZzgiCiAgIHNvZGlwb2RpOmRvY25hbWU9Imdsb3ctbWwtc3RhZ2Utc21hbGwuc3ZnIgogICBpbmtzY2FwZTp2ZXJzaW9uPSIxLjIuMiAoYjBhODQ4NiwgMjAyMi0xMi0wMSkiCiAgIHhtbG5zOmlua3NjYXBlPSJodHRwOi8vd3d3Lmlua3NjYXBlLm9yZy9uYW1lc3BhY2VzL2lua3NjYXBlIgogICB4bWxuczpzb2RpcG9kaT0iaHR0cDovL3NvZGlwb2RpLnNvdXJjZWZvcmdlLm5ldC9EVEQvc29kaXBvZGktMC5kdGQiCiAgIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIKICAgeG1sbnM6c3ZnPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGRlZnMKICAgICBpZD0iZGVmczEyIiAvPgogIDxzb2RpcG9kaTpuYW1lZHZpZXcKICAgICBpZD0ibmFtZWR2aWV3MTAiCiAgICAgcGFnZWNvbG9yPSIjZmZmZmZmIgogICAgIGJvcmRlcmNvbG9yPSIjNjY2NjY2IgogICAgIGJvcmRlcm9wYWNpdHk9IjEuMCIKICAgICBpbmtzY2FwZTpzaG93cGFnZXNoYWRvdz0iMiIKICAgICBpbmtzY2FwZTpwYWdlb3BhY2l0eT0iMC4wIgogICAgIGlua3NjYXBlOnBhZ2VjaGVja2VyYm9hcmQ9IjAiCiAgICAgaW5rc2NhcGU6ZGVza2NvbG9yPSIjZDFkMWQxIgogICAgIHNob3dncmlkPSJmYWxzZSIKICAgICBpbmtzY2FwZTp6b29tPSIwLjg4MzgwNTk1IgogICAgIGlua3NjYXBlOmN4PSItNDcxLjgyMzAzIgogICAgIGlua3NjYXBlOmN5PSI1MC45MTYxNTQiCiAgICAgaW5rc2NhcGU6d2luZG93LXdpZHRoPSIyMjU2IgogICAgIGlua3NjYXBlOndpbmRvdy1oZWlnaHQ9IjE0NjQiCiAgICAgaW5rc2NhcGU6d2luZG93LXg9IjAiCiAgICAgaW5rc2NhcGU6d2luZG93LXk9IjAiCiAgICAgaW5rc2NhcGU6d2luZG93LW1heGltaXplZD0iMSIKICAgICBpbmtzY2FwZTpjdXJyZW50LWxheWVyPSJzdmc4IiAvPgogIDwhLS0gR2xvdyBNTCBTdGFnZTogdGhlIHNtYWxsIGljb24gb2YgdGhlIGV4dGVuc2lvbiBsaWJyYXJ5IGFuZCB0aGUgYmxvY2sgcGFsZXR0ZS4KICAgICAgIGdsb3ctZXRzL3NjcmF0Y2gtZ3VpIzIxIC0tPgogIDxwYXRoCiAgICAgaWQ9InJlY3QyIgogICAgIHN0eWxlPSJmaWxsOiNiODAwYjAiCiAgICAgZD0ibSAxMiwwIGggNTYgYyA2LjY0OCwwIDEyLDUuMzUyIDEyLDEyIHYgNTYgYyAwLDYuNjQ4IC01LjM1MiwxMiAtMTIsMTIgSCAxMiBDIDUuMzUyLDgwIDAsNzQuNjQ4IDAsNjggViAxMiBDIDAsNS4zNTIgNS4zNTIsMCAxMiwwIFoiIC8+CiAgPGcKICAgICBmaWxsPSIjYjgwMGIwIgogICAgIHN0cm9rZT0iI2ZmZGFmYiIKICAgICBzdHJva2Utd2lkdGg9IjgiCiAgICAgaWQ9ImcyMCIKICAgICB0cmFuc2Zvcm09Im1hdHJpeCgwLjAwMzEzNzQ1LC0wLjMyNDY4NjE5LDAuMjkwMDYxMzMsMC4wMDM1MTE5NywtMTEuNDI5NDc5LDE5Ni41OTE5MykiPgogICAgPGNpcmNsZQogICAgICAgY3g9IjQyNi40NzY4MSIKICAgICAgIGN5PSIxMDIuNDA3OTQiCiAgICAgICByPSIzMC40Nzk4MjgiCiAgICAgICBpZD0iY2lyY2xlMTYiCiAgICAgICBzdHlsZT0iZmlsbDojZmZkYWZiO2ZpbGwtb3BhY2l0eToxO3N0cm9rZS13aWR0aDoxMi44MzM2IiAvPgogICAgPGNpcmNsZQogICAgICAgY3g9IjQyNi40NzY4MSIKICAgICAgIGN5PSIyNTMuMjAyODciCiAgICAgICByPSIzMC40Nzk4MjgiCiAgICAgICBpZD0iY2lyY2xlMTgiCiAgICAgICBzdHlsZT0iZmlsbDojZmZkYWZiO2ZpbGwtb3BhY2l0eToxO3N0cm9rZS13aWR0aDoxMi44MzM2IiAvPgogIDwvZz4KICA8ZWxsaXBzZQogICAgIGN4PSItMjAuNzM1MDkyIgogICAgIGN5PSI0Mi4wNDg4NTEiCiAgICAgZmlsbD0iI2ZmZGFmYiIKICAgICBpZD0iY2lyY2xlMjIiCiAgICAgc3R5bGU9InN0cm9rZS13aWR0aDowLjQ5MjMzNSIKICAgICB0cmFuc2Zvcm09Im1hdHJpeCgwLjAwOTY2MjU4LC0wLjk5OTk1MzMyLDAuOTk5OTI2NzEsMC4wMTIxMDY3OSwwLDApIgogICAgIHJ4PSIxMi41MDEyNzIiCiAgICAgcnk9IjExLjE2ODQyMiIgLz4KICA8cGF0aAogICAgIHN0eWxlPSJmaWxsOm5vbmU7ZmlsbC1ydWxlOmV2ZW5vZGQ7c3Ryb2tlOiNmZmRhZmI7c3Ryb2tlLXdpZHRoOjU7c3Ryb2tlLWxpbmVjYXA6YnV0dDtzdHJva2UtbGluZWpvaW46bWl0ZXI7c3Ryb2tlLWRhc2hhcnJheTpub25lO3N0cm9rZS1vcGFjaXR5OjEiCiAgICAgZD0ibSAyMC41MDgyMTYsNTkuMjcwNDI5IDQ0LjEzMjY1MiwwLjMxNjE2MiIKICAgICBpZD0icGF0aDg3NDMiIC8+CiAgPHBhdGgKICAgICBzdHlsZT0iZmlsbDpub25lO2ZpbGwtcnVsZTpldmVub2RkO3N0cm9rZTojZmZkYWZiO3N0cm9rZS13aWR0aDo1O3N0cm9rZS1saW5lY2FwOmJ1dHQ7c3Ryb2tlLWxpbmVqb2luOm1pdGVyO3N0cm9rZS1kYXNoYXJyYXk6bm9uZTtzdHJva2Utb3BhY2l0eToxIgogICAgIGQ9Im0gNDIuNjMwMDU0LDIxLjAzMTU3OCAyMi44NTUzNDEsMzkuNjA4NiBtIDAuMTE4MjIzLC0wLjg4NTEwNSIKICAgICBpZD0icGF0aDg3NDMtNiIKICAgICBzb2RpcG9kaTpub2RldHlwZXM9ImNjIiAvPgogIDxwYXRoCiAgICAgc3R5bGU9ImZpbGw6bm9uZTtmaWxsLXJ1bGU6ZXZlbm9kZDtzdHJva2U6I2ZmZGFmYjtzdHJva2Utd2lkdGg6NTtzdHJva2UtbGluZWNhcDpidXR0O3N0cm9rZS1saW5lam9pbjptaXRlcjtzdHJva2UtZGFzaGFycmF5Om5vbmU7c3Ryb2tlLW9wYWNpdHk6MSIKICAgICBkPSJNIDQxLjY0NjY2NiwyMS4xNzI4NDUgMTkuNTUzMzE1LDU4Ljk1MTE2MiIKICAgICBpZD0icGF0aDg3NDMtNi03IgogICAgIHNvZGlwb2RpOm5vZGV0eXBlcz0iY2MiIC8+Cjwvc3ZnPgo=';

  /**
   * Glow: load the shared glow-ml.js once for the page, whichever Glow ML
   * extension asks first. A failed load is forgotten, so adding the extension
   * again retries it. The same function is in glow-ml-webcam.js.
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

    class GlowMLStageBlocks extends GlowMLBase {

      static get EXTENSION_ID() {
        return 'glowMLStage';
      }

      /**
       * Also the stage monitor prefix ('<name>: <block text>') and the palette
       * category heading, so it has to stay short.
       * @return {string} - the name of this extension
       */
      static get EXTENSION_NAME() {
        return 'Glow MLS';
      }

      static get EXTENSION_URL() {
        return EXTENSION_URL;
      }

      /**
       * Glow: written into training data this extension saves (see trainingMetadata
       * in glow-ml.js), and the sources it loads: never webcam data, which would
       * put pupils' faces into a Stage project.
       */
      static get DATA_SOURCE() {
        return 'stage';
      }

      static get ACCEPTS_SOURCES() {
        return ['stage'];
      }

      static get BLOCK_ICON_URI() {
        return BLOCK_ICON_URI;
      }

      /**
       * @return {string[]} - color1, color2, color3
       */
      static get COLORS() {
        return ['#b800b0', '#94008e', '#70006b'];
      }

      getInput() {
        return this.stageCanvas();
      }

      inputAvailable() {
        return Boolean(this.stageCanvas());
      }

      ensureInput() {
        return Promise.resolve(this.inputAvailable());
      }

      /**
       * The stage is always there once the editor has rendered, so there is nothing
       * a pupil could do about a missing one; say it to the console only.
       * @return {boolean} - whether there is a stage to look at
       */
      checkInput() {
        if (this.inputAvailable()) {
          return true;
        }
        console.warn(`${this.constructor.EXTENSION_NAME}: no stage canvas found, so there is nothing to learn from`);
        return false;
      }

      /**
       * Glow: whether the webcam is showing on the stage. Video Sensing (and Glow ML
       * Webcam, which turns the camera on) draw every camera frame into the stage
       * canvas this extension reads - scratch-vm io/video.js, the VIDEO_LAYER
       * drawable - unless the video is off or fully transparent.
       * @return {boolean} - whether a picture of the stage would include the camera
       */
      webcamOnStage() {
        const video = this.runtime.ioDevices && this.runtime.ioDevices.video;
        if (!video || !video.provider || !video.provider.enabled || !video.videoReady) {
          return false;
        }
        if (video._forceTransparentPreview) {
          return false;
        }
        return (Number(video._ghost) || 0) < 100;
      }

      /**
       * Glow: never keep webcam pictures. Learned examples are saved into the
       * project, and keeping pupils' faces out of Stage projects is why Glow ML
       * Stage exists. Recognising the stage with the video on is still fine: it
       * keeps nothing.
       */
      mayLearn(block, util) {
        if (!this.webcamOnStage()) {
          return true;
        }
        const name = key => this.blockName(key, {
          VIDEO_STATE: Message.off[this.locale],
          TRANSPARENCY: '100'
        });
        this.reportProblem(Message.webcam_on_stage[this.locale]
          .replace('[BLOCK]', block)
          .replace('[TURN_OFF]', () => name('toggle_video'))
          .replace('[TRANSPARENT]', () => name('video_transparency'))
          .replace('[EXTENSION]', () => this.videoSensingName()), util);
        return false;
      }
    }

    return GlowMLStageBlocks;
  };

  loadGlowML()
    .then(GlowML => GlowML.whenReady().then(() => define(GlowML)))
    .then(GlowMLStageBlocks => {
      api.extensions.register(new GlowMLStageBlocks(api.vm.runtime));
    })
    .catch(error => {
      // The extension manager has no way to hear about this: it is waiting for a
      // register() call that will never come, so it would otherwise hang silently.
      // Say out loud what went wrong instead.
      console.error(error);
      alert(`Glow ML Stage could not start because ml5.js did not load.\n\nCheck the internet connection and add the extension again.\n\n${error.message}`);
    });
})();
