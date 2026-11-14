import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CloudDashboardModal } from './CloudDashboardModal';
import { CloudProjectProvider } from './CloudProjectContext';
import { PreferencesProvider } from '../../app/providers/PreferencesProvider';
import { WorkspaceProvider } from '../../app/providers/WorkspaceProvider';
import { PlayerProvider } from '../../app/providers/PlayerProvider';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import * as cloudApi from '../../lib/api/cloudApi';
import type { CloudProject } from './cloudTypes';

vi.mock('../../lib/api/cloudApi', () => ({
  getAuthProviders: vi
    .fn()
    .mockResolvedValue({ guest: true, github: false, google: false, authAvailable: false }),
  getCurrentUser: vi.fn().mockResolvedValue(null),
  listUserProjects: vi.fn().mockResolvedValue([]),
  listBatchProjects: vi.fn().mockResolvedValue([]),
  deleteCloudProject: vi.fn().mockResolvedValue({ success: true }),
  claimGuestProject: vi.fn().mockResolvedValue({ success: true }),
  getPlaybackInfo: vi.fn().mockResolvedValue({
    playbackUrl: 'https://mock-r2/audio.wav',
    role: 'original',
    filename: 'track.wav',
    mimeType: 'audio/wav',
    sizeBytes: 1024,
    expiresAt: Date.now() + 3600000,
  }),
}));

const mockProjects: CloudProject[] = [
  {
    id: 'proj_ready',
    title: 'Acoustic Master V1',
    description: '',
    status: 'ready',
    visibility: 'private',
    retention_days: 30,
    crossfade_ms: 180,
    presentation_layout: 'standard',
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 86400000,
    expires_at: Date.now() + 29 * 86400000,
    isGuestOwned: true,
    assets: {
      original: { role: 'original', filename: 'orig.wav', size_bytes: 12000000, status: 'ready' },
      edited: { role: 'edited', filename: 'edit.wav', size_bytes: 12500000, status: 'ready' },
    },
  },
  {
    id: 'proj_draft',
    title: 'Unfinished Comparison',
    description: '',
    status: 'draft',
    visibility: 'private',
    retention_days: 7,
    crossfade_ms: 180,
    presentation_layout: 'standard',
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 86400000,
    expires_at: Date.now() + 6 * 86400000,
    isGuestOwned: true,
    assets: {
      original: { role: 'original', filename: 'orig.wav', size_bytes: 10000000, status: 'ready' },
      edited: null,
    },
  },
];

describe('CloudDashboardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(
      'sw_guest_projects',
      JSON.stringify([
        { id: 'proj_ready', title: 'Acoustic Master V1', createdAt: Date.now() },
        { id: 'proj_draft', title: 'Unfinished Comparison', createdAt: Date.now() },
      ]),
    );
    vi.mocked(cloudApi.listBatchProjects).mockResolvedValue(mockProjects);
  });

  function renderModal(onClose = vi.fn()) {
    const repo = new InMemoryWorkspaceRepository();
    return render(
      <PlayerProvider>
        <PreferencesProvider>
          <WorkspaceProvider customRepository={repo}>
            <CloudProjectProvider>
              <CloudDashboardModal isOpen={true} onClose={onClose} />
            </CloudProjectProvider>
          </WorkspaceProvider>
        </PreferencesProvider>
      </PlayerProvider>,
    );
  }

  it('renders dashboard with project list and status pills', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Acoustic Master V1')).toBeDefined();
    });

    expect(screen.getByText('ready')).toBeDefined();
    expect(screen.getByText('Unfinished Comparison')).toBeDefined();
    expect(screen.getByText('draft')).toBeDefined();
    expect(screen.getAllByText(/orig\.wav/).length).toBeGreaterThan(0);
  });

  it('allows deleting a project with confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Acoustic Master V1')).toBeDefined();
    });

    const deleteBtns = screen.getAllByTitle('Delete project');
    expect(deleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(deleteBtns[0]!);

    await waitFor(() => {
      expect(cloudApi.deleteCloudProject).toHaveBeenCalledWith('proj_ready');
    });
  });

  it('allows opening a ready project in the editor', async () => {
    const onClose = vi.fn();
    renderModal(onClose);

    await waitFor(() => {
      expect(screen.getByText('Acoustic Master V1')).toBeDefined();
    });

    const openBtns = screen.getAllByRole('button', { name: /open/i });
    expect(openBtns.length).toBeGreaterThan(0);
    const readyOpenBtn = openBtns[0]!;
    expect(readyOpenBtn.hasAttribute('disabled')).toBe(false);

    fireEvent.click(readyOpenBtn);

    await waitFor(() => {
      expect(cloudApi.getPlaybackInfo).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
