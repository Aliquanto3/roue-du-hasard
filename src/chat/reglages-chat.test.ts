// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CLE_REGLAGES_CHAT, ecrireReglages, lireReglages, REGLAGES_VIDES } from './reglages-chat';

function stockage(): { acces: () => Storage; donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  const s = {
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => {
      donnees.set(k, v);
    },
  } as unknown as Storage;
  return { acces: () => s, donnees };
}

describe('réglages du chat', () => {
  it('vides par défaut', () => {
    expect(lireReglages(stockage().acces)).toEqual({ modeleSlm: '', modeleDecision: '' });
  });

  it('écrit puis relit les deux modèles', () => {
    const s = stockage();
    expect(ecrireReglages(s.acces, { modeleSlm: 'qwen3:4b', modeleDecision: 'gemma3' })).toBe(true);
    expect(lireReglages(s.acces)).toEqual({ modeleSlm: 'qwen3:4b', modeleDecision: 'gemma3' });
  });

  it('tolère un stockage qui lève ou un contenu invalide', () => {
    const leve = (): Storage => {
      throw new Error('bloqué');
    };
    expect(lireReglages(leve)).toBe(REGLAGES_VIDES);
    expect(ecrireReglages(leve, REGLAGES_VIDES)).toBe(false);
    const s = stockage();
    s.donnees.set(CLE_REGLAGES_CHAT, '{pas du json');
    expect(lireReglages(s.acces)).toBe(REGLAGES_VIDES);
    s.donnees.set(CLE_REGLAGES_CHAT, '{"modeleSlm":42,"modeleDecision":" x "}');
    expect(lireReglages(s.acces)).toEqual({ modeleSlm: '', modeleDecision: 'x' });
    s.donnees.set(CLE_REGLAGES_CHAT, 'null');
    expect(lireReglages(s.acces)).toBe(REGLAGES_VIDES);
  });
});
