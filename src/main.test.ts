// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TEXTS } from './texts';

describe('texts', () => {
  it('expose le titre en français', () => {
    expect(TEXTS.title).toBe('Roue du hasard');
  });
});
