import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { FakeAudioHost } from '../../test/fakeAudioHost';
import { ABAudioEngine } from '../../audio/ABAudioEngine';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import { createDefaultWorkspace } from '../../workspaces/workspaceDefaults';

describe('WorkspaceEditor metadata and relinking', () => {
  it('displays relink notice when workspace has descriptors without loaded files', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-relink-test');
    ws.title = 'Stem Comparison';
    ws.originalMedia = {
      fileName: 'drums-dry.wav',
      extension: 'wav',
      mimeType: 'audio/wav',
      sizeBytes: 1048576,
      lastModified: Date.now(),
      durationSeconds: 15,
    };
    ws.editedMedia = {
      fileName: 'drums-compressed.wav',
      extension: 'wav',
      mimeType: 'audio/wav',
      sizeBytes: 1048576,
      lastModified: Date.now(),
      durationSeconds: 15,
    };
    await repo.create(ws);

    const engine = new ABAudioEngine({ host: new FakeAudioHost() });
    render(
      <App
        engine={engine}
        customRepository={repo}
        initialViewMode="editor"
        initialWorkspace={ws}
      />,
    );

    expect(screen.getByRole('region', { name: 'Audio relink notice' })).toBeInTheDocument();
    expect(screen.getByText('Audio files must be selected again')).toBeInTheDocument();
    expect(screen.getByText('drums-dry.wav')).toBeInTheDocument();
    expect(screen.getByText('drums-compressed.wav')).toBeInTheDocument();
  });

  it('edits title, description, notes, and labels and auto-saves', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-edit-test');
    ws.title = 'Initial Title';
    await repo.create(ws);

    const user = userEvent.setup();
    const engine = new ABAudioEngine({ host: new FakeAudioHost() });
    render(
      <App
        engine={engine}
        customRepository={repo}
        initialViewMode="editor"
        initialWorkspace={ws}
      />,
    );

    // Edit Title
    const titleInput = screen.getByLabelText('Comparison title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Revised Mix 2026');
    expect(titleInput).toHaveValue('Revised Mix 2026');

    // Toggle details
    await user.click(screen.getByRole('button', { name: /Edit details/i }));
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();

    // Edit description
    const descInput = screen.getByLabelText(/Description/i);
    await user.type(descInput, 'Checking bass clarity');

    // Add label
    const labelInput = screen.getByPlaceholderText(/Add label…/i);
    await user.type(labelInput, 'bass{enter}');
    expect(screen.getByText('bass')).toBeInTheDocument();

    // Verify saved to repo after debounce
    await waitFor(
      async () => {
        const saved = await repo.getById('ws-edit-test');
        expect(saved?.title).toBe('Revised Mix 2026');
        expect(saved?.description).toBe('Checking bass clarity');
        expect(saved?.labels).toContain('bass');
      },
      { timeout: 2000 },
    );
  });

  it('switches presentation layouts and updates workspace attribute', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-layout-test');
    await repo.create(ws);

    const user = userEvent.setup();
    const engine = new ABAudioEngine({ host: new FakeAudioHost() });
    render(
      <App
        engine={engine}
        customRepository={repo}
        initialViewMode="editor"
        initialWorkspace={ws}
      />,
    );

    const workspaceEl = document.querySelector('.workspace');
    expect(workspaceEl).toHaveAttribute('data-layout', 'standard');

    // Switch to Waveform
    await user.click(screen.getByRole('radio', { name: /Waveform layout/i }));
    expect(workspaceEl).toHaveAttribute('data-layout', 'waveform-focused');

    // Switch to Player
    await user.click(screen.getByRole('radio', { name: /Player layout/i }));
    expect(workspaceEl).toHaveAttribute('data-layout', 'player-focused');

    // Switch to Compact
    await user.click(screen.getByRole('radio', { name: /Compact layout/i }));
    expect(workspaceEl).toHaveAttribute('data-layout', 'compact-review');
  });
});
