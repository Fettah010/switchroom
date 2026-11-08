import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
});
