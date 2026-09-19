const MIN_PLAUSIBLE_API_KEY_LENGTH = 10;
const PLACEHOLDER_API_KEYS = new Set(['MY_GEMINI_API_KEY', 'TODO', 'undefined', 'null']);

/** True for a key that isn't empty, a known placeholder, or too short to be real. */
export function isPlausibleApiKey(key: string | null | undefined): boolean {
  const trimmed = (key || '').trim();
  return trimmed.length >= MIN_PLAUSIBLE_API_KEY_LENGTH && !PLACEHOLDER_API_KEYS.has(trimmed);
}
