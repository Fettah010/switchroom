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
    uploadUrl: 'https://mock-r2/upload',
    objectKey: 'projects/proj_new/asset.audio',
    role: 'original',
    expiresAt: Date.now() + 1800000,
  }),
  uploadFileToR2: vi.fn().mockResolvedValue(undefined),
  completeUploadSession: vi.fn().mockResolvedValue({ success: true, projectStatus: 'ready' }),
  cancelUploadSession: vi.fn().mockResolvedValue({ success: true }),
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

  it('rejects files exceeding 100 MB quota limit', () => {
    const hugeFile = makeMockAudioFile('huge-stem.wav', 105 * 1024 * 1024);
    const normalFile = makeMockAudioFile('normal-stem.wav', 20 * 1024 * 1024);
    Object.defineProperty(hugeFile, 'size', { value: 105 * 1024 * 1024 });

    setLoadedFile('original', hugeFile);
    setLoadedFile('edited', normalFile);

    renderModal();

    expect(screen.getByText('Exceeds 100 MB limit')).toBeDefined();
    const uploadBtn = screen.getByRole('button', { name: /start cloud upload/i });
    expect(uploadBtn.hasAttribute('disabled')).toBe(true);
  });

  it('allows retention picker selection between 1, 7, 14, 30, 60, 90 days', () => {
    renderModal();

    const day1Btn = screen.getByRole('button', { name: '1 day' });
    const day60Btn = screen.getByRole('button', { name: '60 days' });

    fireEvent.click(day60Btn);
    expect(day60Btn.className).toContain('pill-btn--active');
    expect(day1Btn.className).not.toContain('pill-btn--active');
  });

  it('completes direct upload and presents guest owner recovery link', async () => {
    const orig = makeMockAudioFile('orig.wav', 5 * 1024 * 1024);
    const edit = makeMockAudioFile('edit.wav', 5 * 1024 * 1024);
    setLoadedFile('original', orig);
    setLoadedFile('edited', edit);

    renderModal();

    const uploadBtn = screen.getByRole('button', { name: /start cloud upload/i });
    expect(uploadBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(uploadBtn);

    await waitFor(() => {
      expect(cloudApi.createCloudProject).toHaveBeenCalled();
      expect(cloudApi.initUploadSession).toHaveBeenCalled();
      expect(cloudApi.uploadFileToR2).toHaveBeenCalled();
      expect(cloudApi.completeUploadSession).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Save your project-owner link')).toBeDefined();
      expect(screen.getByRole('button', { name: /copy link/i })).toBeDefined();
    });
  });
});
