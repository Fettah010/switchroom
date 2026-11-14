import { test, expect } from '@playwright/test';
import { editedInput, fixturePath, originalInput, skipAudioFlowOnWindowsWebkit } from './helpers';

test.describe('Switchroom v0.5.0 Private Cloud Projects and Creator Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear localStorage to start clean
    await page.evaluate(() => localStorage.clear());
  });

  test('E2E-CLOUD-01: local comparison remains 100% functional without login or cloud services', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    // Verify local-only badge is prominently displayed
    const localBadge = page.locator('.local-badge');
    await expect(localBadge).toBeVisible();
    await expect(localBadge).toContainText('Local-only');

    // Create a local comparison
    await page.getByRole('button', { name: /new comparison/i }).click();

    // Load original and edited audio
    await originalInput(page).setInputFiles(fixturePath('original.wav'));
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));

    // Verify local playback is ready
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  });

  test('E2E-CLOUD-02: creator can open cloud dashboard and inspect account/guest state', async ({
    page,
  }) => {
    // Top bar has Cloud Projects button
    const cloudBtn = page.getByRole('button', { name: /cloud projects/i });
    await expect(cloudBtn).toBeVisible();

    await cloudBtn.click();

    // Modal opens
    const modal = page.getByRole('dialog', { name: /private cloud projects/i });
    await expect(modal).toBeVisible();

    // Shows guest mode notice when not logged in
    await expect(page.getByText(/guest mode/i)).toBeVisible();
    await expect(page.getByText(/no cloud projects found/i)).toBeVisible();

    // Close button dismisses modal
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });

  test('E2E-CLOUD-03: save to cloud modal presents project title, retention options, and file review', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    // Create comparison and load tracks
    await page.getByRole('button', { name: /new comparison/i }).click();
    await originalInput(page).setInputFiles(fixturePath('original.wav'));
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));

    // Open Save to cloud modal
    const saveCloudBtn = page.getByRole('button', { name: /save to cloud/i });
    await expect(saveCloudBtn).toBeVisible();
    await saveCloudBtn.click();

    const saveModal = page.getByRole('dialog', { name: /save to private cloud/i });
    await expect(saveModal).toBeVisible();

    // Verify retention presets
    await expect(saveModal.getByRole('button', { name: '1 day' })).toBeVisible();
    await expect(saveModal.getByRole('button', { name: '7 days' })).toBeVisible();
    await expect(saveModal.getByRole('button', { name: '14 days' })).toBeVisible();
    await expect(saveModal.getByRole('button', { name: '30 days' })).toBeVisible();
    await expect(saveModal.getByRole('button', { name: '60 days' })).toBeVisible();
    await expect(saveModal.getByRole('button', { name: '90 days' })).toBeVisible();

    // Default retention is 30 days
    const day30Btn = saveModal.getByRole('button', { name: '30 days' });
    await expect(day30Btn).toHaveClass(/pill-btn--active/);

    // Switch retention to 7 days
    const day7Btn = saveModal.getByRole('button', { name: '7 days' });
    await day7Btn.click();
    await expect(day7Btn).toHaveClass(/pill-btn--active/);
    await expect(day30Btn).not.toHaveClass(/pill-btn--active/);

    // Verify both files are displayed in the review list
    await expect(saveModal.getByText(/original\.wav/)).toBeVisible();
    await expect(saveModal.getByText(/edited\.wav/)).toBeVisible();

    // Verify guest mode explainer
    await expect(saveModal.getByText(/guest creator/i)).toBeVisible();

    // Cancel closes modal
    await saveModal.getByRole('button', { name: 'Cancel' }).click();
    await expect(saveModal).not.toBeVisible();
  });

  test('E2E-CLOUD-04: direct upload completes, verifies, and displays guest recovery link', async ({
    page,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    // Mock the /api/* endpoints so this test is completely hermetic
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            project: {
              id: 'proj_e2e_test',
              title: 'Hermetic Cloud Project',
              status: 'uploading',
              visibility: 'private',
              retention_days: 30,
              crossfade_ms: 180,
              presentation_layout: 'standard',
              created_at: Date.now(),
              updated_at: Date.now(),
              expires_at: Date.now() + 30 * 86400000,
            },
            guestCapability:
              'sw_owner_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
            recoveryUrl:
              'http://127.0.0.1:4173/#owner=sw_owner_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef&project=proj_e2e_test',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/uploads/init', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          uploadSessionId: 'upsess_mock_123',
          uploadUrl: 'http://127.0.0.1:4173/api/mock-r2-upload',
          objectKey: 'projects/proj_e2e_test/asset.audio',
          role: 'original',
          expiresAt: Date.now() + 1800000,
        }),
      });
    });

    await page.route('**/api/mock-r2-upload', async (route) => {
      await route.fulfill({ status: 200 });
    });

    await page.route('**/api/uploads/*/complete', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          projectStatus: 'ready',
        }),
      });
    });

    // Create comparison and load tracks
    await page.getByRole('button', { name: /new comparison/i }).click();
    await originalInput(page).setInputFiles(fixturePath('original.wav'));
    await editedInput(page).setInputFiles(fixturePath('edited.wav'));

    // Open save modal
    await page.getByRole('button', { name: /save to cloud/i }).click();
    const saveModal = page.getByRole('dialog', { name: /save to private cloud/i });
    await expect(saveModal).toBeVisible();

    // Set title
    const titleInput = saveModal.locator('#cloud-project-title');
    await titleInput.fill('Hermetic Cloud Project');

    // Click start upload
    const startBtn = saveModal.getByRole('button', { name: /start cloud upload/i });
    await startBtn.click();

    // Verify success view appears with recovery card
    await expect(saveModal.getByText(/project saved to private cloud/i)).toBeVisible();
    await expect(saveModal.getByText(/save your project-owner link/i)).toBeVisible();

    const recoveryInput = saveModal.locator('.recovery-input');
    await expect(recoveryInput).toHaveValue(/#owner=sw_owner_/);

    const copyBtn = saveModal.getByRole('button', { name: /copy link/i });
    await expect(copyBtn).toBeVisible();

    // Finish
    await saveModal.getByRole('button', { name: 'Done' }).click();
    await expect(saveModal).not.toBeVisible();
  });

  test('E2E-CLOUD-05: owner recovery link with URL fragment strips secret on load', async ({
    page,
  }) => {
    // Mock owner-access exchange
    await page.route('**/api/projects/proj_fragment_test/owner-access', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          project: {
            id: 'proj_fragment_test',
            title: 'Restored Guest Project',
            status: 'ready',
            visibility: 'private',
            retention_days: 30,
            crossfade_ms: 180,
            presentation_layout: 'standard',
            created_at: Date.now(),
            updated_at: Date.now(),
            expires_at: Date.now() + 30 * 86400000,
            assets: { original: null, edited: null },
          },
        }),
      });
    });

    await page.route('**/api/projects/batch', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [
            {
              id: 'proj_fragment_test',
              title: 'Restored Guest Project',
              status: 'ready',
              visibility: 'private',
              retention_days: 30,
              created_at: Date.now(),
              updated_at: Date.now(),
              expires_at: Date.now() + 30 * 86400000,
              crossfade_ms: 180,
              presentation_layout: 'standard',
              assets: { original: null, edited: null },
            },
          ],
        }),
      });
    });

    // Navigate to application with secret fragment in URL
    const secretHash =
      '#owner=sw_owner_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef&project=proj_fragment_test';
    await page.goto(`/${secretHash}`);

    // Wait for the fragment exchange to happen and verify that the hash has been cleanly stripped!
    await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');

    // Dashboard opens to show restored project
    const dashboard = page.getByRole('dialog', { name: /private cloud projects/i });
    await expect(dashboard).toBeVisible();
    await expect(dashboard.getByText('Restored Guest Project')).toBeVisible();
  });
});
