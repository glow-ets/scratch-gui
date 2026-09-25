// glow-disable-webcam: keep every extension away from the webcam, for schools that
// do not allow it. Turned on from the addon settings or with the dgw URL parameter
// (see settings-store-singleton.js). glow-ets/scratch-gui#21
//
// It works at the three doors a camera can come through, so that it does not
// depend on knowing the extension in advance - including one loaded with
// extension=URL:
//  - runtime.ioDevices.video.enableVideo(), which Scratch's own extensions use;
//  - navigator.mediaDevices.getUserMedia() and its legacy forms, for extensions
//    that ask the browser directly; enumerateDevices() stops listing cameras;
//  - the blocks of an extension that needs the webcam, which report instead of
//    running, so a pupil is told why rather than watching a block do nothing.
//
// Sandboxed extensions run in a Worker, which has no camera anyway. What this cannot
// stop is a script that fetches a fresh navigator from a new same-origin frame:
// this is a guard for the classroom, not a lock. A browser policy is the lock.
//
// Hiding the extensions from the library is done in containers/extension-library.jsx,
// which reads this addon's enabled state.

/**
 * Extensions known to need the webcam. Their blocks report instead of running from
 * the start; any other extension joins the moment one of its blocks asks for the
 * camera.
 */
const KNOWN_WEBCAM_EXTENSIONS = ['videoSensing', 'faceSensing', 'glowMLWebcam'];

const MESSAGES = {
  en: "Project extension [EXTENSION NAME] requires using webcam, which is not allowed by administrator.",
  it: "L'estensione [EXTENSION NAME] del progetto richiede l'uso della webcam, che non è consentito dall'amministratore."
};

// The same pacing as Glow ML's reportProblem: a loop cannot put up more than one
// bubble every SAY_THROTTLE_MS, and a bubble stays up long enough to be read.
const SAY_THROTTLE_MS = 200;
const BUBBLE_BASE_MS = 4000;
const BUBBLE_MS_PER_CHAR = 90;
const BUBBLE_MAX_MS = 30000;

const bubbleDuration = text => Math.min(BUBBLE_MAX_MS, BUBBLE_BASE_MS + text.length * BUBBLE_MS_PER_CHAR);

/** Marks a primitive this addon has wrapped, and holds the original. */
const WRAPPED = Symbol("glowDisableWebcam");

