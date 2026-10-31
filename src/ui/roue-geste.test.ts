// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { creerGeste, SEUIL_DEPLACEMENT } from './roue-geste';

describe('creerGeste', () => {
  it('accepte un toucher immobile', () => {
    const g = creerGeste();
    g.debut(1, 10, 10);
    expect(g.fin(1, 10, 10)).toBe(true);
  });
  it('accepte un déplacement au seuil, refuse au-delà', () => {
    const g = creerGeste();
    g.debut(1, 0, 0);
    expect(g.fin(1, SEUIL_DEPLACEMENT, 0)).toBe(true);
    g.debut(1, 0, 0);
    expect(g.fin(1, SEUIL_DEPLACEMENT + 0.1, 0)).toBe(false);
  });
  it('refuse un aller-retour qui a dépassé le seuil', () => {
    const g = creerGeste();
    g.debut(1, 0, 0);
    g.deplacement(1, 50, 0);
    expect(g.fin(1, 0, 0)).toBe(false);
  });
  it('refuse après annulation (défilement de la page)', () => {
    const g = creerGeste();
    g.debut(1, 0, 0);
    g.annuler(1);
    expect(g.fin(1, 0, 0)).toBe(false);
  });
  it('ignore les événements d’un autre pointeur', () => {
    const g = creerGeste();
    g.debut(1, 0, 0);
    g.deplacement(2, 900, 900);
    g.annuler(2);
    expect(g.fin(2, 500, 500)).toBe(false);
    expect(g.fin(1, 0, 0)).toBe(true);
  });
  it('un nouvel appui remplace un appui resté sans fin', () => {
    const g = creerGeste();
    g.debut(1, 0, 0);
    g.debut(2, 500, 500);
    expect(g.fin(1, 0, 0)).toBe(false);
    expect(g.fin(2, 500, 500)).toBe(true);
  });
  it('un geste terminé ne se termine pas deux fois', () => {
    const g = creerGeste();
    g.debut(1, 0, 0);
    expect(g.fin(1, 0, 0)).toBe(true);
    expect(g.fin(1, 0, 0)).toBe(false);
  });
});
