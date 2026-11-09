import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { PlayerProvider } from '../../app/providers/PlayerProvider';
import { ABAudioEngine } from '../../audio/ABAudioEngine';
import { FakeAudioHost } from '../../test/fakeAudioHost';
import { ComparisonWaveform } from './ComparisonWaveform';
import type { WaveformService, WaveformSlotView } from '../../waveform/waveformTypes';

const host = new FakeAudioHost();
const engine = new ABAudioEngine({ host });

function renderWaveform(original: WaveformService, edited: WaveformService) {
  return render(
    <PlayerProvider engine={engine}>
      <ComparisonWaveform original={original} edited={edited} />
    </PlayerProvider>,
  );
}

function fakeService(
  version: 'original' | 'edited',
  state: WaveformSlotView['state'],
): WaveformService {
  const base: WaveformSlotView = {
    version,
    state,
    peaks: null,
    fileName: state === 'waiting' ? null : `${version}.wav`,
    durationSeconds: null,
    message: null,
  };

  return {
    version,
    view: { ...base, state },
    subscribe: () => () => undefined,
    requestedBucketCount: () => 200,
    loadFile: () => undefined,
    dispose: () => undefined,
  } as unknown as WaveformService;
}

function readyService(version: 'original' | 'edited'): WaveformService {
  const base: WaveformSlotView = {
    version,
    state: 'ready',
    peaks: {
      version,
      durationSeconds: 2,
      bucketCount: 4,
      peaks: new Float32Array([0, 0.5, 1, 0.25]),
      sourceGeneration: 1,
    },
    fileName: `${version}.wav`,
    durationSeconds: 2,
    message: null,
  };

  return {
    version,
    view: { ...base, state: 'ready' },
    subscribe: () => () => undefined,
    requestedBucketCount: () => 200,
    loadFile: () => undefined,
    dispose: () => undefined,
  } as unknown as WaveformService;
}

function mutableService(version: 'original' | 'edited', initial: WaveformSlotView) {
  const listeners = new Set<() => void>();
  const service = {
    version,
    view: initial,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    requestedBucketCount: () => 200,
    loadFile: () => undefined,
    dispose: () => undefined,
    update(next: WaveformSlotView) {
      service.view = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
  };

  return service;
}

describe('ComparisonWaveform', () => {
  it('shows an empty state without labels or a playhead before files load', () => {
    const { container } = renderWaveform(
      fakeService('original', 'waiting'),
      fakeService('edited', 'waiting'),
    );

    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
    expect(container.querySelectorAll('canvas')).toHaveLength(0);
    expect(screen.getByText(/Load both recordings/i)).toBeInTheDocument();
  });

  it('re-renders when a waveform service publishes real peaks', () => {
    const original = mutableService('original', {
      version: 'original',
      state: 'preparing',
      peaks: null,
      fileName: 'original.wav',
      durationSeconds: null,
      message: 'Preparing waveform…',
    });
    const edited = mutableService('edited', {
      version: 'edited',
      state: 'preparing',
      peaks: null,
      fileName: 'edited.wav',
      durationSeconds: null,
      message: 'Preparing waveform…',
    });

    const { container } = renderWaveform(
      original as unknown as WaveformService,
      edited as unknown as WaveformService,
    );

    expect(container.querySelectorAll('canvas')).toHaveLength(2);
    expect(container.querySelectorAll('canvas[data-ready="true"]')).toHaveLength(0);

    act(() => {
      original.update({
        version: 'original',
        state: 'ready',
        peaks: {
          version: 'original',
          durationSeconds: 2,
          bucketCount: 4,
          peaks: new Float32Array([0, 0.5, 1, 0.25]),
          sourceGeneration: 1,
        },
        fileName: 'original.wav',
        durationSeconds: 2,
        message: null,
      });
    });

    expect(container.querySelectorAll('canvas[data-ready="true"]')).toHaveLength(1);
  });

  it('renders both rows with A/B labels in ready state', () => {
    const { container } = renderWaveform(readyService('original'), readyService('edited'));

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Original and Edited waveform comparison/ }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('shows a fallback message when analysis is skipped', () => {
    renderWaveform(fakeService('original', 'fallback'), fakeService('edited', 'fallback'));

    expect(screen.getByText(/Waveform preview skipped/i)).toBeInTheDocument();
  });

  it('shows the preparing message while peaks are pending', () => {
    renderWaveform(fakeService('original', 'preparing'), fakeService('edited', 'waiting'));

    expect(screen.getByText('Preparing waveform…')).toBeInTheDocument();
  });

  it('renders unavailable without crashing', () => {
    const { container } = renderWaveform(
      fakeService('original', 'unavailable'),
      fakeService('edited', 'waiting'),
    );

    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });
});
