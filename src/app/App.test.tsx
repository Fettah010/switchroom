import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { ABAudioEngine } from '../audio/ABAudioEngine';
import { FakeAudioHost, makeWavFile } from '../test/fakeAudioHost';

function setup() {
  const host = new FakeAudioHost();
  host.durationFor = (file) => (file.name.includes('edited') ? 3.4 : 3);
  const engine = new ABAudioEngine({ host });
  const user = userEvent.setup();
  render(<App engine={engine} />);
  return { host, engine, user };
}

function slot(version: 'Original' | 'Edited') {
  return screen.getByRole('article', { name: new RegExp(version) });
}

async function chooseFile(
  user: ReturnType<typeof userEvent.setup>,
  version: 'Original' | 'Edited',
  name: string,
) {
  const input = screen.getByLabelText(`Choose ${version} audio file`);
  await user.upload(input, makeWavFile(name));
  await waitFor(() => expect(within(slot(version)).getByText(name)).toBeInTheDocument());
}

describe('Switchroom interface', () => {
  it('presents both slots with labels and browse controls', () => {
    setup();

    expect(
      screen.getByRole('heading', { level: 1, name: /Hear the difference/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Original' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Edited' })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /Choose or drop a file/i })).toHaveLength(2);
    expect(screen.getByLabelText('Choose Original audio file')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose Edited audio file')).toBeInTheDocument();
    expect(screen.getByText(/Local-only listening/i)).toBeVisible();
    expect(screen.getByText(/does not upload or store your files/i)).toBeVisible();
  });

  it('shows metadata and a ready state after a file is chosen', async () => {
    const { user } = setup();

    await chooseFile(user, 'Original', 'original.wav');

    const original = slot('Original');
    await waitFor(() => expect(within(original).getByText('Ready')).toBeInTheDocument());
    expect(within(original).getByText('WAV')).toBeInTheDocument();
    expect(within(original).getByText('2 KB')).toBeInTheDocument();
    expect(within(original).getByText('0:03')).toBeInTheDocument();
  });

  it('keeps Play disabled until both files are ready', async () => {
    const { user } = setup();
    const play = screen.getByRole('button', { name: 'Play' });

    expect(play).toBeDisabled();

    await chooseFile(user, 'Original', 'original.wav');
    expect(play).toBeDisabled();

    await chooseFile(user, 'Edited', 'edited.wav');
    expect(play).toBeEnabled();
  });

  it('rejects invalid and empty files with plain-language errors', async () => {
    setup();
    const input = screen.getByLabelText('Choose Original audio file');

    fireEvent.change(input, {
      target: { files: [new File(['not audio'], 'notes.mp3', { type: 'text/plain' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/doesn't look like an audio file/i);

    fireEvent.change(input, {
      target: { files: [new File([], 'empty.wav', { type: 'audio/wav' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/empty/i);
  });

  it('replaces and removes files independently', async () => {
    const { user } = setup();
    await chooseFile(user, 'Original', 'original.wav');
    await chooseFile(user, 'Edited', 'edited.wav');

    const originalInput = screen.getByLabelText('Choose Original audio file');
    await user.upload(originalInput, makeWavFile('original-take-2.wav'));

    await waitFor(() =>
      expect(within(slot('Original')).getByText('original-take-2.wav')).toBeInTheDocument(),
    );
    expect(within(slot('Edited')).getByText('edited.wav')).toBeInTheDocument();

    await user.click(within(slot('Original')).getByRole('button', { name: /Remove/i }));

    expect(within(slot('Original')).getByText('Choose or drop a file')).toBeInTheDocument();
    expect(within(slot('Original')).getByText('Waiting')).toBeInTheDocument();
    expect(within(slot('Edited')).getByText('edited.wav')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('updates the Play label and A/B pressed state', async () => {
    const { user } = setup();
    await chooseFile(user, 'Original', 'original.wav');
    await chooseFile(user, 'Edited', 'edited.wav');

    const originalTab = screen.getByRole('button', { name: 'Original' });
    const editedTab = screen.getByRole('button', { name: 'Edited' });

    expect(originalTab).toHaveAttribute('aria-pressed', 'true');
    expect(editedTab).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edited' }));
    expect(editedTab).toHaveAttribute('aria-pressed', 'true');
    expect(originalTab).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument());
  });

  it('shows a readable shared timeline and mismatch note', async () => {
    const { user } = setup();
    await chooseFile(user, 'Original', 'original.wav');
    await chooseFile(user, 'Edited', 'edited.wav');

    expect(screen.getByRole('slider', { name: 'Playback position' })).toBeEnabled();
    expect(screen.getByLabelText('Elapsed time')).toHaveTextContent('0:00');
    expect(screen.getByLabelText('Total time')).toHaveTextContent('0:03');
    expect(screen.getByText(/different lengths/i)).toHaveTextContent('0:03');
  });

  it('volume and mute controls update their state', async () => {
    const { user } = setup();
    const volume = screen.getByRole('slider', { name: 'Master volume' });

    fireEvent.change(volume, { target: { value: '0.5' } });
    expect(volume).toHaveAttribute('aria-valuetext', '50%');

    const mute = screen.getByRole('button', { name: 'Mute' });
    await user.click(mute);

    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
    expect(volume).toHaveAttribute('aria-valuetext', 'Muted');
  });

  it('changes theme and stores only the manual choice', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'Light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('switchroom.theme')).toBe('light');

    await user.click(screen.getByRole('button', { name: 'System theme' }));
    expect(window.localStorage.getItem('switchroom.theme')).toBe('system');
  });

  it('exposes an accessible crossfade control with the documented range', () => {
    const { engine } = setup();
    const slider = screen.getByRole('slider', { name: 'Crossfade' });

    expect(slider).toHaveAttribute('min', '80');
    expect(slider).toHaveAttribute('max', '600');
    expect(slider).toHaveValue('180');
    expect(slider).toHaveAttribute('aria-valuetext', '180 milliseconds');
    expect(screen.getByText('180 ms')).toBeVisible();

    fireEvent.change(slider, { target: { value: '600' } });

    expect(slider).toHaveValue('600');
    expect(slider).toHaveAttribute('aria-valuetext', '600 milliseconds');
    expect(screen.getByText('600 ms')).toBeVisible();
    expect(engine.getSnapshot().crossfadeMs).toBe(600);
  });

  it('announces starting and switching without claiming the target is audible', async () => {
    const { host, user } = setup();
    await chooseFile(user, 'Original', 'original.wav');
    await chooseFile(user, 'Edited', 'edited.wav');

    host.holdPlay();
    await user.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => expect(screen.getByText('Starting audio…')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveTextContent('Starting…');

    host.releasePlay();
    await waitFor(() => expect(screen.getByText(/Playing Original/)).toBeInTheDocument());

    host.manualTimers = true;
    host.suppressSeeked = true;
    host.elements[0]?.advance(0.2);

    await user.click(screen.getByRole('button', { name: 'Edited' }));

    await waitFor(() => expect(screen.getByText('Switching to Edited…')).toBeInTheDocument());
    expect(document.querySelector('.player__audible')).toHaveTextContent('Audible: Original');

    await act(async () => {
      host.elements[1]?.dispatchEvent(new Event('seeked'));
    });
    act(() => {
      host.runTimeouts();
    });

    await waitFor(() => expect(screen.getByText(/Playing Edited/)).toBeInTheDocument());
    expect(document.querySelector('.player__audible')).toHaveTextContent('Audible: Edited');
  });

  it('recovers from a context interruption only after an explicit Play', async () => {
    const { host, user } = setup();
    await chooseFile(user, 'Original', 'original.wav');
    await chooseFile(user, 'Edited', 'edited.wav');

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument());

    act(() => {
      host.contexts[0]?.setState('suspended');
    });

    await waitFor(() =>
      expect(screen.getByText(/browser interrupted audio playback/i)).toBeInTheDocument(),
    );
    expect(document.querySelector('.player')).toHaveAttribute('data-status', 'interrupted');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() => expect(screen.getByText(/Playing Original/)).toBeInTheDocument());
    expect(host.contexts[0]?.state).toBe('running');
  });

  it('associates file errors with the slot input', async () => {
    setup();
    const input = screen.getByLabelText('Choose Original audio file');

    fireEvent.change(input, {
      target: { files: [new File(['not audio'], 'notes.mp3', { type: 'text/plain' })] },
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/doesn't look like an audio file/i);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(alert.id).toBeTruthy();
  });

  it('keeps focus in the slot after a file is chosen', async () => {
    const { user } = setup();
    const original = slot('Original');

    await user.upload(
      screen.getByLabelText('Choose Original audio file'),
      makeWavFile('original.wav'),
    );

    await waitFor(() => expect(within(original).getByText('original.wav')).toBeInTheDocument());
    await waitFor(() =>
      expect(within(original).getByRole('button', { name: 'Replace' })).toHaveFocus(),
    );
  });

  it('reports a metadata timeout as a recoverable slot error', async () => {
    const host = new FakeAudioHost();
    host.manualTimers = true;
    host.durationFor = () => 3;
    host.shouldNeverLoad = () => true;
    const engine = new ABAudioEngine({ host });
    const user = userEvent.setup();
    render(<App engine={engine} />);

    await user.upload(
      screen.getByLabelText('Choose Original audio file'),
      makeWavFile('stuck.wav'),
    );

    act(() => {
      host.runTimeouts();
    });

    await waitFor(() =>
      expect(within(slot('Original')).getByRole('alert')).toHaveTextContent(/took too long/i),
    );
    expect(within(slot('Original')).getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('changes the crossfade without interrupting playback', async () => {
    const { engine, user } = setup();
    await chooseFile(user, 'Original', 'original.wav');
    await chooseFile(user, 'Edited', 'edited.wav');

    await user.click(screen.getByRole('button', { name: 'Play' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument());

    const slider = screen.getByRole('slider', { name: 'Crossfade' });
    fireEvent.change(slider, { target: { value: '400' } });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByText(/Playing Original/)).toBeInTheDocument();
    expect(engine.getSnapshot().crossfadeMs).toBe(400);
    expect(engine.getSnapshot().isPlaying).toBe(true);
  });
});
