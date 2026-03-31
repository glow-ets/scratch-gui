/**
 * Glow Lab Smoke Tests (issue #2)
 *
 * These tests verify the minimum viable dev workflow:
 *   1. The build output exists (build completed)
 *   2. The GUI loads in a headless browser without console errors
 *   3. The glow-lab extension can be found in the extension library
 *
 * Prerequisites: run `npm run build` before running these tests.
 * Usage: npm run test:smoke:glow
 */

import path from 'path';
import SeleniumHelper from '../helpers/selenium-helper';

const {
    clickText,
    clickXpath,
    findByText,
    findByXpath,
    getDriver,
    getLogs,
    loadUri,
    scope
} = new SeleniumHelper();

const uri = path.resolve(__dirname, '../../build/index.html');

let driver;

describe('Glow Lab smoke tests', () => {

    beforeAll(() => {
        driver = getDriver();
    });

    afterAll(async () => {
        if (driver) await driver.quit();
    });

    test('Build output exists and GUI loads without errors', async () => {
        await loadUri(uri);

        // The GUI should render the menu bar with the Glow Lab brand
        await findByXpath('//div[contains(@class, "menu-bar_menu-bar_")]');

        // No severe console errors
        const logs = await getLogs();
        expect(logs).toEqual([]);
    });

    test('Glow Lab extension appears in extension library', async () => {
        await loadUri(uri);

        // Open the extension library via the "Add Extension" button
        await clickXpath(
            '//button[contains(@class, "sprite-selector_add-button")]' +
            ' | //div[contains(@class, "blocks_blocks")]' +
            '//button[contains(@class, "addButton")]'
        );

        // Wait a moment for the library modal to appear, then look for Glow Lab
        await findByText('Glow Lab');

        const logs = await getLogs();
        expect(logs).toEqual([]);
    });

    test('Glow Lab extension can be loaded and block category appears', async () => {
        await loadUri(uri);

        // Open extension library
        await clickXpath(
            '//button[contains(@class, "sprite-selector_add-button")]' +
            ' | //div[contains(@class, "blocks_blocks")]' +
            '//button[contains(@class, "addButton")]'
        );

        // Click on the Glow Lab extension to load it
        await findByText('Glow Lab');
        await clickText('Glow Lab');

        // After loading, the extension category should appear in the blocks pane.
        // The extension's blocks should be accessible - look for one of the block opcodes.
        await findByText('glow say', scope.blocksTab);

        const logs = await getLogs();
        expect(logs).toEqual([]);
    });
});
