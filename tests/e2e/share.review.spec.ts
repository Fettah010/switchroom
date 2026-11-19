// Switchroom v0.6.0: client sharing and guest review pages.
//
// These specs seed a cloud project through the real local Worker API (guest
// project, direct-to-mock-R2 uploads, finalization, link creation) and then
// exercise the guest review page exactly as a client would: open the share
// link, play both versions, seek and switch — no account anywhere.
import { readFileSync } from 'node:fs';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { fixturePath, skipAudioFlowOnWindowsWebkit, setSliderValue } from './helpers';

const API = 'http://127.0.0.1:4173';

async function createProject(
  request: APIRequestContext,
): Promise<{ id: string; guestCapability: string }> {
  const res = await request.post(`${API}/api/projects`, {
    data: { title: 'E2E Review Project' },
  });
  expect(res.ok(), `project creation: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as {
    project: { id: string };
    guestCapability: string;
  };
  return { id: body.project.id, guestCapability: body.guestCapability };
}

async function seedGuestOwner(
  page: import('@playwright/test').Page,
  project: { id: string; guestCapability: string },
): Promise<void> {
  await page.context().addCookies([
    {
      name: `sw_owner_${project.id}`,
      value: project.guestCapability,
      url: API,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.addInitScript(
    ({ id, title }) => {
      window.localStorage.setItem(
        'sw_guest_projects',
        JSON.stringify([{ id, title, createdAt: Date.now() }]),
      );
    },
    { id: project.id, title: 'E2E Review Project' },
  );
}

async function uploadAndFinalize(
  request: APIRequestContext,
  projectId: string,
  role: 'original' | 'edited',
  name: string,
): Promise<void> {
  const file = readFileSync(fixturePath(name));
  const init = await request.post(`${API}/api/uploads/init`, {
    data: {
      projectId,
      role,
      filename: name,
      sizeBytes: file.length,
      mimeType: 'audio/wav',
    },
  });
  expect(init.ok(), `upload init for ${role}`).toBeTruthy();
  const { uploadUrl, uploadSessionId } = (await init.json()) as {
    uploadUrl: string;
    uploadSessionId: string;
  };
  const put = await request.put(uploadUrl, {
    data: file,
    headers: { 'Content-Type': 'audio/wav' },
  });
  expect(put.ok(), `direct PUT for ${role}`).toBeTruthy();
  const complete = await request.post(`${API}/api/uploads/${uploadSessionId}/complete`);
  expect(complete.ok(), `upload complete for ${role}`).toBeTruthy();
}

async function createPrimaryLink(request: APIRequestContext, projectId: string): Promise<string> {
  const res = await request.post(`${API}/api/projects/${projectId}/links`, {
    data: { kind: 'primary' },
  });
  expect(res.ok()).toBeTruthy();
  const { url } = (await res.json()) as { url: string };
  expect(url).toMatch(/^https?:\/\/.*\/review\/shr_/);
  return url;
}

async function setVisibility(
  request: APIRequestContext,
  projectId: string,
  visibility: 'public' | 'unlisted' | 'private',
): Promise<void> {
  const res = await request.patch(`${API}/api/projects/${projectId}/sharing`, {
    data: { visibility },
  });
  expect(res.ok(), `set visibility to ${visibility}`).toBeTruthy();
}

test.describe('Switchroom v0.6.0 Client Sharing and Guest Review', () => {
  test('E2E-SHARE-01: guest client plays both versions through a share link', async ({
    page,
    request,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    // 1. Creator creates a guest cloud project through the real API.
    const project = await createProject(request);
    await setVisibility(request, project.id, 'unlisted');

    // 2. Upload both assets directly to storage and finalize them.
    await uploadAndFinalize(request, project.id, 'original', 'original.wav');
    await uploadAndFinalize(request, project.id, 'edited', 'edited.wav');

    // 3. Create a primary review link.
    const shareUrl = await createPrimaryLink(request, project.id);

    // 4. Client opens the link — no account, no signup.
    await page.goto(shareUrl);

    // 5. Review page shows project metadata and the player.
    await expect(page.getByRole('heading', { name: 'E2E Review Project' })).toBeVisible();
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(play).toBeEnabled({ timeout: 20_000 });

    // 6. Play, seek and switch versions.
    await play.click();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();

    await setSliderValue(page, 'Timeline', 1);
    await expect(page.locator('.timeline__times .time').first()).not.toHaveText('0:00');

    await page.getByRole('button', { name: 'Edited', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edited', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await setVisibility(request, project.id, 'public');
    const indexing = await request.patch(`${API}/api/projects/${project.id}/sharing`, {
      data: { public_indexing_enabled: true },
    });
    expect(indexing.ok()).toBeTruthy();
    const indexableResponse = await page.reload();
    expect(await indexableResponse?.headerValue('x-robots-tag')).toBeNull();
  });

  test('E2E-SHARE-02: an unknown or revoked link shows a safe unavailable screen', async ({
    page,
    request,
  }) => {
    // Unknown token.
    await page.goto(`${API}/review/not-a-real-token`);
    await expect(page.getByText('This review link is no longer available')).toBeVisible();
    await expect(page.getByText(/invalid, has been revoked, or has expired/)).toBeVisible();

    // Revoked link.
    const project = await createProject(request);
    await setVisibility(request, project.id, 'unlisted');
    await uploadAndFinalize(request, project.id, 'original', 'original.wav');
    await uploadAndFinalize(request, project.id, 'edited', 'edited.wav');
    const shareUrl = await createPrimaryLink(request, project.id);
    const { link } = (await (
      await request.post(`${API}/api/projects/${project.id}/links`, { data: { kind: 'primary' } })
    ).json()) as { link: { id: string } };
    await request.delete(`${API}/api/projects/${project.id}/links/${link.id}`);

    await page.goto(shareUrl);
    await expect(page.getByText('This review link is no longer available')).toBeVisible();
  });

  test('E2E-SHARE-03: creator can open the share dialog and create/copy a link', async ({
    page,
    request,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    const project = await createProject(request);
    await seedGuestOwner(page, project);
    await setVisibility(request, project.id, 'unlisted');
    await uploadAndFinalize(request, project.id, 'original', 'original.wav');
    await uploadAndFinalize(request, project.id, 'edited', 'edited.wav');

    await page.goto('/');
    await page.getByRole('button', { name: /cloud projects/i }).click();
    const dashboard = page.getByRole('dialog', { name: /private cloud projects/i });
    await expect(dashboard).toBeVisible();

    await expect(dashboard.getByText('E2E Review Project')).toBeVisible();
    await dashboard.getByRole('button', { name: /share/i }).click();

    const shareDialog = page.getByRole('dialog', { name: /share review link/i });
    await expect(shareDialog).toBeVisible();

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await shareDialog.getByRole('button', { name: /create primary link/i }).click();
    const linkInput = shareDialog.locator('.share-link__url-input');
    await expect(linkInput).toHaveValue(/\/review\/shr_/);
    await shareDialog.getByRole('button', { name: 'Copy link' }).click();
    await expect(shareDialog.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/review\/shr_/);

    await shareDialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(shareDialog).not.toBeVisible();
  });
});
