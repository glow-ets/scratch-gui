const VERSION = process.env.GLOW_VERSION || "?";
const COMMIT = process.env.GLOW_COMMIT_HASH || "?";

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

    const syncAdvancedBadge = () => {
        const tw = addon.tab.redux.state && addon.tab.redux.state.scratchGui && addon.tab.redux.state.scratchGui.tw;
        advancedBadge.hidden = !(tw && tw.isAdvancedMode);
    };
    const syncThemeAttr = () => {
        const themeState = addon.tab.redux.state &&
            addon.tab.redux.state.scratchGui &&
            addon.tab.redux.state.scratchGui.theme;
        const theme = themeState && themeState.theme;
        const isDark = !!(theme && typeof theme.isDark === "function" && theme.isDark());
        document.documentElement.setAttribute("data-glow-theme", isDark ? "dark" : "light");
    };

    syncAdvancedBadge();
    syncThemeAttr();
    addon.tab.redux.addEventListener("statechanged", () => {
        syncAdvancedBadge();
        syncThemeAttr();
    });

    addon.self.addEventListener("disabled", () => {
        document.documentElement.removeAttribute("data-glow-theme");
    });
    addon.self.addEventListener("reenabled", () => {
        syncThemeAttr();
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
