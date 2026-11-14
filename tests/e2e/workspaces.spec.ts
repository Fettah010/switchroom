import { expect, test } from '@playwright/test';
import {
  editedInput,
  fixturePath,
  loadPair,
  originalInput,
  playButton,
  skipAudioFlowOnWindowsWebkit,
} from './helpers';

test.describe('Switchroom v0.4.0 local workspaces and presentations', () => {
  test('E2E-WS-01 first visit shows Home and New comparison with no sample workspaces', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { level: 1, name: /Hear the difference/i }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New comparison' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import manifest' })).toBeVisible();
    await expect(page.getByText('No saved comparisons yet')).toBeVisible();
    // No fake sample workspaces
    await expect(page.locator('.workspace-card')).toHaveCount(0);
  });

  test('E2E-WS-02 creates workspace, edits metadata, survives reload and shows relink state', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');

    // 1. Create workspace
    await page.getByRole('button', { name: 'New comparison' }).click();
    await expect(page.locator('.metadata-editor__title-input')).toBeVisible();

    // 2. Edit metadata
    const titleInput = page.locator('.metadata-editor__title-input');
    await titleInput.fill('Vocals Revision 2');

    await page.getByRole('button', { name: /Edit details/i }).click();
    await page.locator('#workspace-desc').fill('Testing lead vocal EQ and presence');
    await page.locator('#workspace-notes').fill('Check 0:34 sibilance');

    await page.locator('#new-label-input').fill('vocal');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.metadata-editor__chip')).toHaveText('vocal');

    // Wait for save indicator
    await expect(page.locator('.save-status--saved')).toBeVisible();

    // 3. Load audio files
    await originalInput(page).setInputFiles(fixturePath('original.wav'));
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));
    await expect(playButton(page)).toBeEnabled();

    // Wait for auto-save after media descriptors updated
    await page.waitForTimeout(700);

    // 4. Return to Home
    await page.getByRole('button', { name: 'All comparisons' }).click();
    await expect(page.getByText('Vocals Revision 2')).toBeVisible();
    await expect(page.getByText('Testing lead vocal EQ and presence')).toBeVisible();
    await expect(page.locator('.workspace-card__chip')).toHaveText('vocal');

    // 5. Reload page (simulate closing browser and returning)
    await page.reload();
    await expect(page.getByText('Vocals Revision 2')).toBeVisible();

    // 6. Open workspace again
    await page.getByRole('button', { name: 'Open comparison Vocals Revision 2' }).click();

    // Relink notice must be visible because files are not stored
    await expect(page.locator('.relink-notice')).toBeVisible();
    await expect(page.locator('.relink-notice__title')).toHaveText(
      'Audio files must be selected again',
    );
    await expect(page.locator('.dropzone')).toHaveCount(2);
    await expect(playButton(page)).toBeDisabled();

    // 7. Relink files to resume comparison
    await originalInput(page).setInputFiles(fixturePath('original.wav'));
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));
    await expect(playButton(page)).toBeEnabled();
    await expect(page.locator('.relink-notice')).toHaveCount(0);
  });

  test('E2E-WS-03 switches presentation layouts and enters local client preview', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();
    await page.goto('/');
    await loadPair(page);

    const workspaceEl = page.locator('.workspace');
    await expect(workspaceEl).toHaveAttribute('data-layout', 'standard');

    // Switch to Waveform-focused layout
    await page.getByRole('radio', { name: /Waveform layout/i }).click();
    await expect(workspaceEl).toHaveAttribute('data-layout', 'waveform-focused');

    // Switch to Player-focused layout
    await page.getByRole('radio', { name: /Player layout/i }).click();
    await expect(workspaceEl).toHaveAttribute('data-layout', 'player-focused');

    // Switch to Compact review layout
    await page.getByRole('radio', { name: /Compact layout/i }).click();
    await expect(workspaceEl).toHaveAttribute('data-layout', 'compact-review');

    // Enter Client Preview
    await page.getByRole('button', { name: /Client preview/i }).click();
    await expect(page.locator('.client-preview__banner')).toBeVisible();
    await expect(page.getByText('Local preview — this view has not been shared')).toBeVisible();

    // Read-only slots (no file replace/remove buttons)
    await expect(page.locator('.slot--readonly')).toHaveCount(2);
    await expect(page.locator('.slot__actions')).toHaveCount(0);

    // Audio player remains fully functional in preview
    await playButton(page).click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    // Exit preview returns to editor
    await page.getByRole('button', { name: 'Exit preview' }).click();
    await expect(page.locator('.client-preview__banner')).toHaveCount(0);
    await expect(page.getByLabel('Comparison title')).toBeVisible();
  });

  test('E2E-WS-04 exports manifest and verifies no audio data or credentials inside', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New comparison' }).click();

    await page.locator('.metadata-editor__title-input').fill('Export Verification Session');
    await page.waitForTimeout(600);

    // Trigger export and catch download
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export manifest/i }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('export-verification-session.switchroom.json');
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const content = Buffer.concat(chunks).toString('utf-8');
    const json = JSON.parse(content);

    expect(json.app).toBe('switchroom');
    expect(json.manifestVersion).toBe(1);
    expect(json.workspace.title).toBe('Export Verification Session');
    // Ensure no audio bytes or secrets exist
    expect(json.workspace.audioBuffer).toBeUndefined();
    expect(json.workspace.blob).toBeUndefined();
    expect(json.workspace.file).toBeUndefined();
    expect(json.workspace.token).toBeUndefined();
  });

  test('E2E-WS-05 settings modal manages defaults and clears local data with confirmation', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New comparison' }).click();
    await page.locator('.metadata-editor__title-input').fill('To Be Cleared');
    await page.waitForTimeout(600);

    // Go Home
    await page.getByRole('button', { name: 'All comparisons' }).click();
    await expect(page.getByText('To Be Cleared')).toBeVisible();

    // Open Settings
    await page.locator('.topbar-settings-btn').click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();

    // Clear local data
    await page.getByRole('button', { name: 'Clear local workspaces' }).click();
    await expect(page.getByText('Are you sure? This deletes saved workspaces')).toBeVisible();

    await page.getByRole('button', { name: 'Yes, clear local data' }).click();

    // Back to clean Home with no workspaces
    await expect(page.getByText('No saved comparisons yet')).toBeVisible();
    await expect(page.getByText('To Be Cleared')).toHaveCount(0);
  });

  test('E2E-WS-06 asserts no private data or audio payloads leave the browser', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();
    const remoteRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      // Ignore static bundle asset fetches from localhost/dev server and local blobs/data
      if (
        !url.startsWith('http://localhost') &&
        !url.startsWith('http://127.0.0.1') &&
        !url.startsWith('blob:') &&
        !url.startsWith('data:')
      ) {
        remoteRequests.push(url);
      }
    });

    await page.goto('/');
    await loadPair(page);
    await playButton(page).click();
    await page.waitForTimeout(500);

    expect(remoteRequests).toEqual([]);
  });
});
