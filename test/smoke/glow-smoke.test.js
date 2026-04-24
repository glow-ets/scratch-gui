/**
 * Glow Lab Smoke Tests 
 *
 * These tests verify the minimum viable dev workflow:
 *   1. The build output exists (build completed)
 *   2. The GUI loads in a headless browser without console errors
 *   3. The glow-lab extension can be found and selected in the extension library
 *
 * Prerequisites: run `npm run build` before running these tests.
 * Usage: npm run test:smoke:glow
 *
 * Note: The glow-lab extension is loaded via URL fetch (extensionURL), which
 * does not work under file:// protocol due to CORS. Block rendering tests
 * require an HTTP server and belong in integration tests. These smoke tests
 * verify the extension is discoverable and selectable in the library UI.
 */

import path from 'path';
import SeleniumHelper from '../helpers/selenium-helper';

const {
    clickXpath,
    findByText,
    findByXpath,
    getDriver,
    getLogs,
    loadUri
} = new SeleniumHelper();

const uri = path.resolve(__dirname, '../../build/editor.html');

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
        await clickXpath('//button[@title="Add Extension"]');

        // The library modal should show Glow Lab
        await findByText('Glow Lab');

        const logs = await getLogs();
        expect(logs).toEqual([]);
    });

    test('Selecting Glow Lab extension closes library modal', async () => {
        await loadUri(uri);

        // Open extension library
        await clickXpath('//button[@title="Add Extension"]');

        // Verify modal is open
        await findByXpath('//*[@class="ReactModalPortal"]//*[contains(text(), "Glow Lab")]');

        // Click Glow Lab extension card (scoped to modal to avoid menu bar title)
        await clickXpath(
            '//*[@class="ReactModalPortal"]//*[contains(text(), "Glow Lab")]'
        );

        // After clicking an extension, the library modal should close.
        // Verify modal content is gone (the extension library title "Choose an Extension").
        await driver.wait(async () => {
            const modals = await driver.findElements({xpath: '//*[@class="ReactModalPortal"]//h2'});
            return modals.length === 0;
        }, 5000, 'Extension library modal did not close after selecting Glow Lab');

        // Note: Block rendering cannot be verified under file:// protocol because
        // the extension JS is loaded via fetch (CORS restriction). This is tested
        // in integration tests with an HTTP server.
    });
});
