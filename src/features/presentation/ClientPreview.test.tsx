import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { FakeAudioHost } from '../../test/fakeAudioHost';
import { ABAudioEngine } from '../../audio/ABAudioEngine';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import { createDefaultWorkspace } from '../../workspaces/workspaceDefaults';

describe('ClientPreview presentation mode', () => {
  it('enters preview, shows local-only banner and read-only slots, then exits back to editor', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-preview-test');
    ws.title = 'Client Demo Session';
    ws.description = 'Final mastered preview for feedback.';
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

    // Click client preview button
    await user.click(screen.getByRole('button', { name: /Client preview/i }));

    // Verify preview mode
    expect(screen.getByRole('region', { name: /Local client preview/i })).toBeInTheDocument();
    expect(screen.getByText(/Local preview — this view has not been shared/i)).toBeInTheDocument();
    expect(screen.getByText(/No URL or cloud project was created/i)).toBeInTheDocument();

    // In preview mode, metadata editor is hidden
    expect(screen.queryByLabelText('Comparison title')).not.toBeInTheDocument();
    // Slots are read-only
    expect(document.querySelectorAll('.slot--readonly').length).toBe(2);

    // Click Exit preview
    await user.click(screen.getByRole('button', { name: /Exit preview/i }));

    // Back in editor
    await waitFor(() => {
      expect(screen.getByLabelText('Comparison title')).toBeInTheDocument();
    });
    expect(screen.queryByRole('region', { name: /Local client preview/i })).not.toBeInTheDocument();
  });
});
