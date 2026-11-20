import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SaveToCloudModal } from './SaveToCloudModal';
import { CloudProjectProvider } from './CloudProjectContext';
import { PreferencesProvider } from '../../app/providers/PreferencesProvider';
import { WorkspaceProvider } from '../../app/providers/WorkspaceProvider';
import { PlayerProvider } from '../../app/providers/PlayerProvider';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import { setLoadedFile, clearLoadedFiles } from '../../audio/mediaFileRegistry';
import * as cloudApi from '../../lib/api/cloudApi';
import * as multipartApi from '../../lib/api/multipartUpload';

vi.mock('../../lib/api/cloudApi', () => ({
  getAuthProviders: vi
    .fn()
    .mockResolvedValue({ guest: true, github: false, google: false, authAvailable: false }),
  getCurrentUser: vi.fn().mockResolvedValue(null),
  listUserProjects: vi.fn().mockResolvedValue([]),
  listBatchProjects: vi.fn().mockResolvedValue([]),
  createCloudProject: vi.fn().mockResolvedValue({
    project: {
      id: 'proj_new',
      title: 'New Cloud Project',
      status: 'uploading',
      expires_at: Date.now() + 30 * 86400000,
    },
    guestCapability: 'sw_owner_testsecret',
    recoveryUrl: 'http://localhost:5173/#owner=sw_owner_testsecret&project=proj_new',
  }),
  initUploadSession: vi.fn().mockResolvedValue({
    uploadSessionId: 'upsess_123',
    strategy: 'single_put',
    uploadUrl: 'https://mock-r2/upload',
    objectKey: 'projects/proj_new/asset.audio',
    role: 'original',
    expiresAt: Date.now() + 1800000,
  }),
  uploadFileToR2: vi.fn().mockResolvedValue(undefined),
  completeUploadSession: vi.fn().mockResolvedValue({ success: true, projectStatus: 'ready' }),
  cancelUploadSession: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('../../lib/api/multipartUpload', () => ({
  uploadFileMultipart: vi.fn().mockResolvedValue({
    parts: [{ partNumber: 1, etag: '"etag-1"' }],
  }),
}));

function makeMockAudioFile(name: string, sizeBytes: number): File {
  const buffer = new ArrayBuffer(Math.min(sizeBytes, 1024));
  return new File([buffer], name, { type: 'audio/wav' });
}

describe('SaveToCloudModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLoadedFiles();
  });

  function renderModal(onClose = vi.fn()) {
    const repo = new InMemoryWorkspaceRepository();
    return render(
      <PlayerProvider>
        <PreferencesProvider>
          <WorkspaceProvider customRepository={repo}>
            <CloudProjectProvider>
              <SaveToCloudModal isOpen={true} onClose={onClose} />
            </CloudProjectProvider>
          </WorkspaceProvider>
        </PreferencesProvider>
      </PlayerProvider>,
    );
  }

  it('renders modal and disables upload button when audio files are not loaded', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Save to private cloud' })).toBeDefined();
    expect(screen.getByText('No file selected in Slot A')).toBeDefined();
    expect(screen.getByText('No file selected in Slot B')).toBeDefined();

    const uploadBtn = screen.getByRole('button', { name: /start cloud upload/i });
    expect(uploadBtn.hasAttribute('disabled')).toBe(true);
  });

  it('routes files above threshold to multipart upload without arbitrary per-file cap rejection', async () => {
    const largeFile = makeMockAudioFile('large-stem.wav', 120 * 1024 * 1024);
    const normalFile = makeMockAudioFile('normal-stem.wav', 20 * 1024 * 1024);
    Object.defineProperty(largeFile, 'size', { value: 120 * 1024 * 1024 });

    setLoadedFile('original', largeFile);
    setLoadedFile('edited', normalFile);

    vi.mocked(cloudApi.initUploadSession).mockResolvedValueOnce({
      uploadSessionId: 'upsess_mp_1',
      strategy: 'multipart',
      partSize: 8 * 1024 * 1024,
      totalParts: 15,
      objectKey: 'projects/proj_new/orig.audio',
      role: 'original',
      expiresAt: Date.now() + 1800000,
    });

    renderModal();

    const uploadBtn = screen.getByRole('button', { name: /start cloud upload/i });
    expect(uploadBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(multipartApi.uploadFileMultipart).toHaveBeenCalled();
    });
  });

  it('allows retention picker selection between 1, 7, 14, 30, 60, 90 days', () => {
    renderModal();

    const day1Btn = screen.getByRole('button', { name: '1 day' });
    const day60Btn = screen.getByRole('button', { name: '60 days' });

    fireEvent.click(day60Btn);
    expect(day60Btn.className).toContain('pill-btn--active');
    expect(day1Btn.className).not.toContain('pill-btn--active');
  });

  it('uploads valid files, verifies assets, and displays recovery link for guests', async () => {
    const fileA = makeMockAudioFile('mix-orig.wav', 5 * 1024 * 1024);
    const fileB = makeMockAudioFile('mix-edit.wav', 5 * 1024 * 1024);

    setLoadedFile('original', fileA);
    setLoadedFile('edited', fileB);

    renderModal();

    const uploadBtn = screen.getByRole('button', { name: /start cloud upload/i });
    expect(uploadBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(cloudApi.createCloudProject).toHaveBeenCalledWith({
        title: 'Audio Comparison',
        retentionDays: 30,
        crossfadeMs: 180,
        presentationLayout: 'standard',
      });
      expect(cloudApi.initUploadSession).toHaveBeenCalledTimes(2);
      expect(cloudApi.uploadFileToR2).toHaveBeenCalledTimes(2);
      expect(cloudApi.completeUploadSession).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Save your project-owner link')).toBeDefined();
    });
  });
});
