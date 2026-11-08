import { describe, expect, it } from 'vitest';
import {
  calculateCommonDuration,
  clampSeek,
  formatTime,
  hasDurationMismatch,
  isValidDuration,
  progressPercent,
} from './timeFormatting';

describe('formatTime', () => {
  it('formats zero', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(0.99)).toBe('0:00');
  });

  it('handles minute boundaries', () => {
    expect(formatTime(59.99)).toBe('0:59');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats long durations with hours', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661.4)).toBe('1:01:01');
  });

  it('returns 0:00 for invalid values', () => {
    expect(formatTime(null)).toBe('0:00');
    expect(formatTime(undefined)).toBe('0:00');
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-4)).toBe('0:00');
  });
});

describe('calculateCommonDuration', () => {
  it('uses the shorter valid duration', () => {
    expect(calculateCommonDuration(130, 134)).toBe(130);
    expect(calculateCommonDuration(134, 130)).toBe(130);
  });

  it('requires both durations to be valid', () => {
    expect(calculateCommonDuration(null, 10)).toBeNull();
    expect(calculateCommonDuration(10, null)).toBeNull();
    expect(calculateCommonDuration(0, 10)).toBeNull();
    expect(calculateCommonDuration(Number.POSITIVE_INFINITY, 10)).toBeNull();
    expect(calculateCommonDuration(Number.NaN, 10)).toBeNull();
  });
});

describe('clampSeek', () => {
  const duration = 120;

  it('keeps in-range values', () => {
    expect(clampSeek(30, duration)).toBe(30);
  });

  it('clamps negatives and over-duration values', () => {
    expect(clampSeek(-10, duration)).toBe(0);
    expect(clampSeek(500, duration)).toBe(duration);
  });

  it('handles NaN, infinities and invalid durations', () => {
    expect(clampSeek(Number.NaN, duration)).toBe(0);
    expect(clampSeek(Number.POSITIVE_INFINITY, duration)).toBe(0);
    expect(clampSeek(-Number.POSITIVE_INFINITY, duration)).toBe(0);
    expect(clampSeek(10, 0)).toBe(0);
    expect(clampSeek(10, Number.NaN)).toBe(0);
  });
});

describe('hasDurationMismatch', () => {
  it('is false within display tolerance', () => {
    expect(hasDurationMismatch(10, 10.04)).toBe(false);
    expect(hasDurationMismatch(10, 10)).toBe(false);
  });

  it('is true beyond display tolerance', () => {
    expect(hasDurationMismatch(10, 10.06)).toBe(true);
    expect(hasDurationMismatch(130, 134)).toBe(true);
  });

  it('is false when either duration is invalid', () => {
    expect(hasDurationMismatch(null, 10)).toBe(false);
    expect(hasDurationMismatch(10, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('isValidDuration', () => {
  it('accepts finite positive numbers only', () => {
    expect(isValidDuration(0.5)).toBe(true);
    expect(isValidDuration(0)).toBe(false);
    expect(isValidDuration(-1)).toBe(false);
    expect(isValidDuration(Number.NaN)).toBe(false);
    expect(isValidDuration(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidDuration(null)).toBe(false);
  });
});

describe('progressPercent', () => {
  it('maps time to a clamped percentage', () => {
    expect(progressPercent(0, 100)).toBe(0);
    expect(progressPercent(25, 100)).toBe(25);
    expect(progressPercent(200, 100)).toBe(100);
    expect(progressPercent(-5, 100)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
  });
});
