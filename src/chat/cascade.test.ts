// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decider, ETAGES_ENREGISTRES, REFUS_INCOMPRIS } from './cascade';
import type { Decision, Etage, EtatChat, NomEtage, ResultatEtage } from './types';

const etat: EtatChat = { noms: ['Ana', 'Bob'], rotation: false };
const signal = new AbortController().signal;
let horloge = 0;
const maintenant = (): number => (horloge += 5);

function etage(nom: NomEtage, sortie: ResultatEtage | null | Error, appels: string[] = []): Etage {
  return {
    nom,
    decider(commande) {
      appels.push(nom);
      if (sortie instanceof Error) return Promise.reject(sortie);
      void commande;
      return Promise.resolve(sortie);
    },
  };
}
const resultat = (decision: Decision, confiance?: number): ResultatEtage => ({
  decision,
  ...(confiance === undefined ? {} : { confiance }),
  trace: { entree: 'lance', sortie: '{"action":"lancer"}' },
});
const LANCER: Decision = { action: 'lancer', params: {} };

describe('cascade', () => {
  it('seul le SLM est enregistré (inactif sans modèle) et le refus est « incompris »', async () => {
    expect(ETAGES_ENREGISTRES.map((f) => f({}).nom)).toEqual(['slm']);
    const r = await decider('lance', etat, signal);
    expect(r.decision).toEqual(REFUS_INCOMPRIS);
    expect(r.etage).toBeNull();
    expect(REFUS_INCOMPRIS).toEqual({ action: 'refuser', code: 'incompris' });
  });

  it('s’arrête au premier résultat et garde la trace des étages essayés', async () => {
    const appels: string[] = [];
    const r = await decider('lance', etat, signal, {
      maintenant,
      etages: [etage('regles', null, appels), etage('decision', resultat(LANCER, 0.9), appels), etage('slm', resultat(LANCER), appels)],
    });
    expect(appels).toEqual(['regles', 'decision']);
    expect(r.decision).toBe(LANCER);
    expect(r.etage).toBe('decision');
    expect(r.confiance).toBe(0.9);
    expect(r.traces).toEqual([
      { etage: 'regles', entree: 'lance', sortie: null, dureeMs: 5 },
      { etage: 'decision', entree: 'lance', sortie: '{"action":"lancer"}', dureeMs: 5 },
    ]);
  });

  it('sans confiance, la clé est absente', async () => {
    const r = await decider('lance', etat, signal, { etages: [etage('regles', resultat(LANCER))] });
    expect('confiance' in r).toBe(false);
  });

  it('tous les étages passent la main : refus « incompris » et toutes les traces', async () => {
    const r = await decider('???', etat, signal, { maintenant, etages: [etage('regles', null), etage('slm', null)] });
    expect(r.decision).toEqual({ action: 'refuser', code: 'incompris' });
    expect(r.etage).toBeNull();
    expect(r.traces.map((t) => t.etage)).toEqual(['regles', 'slm']);
  });

  it('un étage qui échoue passe la main, l’erreur est tracée', async () => {
    const r = await decider('lance', etat, signal, {
      maintenant,
      etages: [etage('slm', new Error('Ollama absent')), etage('regles', resultat(LANCER))],
    });
    expect(r.etage).toBe('regles');
    expect(r.traces[0]).toEqual({ etage: 'slm', entree: 'lance', sortie: null, dureeMs: 5, erreur: 'Ollama absent' });
  });

  it('un signal annulé arrête la cascade', async () => {
    const c = new AbortController();
    c.abort();
    const appels: string[] = [];
    const r = await decider('lance', etat, c.signal, { etages: [etage('regles', resultat(LANCER), appels)] });
    expect(appels).toEqual([]);
    expect(r.decision).toEqual({ action: 'refuser', code: 'annule' });
  });

  it('une erreur due à l’annulation en cours d’étage arrête aussi la cascade', async () => {
    const c = new AbortController();
    const appels: string[] = [];
    const interrompu: Etage = {
      nom: 'slm',
      decider() {
        c.abort();
        return Promise.reject(new Error('abort'));
      },
    };
    const r = await decider('lance', etat, c.signal, { etages: [interrompu, etage('regles', resultat(LANCER), appels)] });
    expect(appels).toEqual([]);
    expect(r.decision).toEqual({ action: 'refuser', code: 'annule' });
    expect(r.traces).toHaveLength(1);
  });

  it('ignore une décision rendue après l’annulation', async () => {
    const c = new AbortController();
    const lent: Etage = {
      nom: 'slm',
      decider() {
        c.abort();
        return Promise.resolve(resultat(LANCER));
      },
    };
    const r = await decider('lance', etat, c.signal, { maintenant, etages: [lent] });
    expect(r.decision).toEqual({ action: 'refuser', code: 'annule' });
    expect(r.etage).toBeNull();
    expect(r.traces).toEqual([{ etage: 'slm', entree: 'lance', sortie: '{"action":"lancer"}', dureeMs: 5 }]);
  });

  it('construit les étages avec les options données', async () => {
    const vues: unknown[] = [];
    const fabrique = (options: { modele?: string }): Etage => {
      vues.push(options);
      return etage('slm', resultat(LANCER));
    };
    const r = await decider('lance', etat, signal, { fabriques: [fabrique], options: { modele: 'qwen' } });
    expect(vues).toEqual([{ modele: 'qwen' }]);
    expect(r.etage).toBe('slm');
    await decider('lance', etat, signal, { fabriques: [fabrique] });
    expect(vues[1]).toEqual({});
  });
});
