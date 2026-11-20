// Switchroom v0.7.0 E2E Tests: Client Feedback, Preferred Votes & Timestamped Comments
import { readFileSync } from 'node:fs';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { fixturePath, skipAudioFlowOnWindowsWebkit } from './helpers';

const API = 'http://127.0.0.1:4173';

async function createProject(
  request: APIRequestContext,
  feedbackEnabled = true,
): Promise<{ id: string; guestCapability: string }> {
  const res = await request.post(`${API}/api/projects`, {
    data: { title: 'Feedback E2E Project' },
  });
  expect(res.ok(), `project creation: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as {
    project: { id: string };
    guestCapability: string;
  };

  if (!feedbackEnabled) {
    const patchRes = await request.patch(`${API}/api/projects/${body.project.id}`, {
      headers: {
        Cookie: `sw_owner_${body.project.id}=${encodeURIComponent(body.guestCapability)}`,
      },
      data: { feedbackEnabled: false },
    });
    expect(
      patchRes.ok(),
      `disable feedback: ${patchRes.status()} ${await patchRes.text()}`,
    ).toBeTruthy();
  }

  return { id: body.project.id, guestCapability: body.guestCapability };
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

async function createPrimaryLink(request: APIRequestContext, projectId: string): Promise<string> {
  await setVisibility(request, projectId, 'unlisted');
  const res = await request.post(`${API}/api/projects/${projectId}/links`, {
    data: { kind: 'primary' },
  });
  expect(res.ok()).toBeTruthy();
  const { url } = (await res.json()) as { url: string };
  return url;
}

test.describe('Switchroom v0.7.0 Client Feedback & Preferred Voting', () => {
  test('E2E-FEEDBACK-01: guest votes for preferred version and changes vote', async ({
    page,
    request,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    const project = await createProject(request, true);
    await uploadAndFinalize(request, project.id, 'original', 'original.wav');
    await uploadAndFinalize(request, project.id, 'edited', 'edited.wav');
    const shareUrl = await createPrimaryLink(request, project.id);

    await page.goto(shareUrl);
    await expect(page.getByRole('heading', { name: 'Feedback E2E Project' })).toBeVisible();

    // Fill in display name if prompted
    const nameInput = page.getByPlaceholder(/Your name/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Client Bob');

    // Vote Original
    const voteGroup = page.getByRole('group', { name: 'Vote preferred version' });
    const origVoteBtn = voteGroup.getByRole('button', { name: /Original/i });
    await expect(origVoteBtn).toBeVisible();
    await origVoteBtn.click();

    // Verify button becomes pressed and count reflects vote
    await expect(origVoteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(origVoteBtn).toContainText('(1)');

    // Change vote to Edited
    const editVoteBtn = voteGroup.getByRole('button', { name: /Edited/i });
    await editVoteBtn.click();

    await expect(editVoteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(origVoteBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(editVoteBtn).toContainText('(1)');
    await expect(origVoteBtn).toContainText('(0)');
  });

  test('E2E-FEEDBACK-02: timestamped comment, seek on click, single-level reply, and deletion', async ({
    page,
    request,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    const project = await createProject(request, true);
    await uploadAndFinalize(request, project.id, 'original', 'original.wav');
    await uploadAndFinalize(request, project.id, 'edited', 'edited.wav');
    const shareUrl = await createPrimaryLink(request, project.id);

    await page.goto(shareUrl);
    await expect(page.getByRole('heading', { name: 'Feedback E2E Project' })).toBeVisible();

    // Fill display name
    const nameInput = page.getByPlaceholder(/Your name/i);
    await nameInput.fill('Client Bob');

    // Post a timestamped comment
    const commentInput = page.getByPlaceholder(/Leave a note/i);
    await commentInput.fill('Vocal clarity is noticeably improved here.');

    const postBtn = page.getByRole('button', { name: 'Post comment' });
    await postBtn.click();

    // Verify comment appears in the thread
    await expect(page.getByText('Vocal clarity is noticeably improved here.')).toBeVisible();
    await expect(page.getByText('Client Bob').first()).toBeVisible();

    // Verify timestamp pill is clickable for seek
    const timestampPill = page.locator('.comment-card__timestamp-btn').first();
    await expect(timestampPill).toBeVisible();
    await timestampPill.click();

    // Post single-level reply
    const replyBtn = page.getByRole('button', { name: /Reply/i }).first();
    await replyBtn.click();

    const replyInput = page.getByPlaceholder(/Reply to/i);
    await expect(replyInput).toBeVisible();
    await replyInput.fill('Glad the vocal clarity worked out!');

    const submitReplyBtn = page.getByRole('button', { name: 'Reply', exact: true });
    await submitReplyBtn.click();

    await expect(page.getByText('Glad the vocal clarity worked out!')).toBeVisible();

    // Delete comment
    page.on('dialog', (dialog) => dialog.accept());
    const deleteBtn = page.getByRole('button', { name: /Delete comment/i }).first();
    await deleteBtn.click();

    // Root comment body should become deleted indicator
    await expect(page.getByText('[Comment deleted]')).toBeVisible();
  });

  test('E2E-FEEDBACK-03: disabling feedback prevents voting and comments', async ({
    page,
    request,
  }) => {
    skipAudioFlowOnWindowsWebkit();

    // Create project with feedback disabled
    const project = await createProject(request, false);
    await uploadAndFinalize(request, project.id, 'original', 'original.wav');
    await uploadAndFinalize(request, project.id, 'edited', 'edited.wav');
    const shareUrl = await createPrimaryLink(request, project.id);

    await page.goto(shareUrl);
    await expect(page.getByRole('heading', { name: 'Feedback E2E Project' })).toBeVisible();

    // Notice should explain feedback is disabled
    await expect(
      page.getByText('Feedback and preference voting are disabled for this review.'),
    ).toBeVisible();

    // Voting buttons should be disabled
    const voteGroup = page.getByRole('group', { name: 'Vote preferred version' });
    const origVoteBtn = voteGroup.getByRole('button', { name: /Original/i });
    await expect(origVoteBtn).toBeDisabled();

    // Comment form should not be available
    await expect(page.getByPlaceholder(/Leave a note/i)).not.toBeVisible();
  });
});
