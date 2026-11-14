import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { FakeAudioHost } from '../../test/fakeAudioHost';
import { ABAudioEngine } from '../../audio/ABAudioEngine';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import { createDefaultWorkspace } from '../../workspaces/workspaceDefaults';

describe('HomePage and Recent Workspaces', () => {
  it('shows empty state when no saved workspaces exist', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const engine = new ABAudioEngine({ host: new FakeAudioHost() });

    render(
      <App
        engine={engine}
        customRepository={repo}
        initialViewMode="home"
        initialWorkspace={null}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /Hear the difference/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New comparison/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import manifest/i })).toBeInTheDocument();
    expect(screen.getByText(/No saved comparisons yet/i)).toBeInTheDocument();
  });

  it('lists existing saved workspaces with metadata and actions', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-mix-1');
    ws.title = 'Acoustic Guitar Revision';
    ws.description = 'Testing EQ cut at 250Hz';
    ws.labels = ['acoustic', 'guitar', 'eq'];
    ws.preferredCrossfadeMs = 240;
    ws.originalMedia = {
      fileName: 'guitar-raw.wav',
      extension: 'wav',
      mimeType: 'audio/wav',
      sizeBytes: 2000000,
      lastModified: Date.now(),
      durationSeconds: 45,
    };
    ws.editedMedia = {
      fileName: 'guitar-eq.wav',
      extension: 'wav',
      mimeType: 'audio/wav',
      sizeBytes: 2000000,
      lastModified: Date.now(),
      durationSeconds: 45,
    };
    await repo.create(ws);

    const engine = new ABAudioEngine({ host: new FakeAudioHost() });
    render(
      <App
        engine={engine}
        customRepository={repo}
        initialViewMode="home"
        initialWorkspace={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Acoustic Guitar Revision')).toBeInTheDocument();
    });
    expect(screen.getByText('Testing EQ cut at 250Hz')).toBeInTheDocument();
    expect(screen.getByText('acoustic')).toBeInTheDocument();
    expect(screen.getByText('guitar')).toBeInTheDocument();
    expect(screen.getByText('eq')).toBeInTheDocument();
    expect(screen.getByText(/240 ms crossfade/i)).toBeInTheDocument();
    expect(screen.getByText(/guitar-raw.wav vs guitar-eq.wav/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open comparison/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export manifest/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete comparison/i })).toBeInTheDocument();
  });

  it('opens a workspace when Open is clicked', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-open-me');
    ws.title = 'Vocal Compression Check';
    await repo.create(ws);

    const user = userEvent.setup();
    const engine = new ABAudioEngine({ host: new FakeAudioHost() });
    render(
      <App
        engine={engine}
        customRepository={repo}
        initialViewMode="home"
        initialWorkspace={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Vocal Compression Check')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /Open comparison Vocal Compression Check/i }),
    );

    // Should now be in workspace editor
    await waitFor(() => {
      expect(screen.getByDisplayValue('Vocal Compression Check')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /All comparisons/i })).toBeInTheDocument();
  });

  it('confirms and deletes a workspace when Delete is clicked', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-delete-me');
    ws.title = 'Old Master';
    await repo.create(ws);

    const user = userEvent.setup();
    const engine = new ABAudioEngine({ host: new FakeAudioHost() });
    render(
      <App
        engine={engine}
        customRepository={repo}
        initialViewMode="home"
        initialWorkspace={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Old Master')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Delete comparison Old Master/i }));
    expect(screen.getByText(/Delete metadata\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Confirm delete of Old Master/i }));
    await waitFor(() => {
      expect(screen.queryByText('Old Master')).not.toBeInTheDocument();
    });
    expect(await repo.getById('ws-delete-me')).toBeNull();
  });
});
