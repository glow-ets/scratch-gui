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
  const BLOCK_ICON_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj4KICA8IS0tIEdsb3cgTUwgU3RhZ2U6IHRoZSBzbWFsbCBpY29uIG9mIHRoZSBleHRlbnNpb24gbGlicmFyeSBhbmQgdGhlIGJsb2NrIHBhbGV0dGUuCiAgICAgICBnbG93LWV0cy9zY3JhdGNoLWd1aSMyMSAtLT4KICA8cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iODAiIGhlaWdodD0iODAiIHJ4PSIxMiIgcnk9IjEyIiBmaWxsPSIjYjgwMGIwIi8+CiAgPHJlY3QgeD0iNyIgeT0iMjMiIHdpZHRoPSI2NiIgaGVpZ2h0PSIzNCIgcng9IjYiIHJ5PSI2IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iNCIvPgogIDx0ZXh0IHg9IjQwIiB5PSI0OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9IidDb3VyaWVyIE5ldycsIENvdXJpZXIsIG1vbm9zcGFjZSIgZm9udC13ZWlnaHQ9ImJvbGQiIGZvbnQtc2l6ZT0iMjUiIGZpbGw9IiNmZmZmZmYiPk1MUzwvdGV4dD4KPC9zdmc+Cg==';

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
    const {GlowMLBase} = GlowML;

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
        console.warn('Glow ML: no stage canvas found, so there is nothing to learn from');
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
      alert(`Glow ML could not start because ml5.js did not load.\n\nCheck the internet connection and add the extension again.\n\n${error.message}`);
    });
})();
