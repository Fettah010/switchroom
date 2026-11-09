import type { AudioParamLike, AudioVersion } from './audioTypes';

/** Nominal crossfade length. Linear amplitude by design: correlated programme avoids a level bump. */
export const DEFAULT_CROSSFADE_MS = 180;

/** Bounds for the user-adjustable transition duration. */
export const MIN_CROSSFADE_MS = 80;
export const MAX_CROSSFADE_MS = 600;

/** Small scheduling lead so automation never starts in the past. */
export const GAIN_SCHEDULE_LEAD_SECONDS = 0.005;

/** Clamps a requested transition duration to the supported range. */
export function clampCrossfadeMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CROSSFADE_MS;
  }

  return Math.min(MAX_CROSSFADE_MS, Math.max(MIN_CROSSFADE_MS, Math.round(value)));
}

export interface GainRamp {
  startValue: number;
  endValue: number;
  startTime: number;
  endTime: number;
}

export type DeckGains = Record<AudioVersion, number>;

export function clampGain(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

export function createGainRamp(
  startValue: number,
  endValue: number,
  startTime: number,
  durationSeconds: number,
): GainRamp {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(durationSeconds, 0) : 0;

  return {
    startValue: clampGain(startValue),
    endValue: clampGain(endValue),
    startTime,
    endTime: startTime + safeDuration,
  };
}

/**
 * Reads the gain a scheduled ramp will actually have at `time`.
 *
 * `AudioParam.value` is not reliable while a ramp is scheduled, so the engine
 * keeps its own ramp bookkeeping and rebases the next ramp from this value.
 * Returns `null` when there is no ramp to interpolate.
 */
export function interpolateRamp(ramp: GainRamp | null, time: number): number | null {
  if (!ramp) {
    return null;
  }

  if (ramp.endTime <= ramp.startTime) {
    return ramp.endValue;
  }

  if (time <= ramp.startTime) {
    return ramp.startValue;
  }

  if (time >= ramp.endTime) {
    return ramp.endValue;
  }

  const span = ramp.endTime - ramp.startTime;

  const progress = (time - ramp.startTime) / span;
  return clampGain(ramp.startValue + (ramp.endValue - ramp.startValue) * progress);
}

export function crossfadeTargets(activeVersion: AudioVersion): DeckGains {
  return {
    original: activeVersion === 'original' ? 1 : 0,
    edited: activeVersion === 'edited' ? 1 : 0,
  };
}

export interface CrossfadePlan {
  original: GainRamp;
  edited: GainRamp;
}

/** Plans both sides of a linear crossfade from the current interpolated gains. */
export function planCrossfade(
  activeVersion: AudioVersion,
  currentGains: DeckGains,
  startTime: number,
  durationSeconds: number,
): CrossfadePlan {
  const targets = crossfadeTargets(activeVersion);

  return {
    original: createGainRamp(currentGains.original, targets.original, startTime, durationSeconds),
    edited: createGainRamp(currentGains.edited, targets.edited, startTime, durationSeconds),
  };
}

/**
 * Applies an automation ramp to a gain parameter and returns its bookkeeping.
 * The parameter is explicitly held at the computed start value first, which
 * makes an interrupted fade rebase smoothly instead of jumping.
 */
export function applyGainRamp(param: AudioParamLike, plan: GainRamp): GainRamp {
  param.cancelScheduledValues(plan.startTime);
  param.setValueAtTime(plan.startValue, plan.startTime);
  param.linearRampToValueAtTime(plan.endValue, plan.endTime);
  return plan;
}

/** Immediately holds a gain parameter at a single value. Used while paused. */
export function applyGainHold(param: AudioParamLike, value: number, time: number): GainRamp {
  const gain = clampGain(value);
  param.cancelScheduledValues(time);
  param.setValueAtTime(gain, time);
  return createGainRamp(gain, gain, time, 0);
}
