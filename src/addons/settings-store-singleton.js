import SettingsStore from './settings-store';

const settingStore = new SettingsStore();
const urlParameters = new URLSearchParams(location.search);
if (urlParameters.has('addons')) {
    settingStore.parseUrlParameter(urlParameters.get('addons'));
} else {
    settingStore.readLocalStorage();
}

// glow-ets/scratch-gui#21: ?dgw turns off the webcam for every extension, after
// ?addons= so that it applies even when that list does not name it. For this page
// only: nothing is saved, and the pupil can still switch it off in the settings.
if (urlParameters.has('dgw')) {
    settingStore.glowEnableFromUrl('glow-disable-webcam');
}

// Set initial glow mode from URL parameter or localStorage before addons load
try {
    const isAdvancedMode = urlParameters.has('advanced') ||
        localStorage.getItem('glow:advanced_mode') === 'true';
    settingStore.setGlowMode(isAdvancedMode);
} catch (e) {
    // ignore
}

export default settingStore;
