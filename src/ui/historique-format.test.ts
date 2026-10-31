// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Tirage } from '../domain/etat';
import { formaterHeure, formaterPourCopie } from './historique-format';

const tirage = (ordre: number, nom: string, cadeau: string | null, heure: string): Tirage => ({
  ordre,
  participantId: `p${String(ordre)}`,
  nom,
  cadeau,
  cadeauSupprime: false,
  heure,
  retrait: null,
});

describe('formaterHeure', () => {
  it('affiche HH:MM:SS à l’heure locale, avec les zéros', () => {
    expect(formaterHeure(new Date(2026, 9, 31, 4, 3, 9).toISOString())).toBe('04:03:09');
    expect(formaterHeure(new Date(2026, 9, 31, 23, 59, 59).toISOString())).toBe('23:59:59');
  });

  it('rend tel quel un horodatage illisible', () => {
    expect(formaterHeure('pas une date')).toBe('pas une date');
  });
});

describe('formaterPourCopie', () => {
  it('écrit l’en-tête puis une ligne par tirage, cadeau vide si absent', () => {
    const h = new Date(2026, 9, 31, 14, 0, 5).toISOString();
    const texte = formaterPourCopie([tirage(1, 'Marie', 'la bougie', h), tirage(2, 'Paul', null, h)]);
    expect(texte).toBe('N°\tNom\tCadeau\tHeure\n1\tMarie\tla bougie\t14:00:05\n2\tPaul\t\t14:00:05');
  });

  it('ne donne que l’en-tête pour un historique vide', () => {
    expect(formaterPourCopie([])).toBe('N°\tNom\tCadeau\tHeure');
  });
});
