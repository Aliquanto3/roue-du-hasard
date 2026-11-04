// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { poserUneFois } from './projection';

describe('poserUneFois', () => {
  it('pose les écouteurs une seule fois par cible : un événement n’est traité qu’une fois', () => {
    const cible = new EventTarget();
    const vus: string[] = [];
    expect(poserUneFois(cible, { keydown: () => vus.push('a1'), fullscreenchange: () => vus.push('f1') })).toBe(true);
    expect(poserUneFois(cible, { keydown: () => vus.push('a2'), fullscreenchange: () => vus.push('f2') })).toBe(false);
    cible.dispatchEvent(new Event('keydown'));
    cible.dispatchEvent(new Event('fullscreenchange'));
    expect(vus).toEqual(['a1', 'f1']);
  });

  it('une autre cible reçoit ses propres écouteurs', () => {
    const vus: string[] = [];
    const a = new EventTarget();
    const b = new EventTarget();
    expect(poserUneFois(a, { keydown: () => vus.push('a') })).toBe(true);
    expect(poserUneFois(b, { keydown: () => vus.push('b') })).toBe(true);
    b.dispatchEvent(new Event('keydown'));
    expect(vus).toEqual(['b']);
  });
});
