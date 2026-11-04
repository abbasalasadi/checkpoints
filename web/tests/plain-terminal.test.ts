import { describe, expect, test } from 'vitest';
import { toPlain } from '../src/components/Terminal.js';

describe('plain-text results on phones (V2)', () => {
  test('colour codes are dropped and line ends normalised', () => {
    expect(toPlain('\x1b[1m\x1b[92mCompiling\x1b[0m x\r\nok\r')).toBe('Compiling x\nok');
  });
  test('plain text passes through', () => {
    expect(toPlain('a < b && c')).toBe('a < b && c');
  });
});
