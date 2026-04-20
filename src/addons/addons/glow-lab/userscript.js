const VERSION = process.env.GLOW_VERSION || "?";
const COMMIT = process.env.GLOW_COMMIT_HASH || "?";

// Keys watched to compute glow-ets/scratch-gui#19 non-default preference signal.
const GLOW_PREF_KEYS = ["tw:theme", "tw:language", "tw:addons"];

// Advanced settings defaults mirror src/reducers/tw.js initialState; kept here
// so the addon stays self-contained and doesn't import gui internals.
const GLOW_ADVANCED_DEFAULTS = {
    framerate: 30,
    interpolation: false,
    highQualityPen: false,
    compilerEnabled: true,
    warpTimer: false,
    maxClones: 300,
    miscLimits: true,
    fencing: true
};

export default async function ({addon}) {
    const badge = document.createElement("div");
    badge.className = "glow-version-badge";

    const logoLink = document.createElement("a");
    logoLink.className = "glow-logo-link";
    logoLink.href = "https://glow.earth";
    logoLink.target = "_blank";
    logoLink.rel = "noreferrer";
    const logoImg = document.createElement("div");
    logoImg.className = "glow-logo-img";
    logoLink.appendChild(logoImg);
    badge.appendChild(logoLink);

    const versionText = document.createElement("div");
    versionText.className = "glow-version-text";

    const versionLink = document.createElement("a");
    versionLink.className = "glow-version-link";
    versionLink.href = "https://github.com/glow-ets/scratch-gui/issues/2";
    versionLink.target = "_blank";
    versionLink.rel = "noreferrer";
    versionLink.textContent = VERSION;
    const advancedBadge = document.createElement("span");
    advancedBadge.className = "glow-advanced-badge";
    advancedBadge.textContent = " advanced";
    advancedBadge.hidden = true;
    versionLink.appendChild(advancedBadge);
    versionText.appendChild(versionLink);

    const commitLink = document.createElement("a");
    commitLink.className = "glow-version-link";
    commitLink.href = `https://github.com/glow-ets/scratch-gui/commit/${COMMIT}`;
    commitLink.target = "_blank";
    commitLink.rel = "noreferrer";
    commitLink.textContent = COMMIT;
    versionText.appendChild(commitLink);

    badge.appendChild(versionText);

    addon.tab.displayNoneWhileDisabled(badge, {display: "flex"});

    addon.tab.redux.initialize();

    let prefSyncEnabled = true;

    const syncAdvancedBadge = () => {
        const tw = addon.tab.redux.state && addon.tab.redux.state.scratchGui && addon.tab.redux.state.scratchGui.tw;
        const isAdvanced = !!(tw && tw.isAdvancedMode);
        advancedBadge.hidden = !isAdvanced;
        if (!prefSyncEnabled) {
            document.documentElement.removeAttribute("data-glow-advanced-mode");
            return;
        }
        if (isAdvanced) {
            document.documentElement.setAttribute("data-glow-advanced-mode", "1");
        } else {
            document.documentElement.removeAttribute("data-glow-advanced-mode");
        }
    };
    const syncThemeAttr = () => {
        const themeState = addon.tab.redux.state &&
            addon.tab.redux.state.scratchGui &&
            addon.tab.redux.state.scratchGui.theme;
        const theme = themeState && themeState.theme;
        const isDark = !!(theme && typeof theme.isDark === "function" && theme.isDark());
        document.documentElement.setAttribute("data-glow-theme", isDark ? "dark" : "light");
    };

    const hasRegularPref = () => {
        try {
            return localStorage.getItem("tw:theme") !== null ||
                localStorage.getItem("tw:language") !== null;
        } catch (_e) {
            return false;
        }
    };
    const hasAddonPref = () => {
        try {
            const raw = localStorage.getItem("tw:addons");
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return false;
            for (const key of Object.keys(parsed)) {
                if (key === "_") continue;
                const value = parsed[key];
                if (value && typeof value === "object" && Object.keys(value).length > 0) {
                    return true;
                }
            }
            return false;
        } catch (_e) {
            return false;
        }
    };
    const hasAdvancedPref = () => {
        const tw = addon.tab.redux.state &&
            addon.tab.redux.state.scratchGui &&
            addon.tab.redux.state.scratchGui.tw;
        if (!tw) return false;
        const co = tw.compilerOptions || {};
        const ro = tw.runtimeOptions || {};
        return tw.framerate !== GLOW_ADVANCED_DEFAULTS.framerate ||
            tw.interpolation !== GLOW_ADVANCED_DEFAULTS.interpolation ||
            tw.highQualityPen !== GLOW_ADVANCED_DEFAULTS.highQualityPen ||
            co.enabled !== GLOW_ADVANCED_DEFAULTS.compilerEnabled ||
            co.warpTimer !== GLOW_ADVANCED_DEFAULTS.warpTimer ||
            ro.maxClones !== GLOW_ADVANCED_DEFAULTS.maxClones ||
            ro.miscLimits !== GLOW_ADVANCED_DEFAULTS.miscLimits ||
            ro.fencing !== GLOW_ADVANCED_DEFAULTS.fencing;
    };
    const setFlag = (name, on) => {
        if (on) {
            document.documentElement.setAttribute(name, "1");
        } else {
            document.documentElement.removeAttribute(name);
        }
    };
    const syncPrefAttrs = () => {
        if (!prefSyncEnabled) return;
        const regular = hasRegularPref();
        const advanced = hasAdvancedPref();
        const addons = hasAddonPref();
        setFlag("data-glow-pref-regular", regular);
        setFlag("data-glow-pref-advanced", advanced);
        setFlag("data-glow-pref-addons", addons);
        setFlag("data-glow-pref-any", regular || advanced || addons);
    };

    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;
    const patchedSetItem = function (key, value) {
        const result = originalSetItem.call(this, key, value);
        if (this === window.localStorage && GLOW_PREF_KEYS.includes(key)) {
            syncPrefAttrs();
        }
        return result;
    };
    const patchedRemoveItem = function (key) {
        const result = originalRemoveItem.call(this, key);
        if (this === window.localStorage && GLOW_PREF_KEYS.includes(key)) {
            syncPrefAttrs();
        }
        return result;
    };
    Storage.prototype.setItem = patchedSetItem;
    Storage.prototype.removeItem = patchedRemoveItem;
    const onStorageEvent = e => {
        if (!e.key || GLOW_PREF_KEYS.includes(e.key)) syncPrefAttrs();
    };
    window.addEventListener("storage", onStorageEvent);

    syncAdvancedBadge();
    syncThemeAttr();
    syncPrefAttrs();
    addon.tab.redux.addEventListener("statechanged", () => {
        syncAdvancedBadge();
        syncThemeAttr();
        syncPrefAttrs();
    });

    const clearPrefAttrs = () => {
        document.documentElement.removeAttribute("data-glow-pref-regular");
        document.documentElement.removeAttribute("data-glow-pref-advanced");
        document.documentElement.removeAttribute("data-glow-pref-addons");
        document.documentElement.removeAttribute("data-glow-pref-any");
    };
    addon.self.addEventListener("disabled", () => {
        prefSyncEnabled = false;
        document.documentElement.removeAttribute("data-glow-theme");
        document.documentElement.removeAttribute("data-glow-advanced-mode");
        clearPrefAttrs();
    });
    addon.self.addEventListener("reenabled", () => {
        prefSyncEnabled = true;
        syncThemeAttr();
        syncPrefAttrs();
    });

    while (true) {
        const group = await addon.tab.waitForElement(
            "[class*='menu-bar_account-info-group']",
            {
                markAsSeen: true,
                reduxEvents: [
                    "scratch-gui/mode/SET_PLAYER",
                    "fontsLoaded/SET_FONTS_LOADED",
                    "scratch-gui/locales/SELECT_LOCALE"
                ]
            }
        );
        if (group.parentNode && !group.parentNode.querySelector(":scope > .glow-version-badge")) {
            group.parentNode.insertBefore(badge, group.nextSibling);
        }
    }
}
