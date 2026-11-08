/** Time formatting and the shared-timeline arithmetic used by the player. */

const DISPLAY_TOLERANCE_SECONDS = 0.05;

/** Formats seconds as `m:ss`, or `h:mm:ss` for an hour or more. Invalid input reads `0:00`. */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const total = Math.floor(seconds + 1e-9);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

/** A duration is usable only when it is a finite, positive number. */
export function isValidDuration(duration: number | null | undefined): duration is number {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
}

/** The common timeline is the shorter valid duration. */
export function calculateCommonDuration(
  originalDuration: number | null | undefined,
  editedDuration: number | null | undefined,
): number | null {
  if (!isValidDuration(originalDuration) || !isValidDuration(editedDuration)) {
    return null;
  }

  return Math.min(originalDuration, editedDuration);
}

/** Clamps any seek target to the shared timeline. Non-finite input becomes 0. */
export function clampSeek(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || !isValidDuration(duration)) {
    return 0;
  }

  return Math.min(Math.max(seconds, 0), duration);
}

/** True when both durations are valid and differ by more than the display tolerance. */
export function hasDurationMismatch(
  originalDuration: number | null | undefined,
  editedDuration: number | null | undefined,
): boolean {
  if (!isValidDuration(originalDuration) || !isValidDuration(editedDuration)) {
    return false;
  }

  return Math.abs(originalDuration - editedDuration) > DISPLAY_TOLERANCE_SECONDS;
}

/** Percentage of the timeline, clamped to 0–100. */
export function progressPercent(currentTime: number, duration: number): number {
  if (!isValidDuration(duration)) {
    return 0;
  }

  return Math.min(Math.max((currentTime / duration) * 100, 0), 100);
}
