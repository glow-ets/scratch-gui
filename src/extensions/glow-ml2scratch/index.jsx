import React from 'react';
import {FormattedMessage} from 'react-intl';

import glowMl2scratchIconURL from './glow-ml2scratch.png';
import glowMl2scratchInsetIconURL from './glow-ml2scratch-small.png';

const translationMap = {
    'ja': {
        'gui.extension.glowMl2scratch.description': '機械学習を使う'
    },
    'ja-Hira': {
        'gui.extension.glowMl2scratch.description': 'きかいがくしゅうをつかう'
    }
};

const entry = {
    name: 'GlowML2Scratch',
    extensionId: 'glowMl2scratch',
    extensionURL: 'https://champierre.github.io/ml2scratch/ml2scratch.mjs',  // TODO fix
    collaborator: 'champierre',
    iconURL: glowMl2scratchIconURL,
    insetIconURL: glowMl2scratchInsetIconURL,
    description: (
        <FormattedMessage
            defaultMessage="Glow ML2Scratch Blocks."
            description="Description for GlowML2Scratch Blocks."
            id="gui.extension.glowMl2scratch.description"
        />
    ),
    featured: true,
    disabled: false,
    bluetoothRequired: false,
    internetConnectionRequired: true,
    helpLink: 'https://github.com/glow-ets/scratch-gui/',
    translationMap: translationMap
};

export {entry}; // loadable-extension needs this line.
export default entry;
