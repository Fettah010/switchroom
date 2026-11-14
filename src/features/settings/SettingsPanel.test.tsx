import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../../app/App';
import { FakeAudioHost } from '../../test/fakeAudioHost';
import { ABAudioEngine } from '../../audio/ABAudioEngine';
import { InMemoryWorkspaceRepository } from '../../workspaces/inMemoryWorkspaceRepository';
import { createDefaultWorkspace } from '../../workspaces/workspaceDefaults';

describe('SettingsPanel preferences and clearing', () => {
  it('opens and closes settings modal with keyboard and buttons', async () => {
    const repo = new InMemoryWorkspaceRepository();
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

    // Open settings via top bar button
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.getByText('Motion')).toBeInTheDocument();
    expect(screen.getByText('Default crossfade')).toBeInTheDocument();
    expect(screen.getByText('Default presentation layout')).toBeInTheDocument();

    // Close settings via close button
    await user.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('changes motion preference and layout in settings', async () => {
    const repo = new InMemoryWorkspaceRepository();
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

    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    // Switch motion to Reduced
    const reducedBtn = screen.getByRole('radio', { name: 'Reduced' });
    await user.click(reducedBtn);
    expect(reducedBtn).toHaveAttribute('aria-checked', 'true');

    // Switch default layout to Player
    const playerLayout = screen.getByRole('radio', { name: /Player layout/i });
    await user.click(playerLayout);
    expect(playerLayout).toHaveAttribute('aria-checked', 'true');
  });

  it('confirms and executes clear local workspaces', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ws = createDefaultWorkspace('ws-to-clear');
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
      expect(screen.getByText('Untitled comparison')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: /Clear local workspaces/i }));

    expect(screen.getByText(/Are you sure\? This deletes saved workspaces/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, clear local data' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    });
  });
});
