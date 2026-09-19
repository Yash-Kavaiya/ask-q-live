import { describe, it, expect } from 'vitest';
import { isPlausibleApiKey, resolveGeminiApiKey } from './gemini.service.js';

describe('isPlausibleApiKey', () => {
  it('accepts a long non-placeholder key', () => {
    expect(isPlausibleApiKey('AIzaSyDummyKeyValue')).toBe(true);
  });

  it('rejects empty, short, and known placeholder values', () => {
    expect(isPlausibleApiKey('')).toBe(false);
    expect(isPlausibleApiKey('   ')).toBe(false);
    expect(isPlausibleApiKey('short')).toBe(false);
    expect(isPlausibleApiKey('MY_GEMINI_API_KEY')).toBe(false);
    expect(isPlausibleApiKey('TODO')).toBe(false);
    expect(isPlausibleApiKey('undefined')).toBe(false);
    expect(isPlausibleApiKey('null')).toBe(false);
    expect(isPlausibleApiKey(null)).toBe(false);
    expect(isPlausibleApiKey(undefined)).toBe(false);
  });

  it('trims before judging length', () => {
    expect(isPlausibleApiKey('  AIzaSyDummyKeyValue  ')).toBe(true);
  });
});

describe('resolveGeminiApiKey', () => {
  it('prefers a plausible host override over the env key', () => {
    expect(resolveGeminiApiKey('AIzaSyHostProvidedKey')).toBe('AIzaSyHostProvidedKey');
  });

  it('ignores a placeholder override', () => {
    const resolved = resolveGeminiApiKey('MY_GEMINI_API_KEY');
    expect(resolved).not.toBe('MY_GEMINI_API_KEY');
  });
});
