const TASHKENT_OFFSET_HOURS = 5;
const TASHKENT_OFFSET_MS = TASHKENT_OFFSET_HOURS * 60 * 60 * 1000;

export function getTashkentDayRange(now = new Date()): { start: Date; end: Date } {
  const shiftedNow = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const startUtcMs =
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate()) - TASHKENT_OFFSET_MS;

  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000),
  };
}
