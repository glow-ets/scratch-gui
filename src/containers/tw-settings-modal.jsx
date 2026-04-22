import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import locales from '@turbowarp/scratch-l10n';
import {closeSettingsModal} from '../reducers/modals';
import {resetAdvanced} from '../reducers/tw';
import {selectLocaleWithoutPersist} from '../reducers/locales';
import {setTheme} from '../reducers/theme';
import {detectLocale} from '../lib/detect-locale.js';
import {systemPreferencesTheme} from '../lib/themes/themePersistance.js';
import SettingsModalComponent from '../components/tw-settings-modal/settings-modal.jsx';
import SettingsStore from '../addons/settings-store-singleton';
import {defaultStageSize} from '../reducers/custom-stage-size';

const messages = defineMessages({
    newFramerate: {
        defaultMessage: 'New framerate:',
        description: 'Prompt shown to choose a new framerate',
        id: 'tw.menuBar.newFramerate'
    },
    resetAllConfirm: {
        // eslint-disable-next-line max-len
        defaultMessage: 'Reset all regular and advanced settings to defaults? Addons will be left alone.',
        description: 'Confirmation prompt shown before Reset all settings runs',
        id: 'tw.settingsModal.resetAllConfirm'
    }
});

class UsernameModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleFramerateChange',
            'handleCustomizeFramerate',
            'handleHighQualityPenChange',
            'handleInterpolationChange',
            'handleInfiniteClonesChange',
            'handleRemoveFencingChange',
            'handleRemoveLimitsChange',
            'handleWarpTimerChange',
            'handleStageWidthChange',
            'handleStageHeightChange',
            'handleDisableCompilerChange',
            'handleStoreProjectOptions',
            'handleResetAll'
        ]);
    }
    handleFramerateChange (e) {
        this.props.vm.setFramerate(e.target.checked ? 60 : 30);
    }
    async handleCustomizeFramerate () {
        // prompt() returns Promise in desktop app
        // eslint-disable-next-line no-alert
        const newFramerate = await prompt(this.props.intl.formatMessage(messages.newFramerate), this.props.framerate);
        const parsed = parseFloat(newFramerate);
        if (isFinite(parsed)) {
            this.props.vm.setFramerate(parsed);
        }
    }
    handleHighQualityPenChange (e) {
        this.props.vm.renderer.setUseHighQualityRender(e.target.checked);
    }
    handleInterpolationChange (e) {
        this.props.vm.setInterpolation(e.target.checked);
    }
    handleInfiniteClonesChange (e) {
        this.props.vm.setRuntimeOptions({
            maxClones: e.target.checked ? Infinity : 300
        });
    }
    handleRemoveFencingChange (e) {
        this.props.vm.setRuntimeOptions({
            fencing: !e.target.checked
        });
    }
    handleRemoveLimitsChange (e) {
        this.props.vm.setRuntimeOptions({
            miscLimits: !e.target.checked
        });
    }
    handleWarpTimerChange (e) {
        this.props.vm.setCompilerOptions({
            warpTimer: e.target.checked
        });
    }
    handleDisableCompilerChange (e) {
        this.props.vm.setCompilerOptions({
            enabled: !e.target.checked
        });
    }
    handleStageWidthChange (value) {
        this.props.vm.setStageSize(value, this.props.customStageSize.height);
    }
    handleStageHeightChange (value) {
        this.props.vm.setStageSize(this.props.customStageSize.width, value);
    }
    handleStoreProjectOptions () {
        this.props.vm.storeProjectOptions();
    }
    // glow-ets/scratch-gui#19: clears regular (theme + language) and advanced
    // settings to a pristine state. Addon storage is intentionally untouched.
    handleResetAll () {
        // eslint-disable-next-line no-alert
        if (!window.confirm(this.props.intl.formatMessage(messages.resetAllConfirm))) {
            return;
        }
        try { localStorage.removeItem('tw:theme'); } catch (_e) { /* ignore */ }
        try { localStorage.removeItem('tw:language'); } catch (_e) { /* ignore */ }
        this.props.onResetTheme();
        this.props.onResetLocale();
        this.props.onResetAdvanced();
        this.props.vm.setFramerate(30);
        this.props.vm.setInterpolation(false);
        if (this.props.vm.renderer && this.props.vm.renderer.setUseHighQualityRender) {
            this.props.vm.renderer.setUseHighQualityRender(false);
        }
        // Compiler defaults in the editor: warpTimer is ON (matches blocks.jsx
        // startup), and compiler-enabled follows the tw-disable-compiler addon
        // so Reset-all doesn't override a still-enabled addon.
        const compilerDisabledByAddon = SettingsStore.getAddonEnabled('tw-disable-compiler');
        this.props.vm.setCompilerOptions({
            enabled: !compilerDisabledByAddon,
            warpTimer: true
        });
        this.props.vm.setRuntimeOptions({maxClones: 300, miscLimits: true, fencing: true});
        this.props.vm.setStageSize(defaultStageSize.width, defaultStageSize.height);
    }
    render () {
        const {
            /* eslint-disable no-unused-vars */
            onClose,
            vm,
            /* eslint-enable no-unused-vars */
            ...props
        } = this.props;
        return (
            <SettingsModalComponent
                onClose={this.props.onClose}
                onFramerateChange={this.handleFramerateChange}
                onCustomizeFramerate={this.handleCustomizeFramerate}
                onHighQualityPenChange={this.handleHighQualityPenChange}
                onInterpolationChange={this.handleInterpolationChange}
                onInfiniteClonesChange={this.handleInfiniteClonesChange}
                onRemoveFencingChange={this.handleRemoveFencingChange}
                onRemoveLimitsChange={this.handleRemoveLimitsChange}
                onWarpTimerChange={this.handleWarpTimerChange}
                onStageWidthChange={this.handleStageWidthChange}
                onStageHeightChange={this.handleStageHeightChange}
                onDisableCompilerChange={this.handleDisableCompilerChange}
                stageWidth={this.props.customStageSize.width}
                stageHeight={this.props.customStageSize.height}
                customStageSizeEnabled={
                    this.props.customStageSize.width !== defaultStageSize.width ||
                    this.props.customStageSize.height !== defaultStageSize.height
                }
                onStoreProjectOptions={this.handleStoreProjectOptions}
                onResetAll={this.handleResetAll}
                {...props}
            />
        );
    }
}

UsernameModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func,
    vm: PropTypes.shape({
        renderer: PropTypes.shape({
            setUseHighQualityRender: PropTypes.func
        }),
        setFramerate: PropTypes.func,
        setCompilerOptions: PropTypes.func,
        setInterpolation: PropTypes.func,
        setRuntimeOptions: PropTypes.func,
        setStageSize: PropTypes.func,
        storeProjectOptions: PropTypes.func
    }),
    isEmbedded: PropTypes.bool,
    framerate: PropTypes.number,
    highQualityPen: PropTypes.bool,
    interpolation: PropTypes.bool,
    infiniteClones: PropTypes.bool,
    removeFencing: PropTypes.bool,
    removeLimits: PropTypes.bool,
    warpTimer: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    disableCompiler: PropTypes.bool,
    onResetTheme: PropTypes.func,
    onResetLocale: PropTypes.func,
    onResetAdvanced: PropTypes.func
};

const mapStateToProps = state => {
    const framerate = state.scratchGui.tw.framerate;
    const highQualityPen = state.scratchGui.tw.highQualityPen;
    const interpolation = state.scratchGui.tw.interpolation;
    const infiniteClones = state.scratchGui.tw.runtimeOptions.maxClones === Infinity;
    const removeFencing = !state.scratchGui.tw.runtimeOptions.fencing;
    const removeLimits = !state.scratchGui.tw.runtimeOptions.miscLimits;
    const warpTimer = state.scratchGui.tw.compilerOptions.warpTimer;
    const customStageSize = state.scratchGui.customStageSize;
    const disableCompiler = !state.scratchGui.tw.compilerOptions.enabled;
    // glow-ets/scratch-gui#19: effective defaults differ from the reducer's
    // initialState in the editor — blocks.jsx dispatches warpTimer=true at
    // mount, and the compiler-enabled default tracks the tw-disable-compiler
    // addon. Use these same defaults in the nonDefault comparison so the pink
    // marker matches what Reset-settings actually restores.
    const isEditor = !state.scratchGui.mode.isEmbedded && !state.scratchGui.mode.isPlayerOnly;
    const editorWarpTimerDefault = isEditor;
    const editorDisableCompilerDefault = SettingsStore.getAddonEnabled('tw-disable-compiler');
    return {
        vm: state.scratchGui.vm,
        isEmbedded: state.scratchGui.mode.isEmbedded,
        framerate,
        highQualityPen,
        interpolation,
        infiniteClones,
        removeFencing,
        removeLimits,
        warpTimer,
        customStageSize,
        disableCompiler,
        nonDefault: {
            framerate: framerate !== 30,
            highQualityPen,
            interpolation,
            infiniteClones,
            removeFencing,
            removeLimits,
            warpTimer: warpTimer !== editorWarpTimerDefault,
            disableCompiler: disableCompiler !== editorDisableCompilerDefault,
            customStageSize:
                customStageSize.width !== defaultStageSize.width ||
                customStageSize.height !== defaultStageSize.height
        }
    };
};

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeSettingsModal()),
    // glow-ets/scratch-gui#19: Reset-all wiring. The container clears the
    // localStorage keys before dispatching, so these actions do NOT re-persist.
    onResetTheme: () => dispatch(setTheme(systemPreferencesTheme())),
    onResetLocale: () => dispatch(selectLocaleWithoutPersist(detectLocale(Object.keys(locales)))),
    onResetAdvanced: () => dispatch(resetAdvanced())
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(UsernameModal));
