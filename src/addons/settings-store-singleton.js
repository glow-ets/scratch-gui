import SettingsStore from './settings-store';

const settingStore = new SettingsStore();
const urlParameters = new URLSearchParams(location.search);
if (urlParameters.has('addons')) {
    settingStore.parseUrlParameter(urlParameters.get('addons'));
} else {
    settingStore.readLocalStorage();
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
