import { describe, expect, it } from 'vitest';
import {
  type ContexteAudio,
  type GainAudio,
  type OscillateurAudio,
  DUREE_FANFARE_S,
  INTERVALLE_CLIQUETIS_MS,
  VOLUME_MAITRE,
  creerSon,
} from './son';

class FauxNoeud {
  connecte = true;
  connect(): void {}
  disconnect(): void {
    this.connecte = false;
  }
}
class FauxOsc extends FauxNoeud {
  type = '';
  frequency = { value: 0, setValueAtTime: () => 0, linearRampToValueAtTime: () => 0 };
  onended: (() => void) | null = null;
  debut = -1;
  fin = -1;
  start(t: number): void {
    this.debut = t;
  }
  stop(t: number): void {
    this.fin = t;
  }
}
class FauxGain extends FauxNoeud {
  gain = { value: 1, setValueAtTime: () => 0, linearRampToValueAtTime: () => 0 };
}
class FauxContexte {
  currentTime = 10;
  state = 'suspended';
  destination = {};
  oscillateurs: FauxOsc[] = [];
  gains: FauxGain[] = [];
  reprises = 0;
  createOscillator(): OscillateurAudio {
    const o = new FauxOsc();
    this.oscillateurs.push(o);
    return o as unknown as OscillateurAudio;
  }
  createGain(): GainAudio {
    const g = new FauxGain();
    this.gains.push(g);
    return g as unknown as GainAudio;
  }
  resume(): Promise<void> {
    this.reprises++;
    this.state = 'running';
    return Promise.resolve();
  }
}

function monter() {
  const ctx = new FauxContexte();
  let temps = 1000;
  let creations = 0;
  const son = creerSon({
    creerContexte: () => {
      creations++;
      return ctx as unknown as ContexteAudio;
    },
    maintenant: () => temps,
  });
  return {
    ctx,
    son,
    avancer: (ms: number) => (temps += ms),
    creations: () => creations,
  };
}

describe('creerSon', () => {
  it('ne crée aucun contexte avant preparer() et ne joue rien', () => {
    const { ctx, son, creations } = monter();
    son.cliquetis(3);
    son.fanfare();
    expect(creations()).toBe(0);
    expect(ctx.oscillateurs).toHaveLength(0);
  });

  it('preparer() crée le contexte une fois et le reprend s’il est suspendu', () => {
    const { ctx, son, creations } = monter();
    son.preparer();
    son.preparer();
    expect(creations()).toBe(1);
    expect(ctx.reprises).toBe(1);
    expect(ctx.gains[0]?.gain.value).toBe(VOLUME_MAITRE);
  });

  it('plafonne les cliquetis à 20 par seconde, quel que soit franchis', () => {
    const { ctx, son, avancer } = monter();
    son.preparer();
    son.cliquetis(1000);
    son.cliquetis(1000);
    avancer(INTERVALLE_CLIQUETIS_MS - 1);
    son.cliquetis(50);
    expect(ctx.oscillateurs).toHaveLength(1);
    avancer(1);
    son.cliquetis(1);
    expect(ctx.oscillateurs).toHaveLength(2);
    // Une seconde d’appels à chaque image (16 ms) : au plus 20 sons.
    ctx.oscillateurs.length = 0;
    for (let i = 0; i < 63; i++) {
      avancer(16);
      son.cliquetis(1000);
    }
    expect(ctx.oscillateurs.length).toBeLessThanOrEqual(20);
    expect(ctx.oscillateurs.length).toBeGreaterThanOrEqual(15);
  });

  it('ignore franchis nul ou négatif', () => {
    const { ctx, son } = monter();
    son.preparer();
    son.cliquetis(0);
    son.cliquetis(-2);
    expect(ctx.oscillateurs).toHaveLength(0);
  });

  it('déconnecte chaque source et son gain à sa fin', () => {
    const { ctx, son, avancer } = monter();
    son.preparer();
    for (let i = 0; i < 5; i++) {
      son.cliquetis(1);
      avancer(INTERVALLE_CLIQUETIS_MS);
    }
    son.fanfare();
    const sources = ctx.oscillateurs;
    expect(sources).toHaveLength(9);
    expect(sources.every((o) => o.connecte)).toBe(true);
    for (const o of sources) o.onended?.();
    expect(sources.every((o) => !o.connecte)).toBe(true);
    // gains de source (le premier est le gain maître, qui reste connecté)
    expect(ctx.gains.slice(1).every((g) => !g.connecte)).toBe(true);
    expect(ctx.gains[0]?.connecte).toBe(true);
  });

  it('la fanfare dure moins de 2 s avec un volume maîtrisé', () => {
    const { ctx, son } = monter();
    son.preparer();
    son.fanfare();
    expect(ctx.oscillateurs).toHaveLength(4);
    const fin = Math.max(...ctx.oscillateurs.map((o) => o.fin)) - ctx.currentTime;
    expect(fin).toBeCloseTo(DUREE_FANFARE_S, 5);
    expect(fin).toBeLessThan(2);
    expect(VOLUME_MAITRE).toBeLessThanOrEqual(0.2);
  });

  it('couper() agit aussitôt, y compris sur une fanfare en cours', () => {
    const { ctx, son } = monter();
    son.preparer();
    son.fanfare();
    expect(ctx.oscillateurs.every((o) => o.connecte)).toBe(true);
    son.couper(true);
    expect(son.estCoupe()).toBe(true);
    expect(ctx.gains[0]?.gain.value).toBe(0);
    expect(ctx.oscillateurs.every((o) => !o.connecte && o.fin === 0)).toBe(true);
    son.cliquetis(5);
    son.fanfare();
    expect(ctx.oscillateurs).toHaveLength(4);
    son.couper(false);
    expect(son.estCoupe()).toBe(false);
    expect(ctx.gains[0]?.gain.value).toBe(VOLUME_MAITRE);
    son.fanfare();
    expect(ctx.oscillateurs).toHaveLength(8);
  });

  it('une coupure demandée avant preparer() s’applique au contexte créé ensuite', () => {
    const { ctx, son } = monter();
    son.couper(true);
    son.preparer();
    expect(ctx.gains[0]?.gain.value).toBe(0);
    son.fanfare();
    expect(ctx.oscillateurs).toHaveLength(0);
  });

  it('sans AudioContext : aucune levée, tout est sans effet', () => {
    const son = creerSon({ creerContexte: () => null });
    expect(() => {
      son.preparer();
      son.cliquetis(4);
      son.fanfare();
      son.couper(true);
    }).not.toThrow();
    expect(son.estCoupe()).toBe(true);
  });

  it('le contexte par défaut est absent en environnement sans AudioContext', () => {
    expect(() => {
      const son = creerSon();
      son.preparer();
      son.cliquetis(1);
    }).not.toThrow();
  });

  it('une exception à la création ou en jouant ne se propage pas', () => {
    const son = creerSon({
      creerContexte: () => {
        throw new Error('refusé');
      },
    });
    expect(() => {
      son.preparer();
      son.fanfare();
    }).not.toThrow();

    const ctx = new FauxContexte();
    ctx.createOscillator = () => {
      throw new Error('boum');
    };
    const son2 = creerSon({ creerContexte: () => ctx as unknown as ContexteAudio, maintenant: () => 0 });
    son2.preparer();
    expect(() => {
      son2.cliquetis(1);
      son2.fanfare();
    }).not.toThrow();
  });
});
