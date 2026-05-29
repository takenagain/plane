/**
 * Format a duration in minutes to "Xh Ym" display string.
 * Examples: 150 → "2h 30m", 45 → "0h 45m", 0 → "0h 0m"
 */
export function formatDuration(totalMinutes: number): string {
  if (typeof totalMinutes !== "number" || !isFinite(totalMinutes) || totalMinutes < 0) return "0h 0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function getElapsedSeconds(createdAt: string, nowMs = Date.now()): number {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return 0;

  return Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
}

export function formatElapsedDurationFull(totalSeconds: number): string {
  if (typeof totalSeconds !== "number" || !isFinite(totalSeconds) || totalSeconds < 0) return "00:00:00";

  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function formatElapsedDurationCompact(totalSeconds: number): string {
  if (typeof totalSeconds !== "number" || !isFinite(totalSeconds) || totalSeconds < 0) return "0m 0s";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Parse hours and minutes inputs into total minutes.
 * Returns NaN if inputs are invalid.
 */
export function parseDuration(hours: number, minutes: number): number {
  if (
    typeof hours !== "number" ||
    typeof minutes !== "number" ||
    !isFinite(hours) ||
    !isFinite(minutes) ||
    hours < 0 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return NaN;
  }
  return hours * 60 + minutes;
}