export default async function ({ addon }) {
  const vm = addon.tab.traps.vm;
  const runtime = vm.runtime;
  const video = runtime.ioDevices && runtime.ioDevices.video;

  const webcamExtensions = new Set(KNOWN_WEBCAM_EXTENSIONS);
  // The extension whose block is running right now, and that block's utility, so
  // that a camera request can be pinned on it. Only known while the block runs
  // synchronously; a request made after an await is refused without a name.
  let runningExtension = null;
  let runningUtil = null;

  const active = () => !addon.self.disabled;

  const extensionName = id => {
    const category = runtime._blockInfo.find(info => info.id === id);
    return (category && category.name) || id;
  };

  const messageFor = id => {
    const state = addon.tab.redux.state;
    const locale = (state && state.locales && state.locales.locale) || "en";
    const text = MESSAGES[locale.split("-")[0]] || MESSAGES.en;
    // A function replacer: a name is whatever the extension called itself, and a
    // replacement string would expand any '$&' in it.
    return text.replace("[EXTENSION NAME]", () => extensionName(id));
  };

  // --- Reporting, as Glow ML does it: the first message is a modal, the only one
  // anybody reads; the rest are speech bubbles, which do not stop the project.

  const reported = new Set();
  let lastSayAt = 0;
  let sayTarget = null;
  let sayTimer = null;
  let emittingSay = false;

  const emitSay = (target, text) => {
    if (sayTimer) {
      clearTimeout(sayTimer);
      sayTimer = null;
    }
    // One bubble of ours at a time: the timer just cleared belonged to the previous
    // one, so a bubble on another target must come down now, or it stays forever.
    if (text !== "" && sayTarget && sayTarget !== target) {
      emittingSay = true;
      try {
        runtime.emit("SAY", sayTarget, "say", "");
      } finally {
        emittingSay = false;
      }
    }
    sayTarget = text === "" ? null : target;
    emittingSay = true;
    try {
      runtime.emit("SAY", target, "say", text);
    } finally {
      emittingSay = false;
    }
  };

  runtime.on("SAY", target => {
    // The project said something on the sprite holding our bubble: that is the
    // message on screen now, and our timer must not take it down.
    if (!emittingSay && target === sayTarget && sayTimer) {
      clearTimeout(sayTimer);
      sayTimer = null;
      sayTarget = null;
    }
  });

  const sayOnTarget = (text, util) => {
    // The sprite that ran the block, or the one being edited, and only if visible.
    // No falling back to the stage: scratch-gui hides a sprite while it is dragged,
    // and the bubble would land in the middle of the stage. The loop reports again
    // after the drop.
    const target = util && util.target ? util.target : runtime.getEditingTarget();
    if (!target || !target.visible) {
      return;
    }
    emitSay(target, text);
    sayTimer = setTimeout(() => {
      sayTimer = null;
      emitSay(target, "");
    }, bubbleDuration(text));
  };

  const report = (id, util) => {
    const text = messageFor(id);
    if (!reported.has(text)) {
      reported.add(text);
      console.warn(`glow-disable-webcam: ${text}`);
      if (reported.size === 1) {
        alert(text);
        return;
      }
    }
    const now = Date.now();
    if (now - lastSayAt < SAY_THROTTLE_MS) {
      return;
    }
    lastSayAt = now;
    sayOnTarget(text, util);
  };

  // A new project gets its messages again.
  runtime.on("PROJECT_LOADED", () => reported.clear());

  /**
   * A camera request was refused. Pin it on the running block's extension when
   * there is one; a request made while an extension loads is refused quietly, and
   * the pupil hears about it from the first block that needs the camera.
   */
  const refused = what => {
    const id = runningExtension;
    if (id) {
      webcamExtensions.add(id);
      report(id, runningUtil);
    } else {
      console.warn(`glow-disable-webcam: refused ${what} made outside any block`);
    }
  };

  // --- Door 1: the VM's video device.

  if (video && !video.enableVideo[WRAPPED]) {
    const originalEnableVideo = video.enableVideo;
    const guardedEnableVideo = function (...args) {
      if (active()) {
        refused("a video request");
        // What enableVideo() resolves to when getUserMedia was refused: callers
        // already cope with that.
        return Promise.resolve(null);
      }
      return originalEnableVideo.apply(this, args);
    };
    guardedEnableVideo[WRAPPED] = originalEnableVideo;
    video.enableVideo = guardedEnableVideo;
  }

  // --- Door 2: the browser. Installed once; the guards pass through while the
  // addon is disabled, which also keeps them correct if something else has wrapped
  // the same functions since.

  const wantsVideo = constraints => Boolean(constraints && constraints.video);
  const notAllowed = () => new DOMException("The webcam is not allowed by the administrator", "NotAllowedError");

  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices && typeof mediaDevices.getUserMedia === "function" && !mediaDevices.getUserMedia[WRAPPED]) {
    const originalGetUserMedia = mediaDevices.getUserMedia;
    const guardedGetUserMedia = function (constraints) {
      if (active() && wantsVideo(constraints)) {
        refused("a getUserMedia request");
        return Promise.reject(notAllowed());
      }
      return originalGetUserMedia.call(mediaDevices, constraints);
    };
    guardedGetUserMedia[WRAPPED] = originalGetUserMedia;
    mediaDevices.getUserMedia = guardedGetUserMedia;
  }
  if (mediaDevices && typeof mediaDevices.enumerateDevices === "function" && !mediaDevices.enumerateDevices[WRAPPED]) {
    const originalEnumerateDevices = mediaDevices.enumerateDevices;
    const guardedEnumerateDevices = function () {
      return originalEnumerateDevices.call(mediaDevices).then(devices =>
        (active() ? devices.filter(device => device.kind !== "videoinput") : devices)
      );
    };
    guardedEnumerateDevices[WRAPPED] = originalEnumerateDevices;
    mediaDevices.enumerateDevices = guardedEnumerateDevices;
  }
  for (const key of ["getUserMedia", "webkitGetUserMedia", "mozGetUserMedia"]) {
    const legacy = navigator[key];
    if (typeof legacy !== "function" || legacy[WRAPPED]) {
      continue;
    }
    const guardedLegacy = function (constraints, onSuccess, onError) {
      if (active() && wantsVideo(constraints)) {
        refused("a getUserMedia request");
        if (typeof onError === "function") {
          onError(notAllowed());
        }
        return undefined;
      }
      return legacy.call(navigator, constraints, onSuccess, onError);
    };
    guardedLegacy[WRAPPED] = legacy;
    navigator[key] = guardedLegacy;
  }

  // --- Door 3: the blocks.

  const wrapCategory = category => {
    for (const block of category.blocks || []) {
      const opcode = block.json && block.json.type;
      if (!opcode) {
        continue;
      }
      const original = runtime._primitives[opcode];
      if (typeof original !== "function" || original[WRAPPED]) {
        continue;
      }
      const id = category.id;
      const blockType = block.info && block.info.blockType;
      const wrapped = function (args, util) {
        if (!active()) {
          return original.call(this, args, util);
        }
        if (webcamExtensions.has(id)) {
          // A hat that needs the camera would be polled every frame: it just never
          // fires, and says nothing.
          if (runtime._hats[opcode]) {
            return false;
          }
          // A stage monitor is not a pupil running a block, and would report every
          // frame; let it show whatever the extension has without a camera.
          if (util && util.thread && util.thread.updateMonitor) {
            return original.call(this, args, util);
          }
          report(id, util);
          if (blockType === "Boolean") {
            return false;
          }
          return blockType === "reporter" ? "" : undefined;
        }
        const previousExtension = runningExtension;
        const previousUtil = runningUtil;
        runningExtension = id;
        runningUtil = util;
        try {
          return original.call(this, args, util);
        } finally {
          runningExtension = previousExtension;
          runningUtil = previousUtil;
        }
      };
      wrapped[WRAPPED] = original;
      runtime._primitives[opcode] = wrapped;
    }
  };

  const wrapAll = () => {
    runtime._blockInfo.forEach(wrapCategory);
    // Compiled scripts looked their primitives up when they were compiled.
    if (typeof runtime.resetAllCaches === "function") {
      runtime.resetAllCaches();
    }
  };

  // Loading an extension, and refreshing one (a language change), both write fresh
  // primitives over ours.
  runtime.on("EXTENSION_ADDED", category => wrapCategory(category));
  runtime.on("BLOCKSINFO_UPDATE", category => wrapCategory(category));

  /**
   * Turn off a camera that is already on: the addon can be enabled mid-session, and
   * with dgw it can start after a project that switched the video on.
   */
  const stopVideo = () => {
    if (video && video.provider && video.provider.enabled) {
      video.disableVideo();
    }
  };

  wrapAll();
  stopVideo();

  addon.self.addEventListener("reenabled", () => {
    wrapAll();
    stopVideo();
  });
  addon.self.addEventListener("disabled", () => {
    // The wrappers pass everything through from now on. Blocks run again as soon
    // as they are next used; the camera comes back with the next block that asks.
    reported.clear();
  });
}
