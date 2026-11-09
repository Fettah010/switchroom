import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CROSSFADE_MS,
  MAX_CROSSFADE_MS,
  MIN_CROSSFADE_MS,
  applyGainHold,
  applyGainRamp,
  clampCrossfadeMs,
  clampGain,
  createGainRamp,
  crossfadeTargets,
  interpolateRamp,
  planCrossfade,
} from './crossfade';
import { FakeAudioParam } from '../test/fakeAudioHost';

describe('clampCrossfadeMs', () => {
  it('defaults to 180 ms and clamps to the supported range', () => {
    expect(DEFAULT_CROSSFADE_MS).toBe(180);
    expect(MIN_CROSSFADE_MS).toBe(80);
    expect(MAX_CROSSFADE_MS).toBe(600);
    expect(clampCrossfadeMs(180)).toBe(180);
    expect(clampCrossfadeMs(0)).toBe(80);
    expect(clampCrossfadeMs(79)).toBe(80);
    expect(clampCrossfadeMs(601)).toBe(600);
    expect(clampCrossfadeMs(Number.POSITIVE_INFINITY)).toBe(180);
    expect(clampCrossfadeMs(Number.NaN)).toBe(180);
  });

  it('rounds fractional values to whole milliseconds', () => {
    expect(clampCrossfadeMs(199.6)).toBe(200);
  });
});

describe('clampGain', () => {
  it('clamps and sanitises gain values', () => {
    expect(clampGain(0.5)).toBe(0.5);
    expect(clampGain(-1)).toBe(0);
    expect(clampGain(2)).toBe(1);
    expect(clampGain(Number.NaN)).toBe(0);
    expect(clampGain(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('crossfadeTargets', () => {
  it('makes only the selected deck audible', () => {
    expect(crossfadeTargets('original')).toEqual({ original: 1, edited: 0 });
    expect(crossfadeTargets('edited')).toEqual({ original: 0, edited: 1 });
  });
});

describe('interpolateRamp', () => {
  const ramp = createGainRamp(1, 0, 10, 0.18);

  it('returns the start, midpoint and end values', () => {
    expect(interpolateRamp(ramp, 10)).toBe(1);
    expect(interpolateRamp(ramp, 10.09)).toBeCloseTo(0.5, 5);
    expect(interpolateRamp(ramp, 10.18)).toBe(0);
  });

  it('clamps before and after the ramp', () => {
    expect(interpolateRamp(ramp, 9)).toBe(1);
    expect(interpolateRamp(ramp, 12)).toBe(0);
  });

  it('returns null without a ramp', () => {
    expect(interpolateRamp(null, 10)).toBeNull();
  });

  it('handles a zero-length ramp', () => {
    const instantaneous = createGainRamp(0.4, 0.9, 5, 0);
    expect(interpolateRamp(instantaneous, 5)).toBe(0.9);
  });
});

describe('planCrossfade', () => {
  it('plans linear outgoing and incoming ramps over the configured duration', () => {
    const plan = planCrossfade('edited', { original: 1, edited: 0 }, 20, 0.18);

    expect(plan.original.startValue).toBe(1);
    expect(plan.original.endValue).toBe(0);
    expect(plan.edited.startValue).toBe(0);
    expect(plan.edited.endValue).toBe(1);
    expect(plan.original.endTime).toBeCloseTo(20.18, 5);
    expect(plan.edited.endTime).toBeCloseTo(20.18, 5);
  });

  it('rebases an interrupted fade from the interpolated values', () => {
    const first = planCrossfade('edited', { original: 1, edited: 0 }, 0, 0.18);
    const midpoint = interpolateRamp(first.original, 0.09);
    expect(midpoint).not.toBeNull();

    const second = planCrossfade(
      'original',
      { original: midpoint ?? 0, edited: 1 - (midpoint ?? 0) },
      0.09,
      0.18,
    );

    expect(second.original.startValue).toBeCloseTo(midpoint ?? 0, 5);
    expect(second.original.endValue).toBe(1);
    expect(second.edited.startValue).toBeCloseTo(1 - (midpoint ?? 0), 5);
    expect(second.edited.endValue).toBe(0);
  });
});

describe('gain automation application', () => {
  it('cancels, holds at the rebased value, then ramps to the target', () => {
    const param = new FakeAudioParam();
    const plan = createGainRamp(0.4, 1, 3, 0.18);

    applyGainRamp(param, plan);

    expect(param.calls.map((call) => call.method)).toEqual([
      'cancelScheduledValues',
      'setValueAtTime',
      'linearRampToValueAtTime',
    ]);
    expect(param.calls[1]?.value).toBe(0.4);
    expect(param.calls[2]?.value).toBe(1);
    expect(param.calls[2]?.time).toBeCloseTo(3.18, 5);
  });

  it('holds a value immediately when paused', () => {
    const param = new FakeAudioParam();
    const ramp = applyGainHold(param, 1, 2);

    expect(param.calls.map((call) => call.method)).toEqual([
      'cancelScheduledValues',
      'setValueAtTime',
    ]);
    expect(param.value).toBe(1);
    expect(ramp.startValue).toBe(1);
    expect(ramp.endValue).toBe(1);
  });
});
