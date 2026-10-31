import { describe, expect, it } from 'vitest';
import {
  DUREE_CONFETTIS_MS,
  PARTICULES_MAX,
  PARTICULES_MIN,
  creerConfettis,
  nombreParticules,
} from './confettis';

class FauxCtx {
  rects = 0;
  globalAlpha = 1;
  fillStyle = '';
  setTransform(): void {}
  clearRect(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  rotate(): void {}
  fillRect(): void {
    this.rects++;
  }
}
class FauxCanvas {
  width = 0;
  height = 0;
  attrs: Record<string, string> = {};
  style = { cssText: '' };
  retire = false;
  constructor(readonly ctx: FauxCtx | null) {}
  getContext(): FauxCtx | null {
    return this.ctx;
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }
  remove(): void {
    this.retire = true;
  }
}

function monter(opts: { reduit?: boolean; ctxNul?: boolean; w?: number; h?: number } = {}) {
  const canvases: FauxCanvas[] = [];
  const ajoutes: FauxCanvas[] = [];
  const rappels = new Map<number, () => void>();
  let prochain = 1;
  let temps = 0;
  const conteneur = {
    clientWidth: opts.w ?? 800,
    clientHeight: opts.h ?? 600,
    appendChild: (c: unknown) => ajoutes.push(c as FauxCanvas),
  };
  let n = 0;
  const confettis = creerConfettis(conteneur, {
    reduit: opts.reduit ?? false,
    source: () => ((n++ * 0.37) % 1),
    maintenant: () => temps,
    demanderImage: (f) => {
      rappels.set(prochain, f);
      return prochain++;
    },
    annulerImage: (id) => rappels.delete(id),
    creerCanvas: () => {
      const c = new FauxCanvas(opts.ctxNul ? null : new FauxCtx());
      canvases.push(c);
      return c as unknown as HTMLCanvasElement;
    },
  });
  /** Joue la prochaine image à l'instant `t`. */
  const image = (t: number) => {
    temps = t;
    const [id, f] = [...rappels][0] ?? [];
    if (id === undefined || !f) return false;
    rappels.delete(id);
    f();
    return true;
  };
  return { confettis, canvases, ajoutes, rappels, image };
}

describe('nombreParticules', () => {
  it('est plafonné et adapté à la taille de l’écran', () => {
    expect(nombreParticules(320, 480)).toBe(PARTICULES_MIN);
    expect(nombreParticules(800, 600)).toBe(60);
    expect(nombreParticules(3840, 2160)).toBe(PARTICULES_MAX);
  });
});

describe('creerConfettis', () => {
  it('ajoute un canvas masqué aux lecteurs d’écran, sans événement de pointeur', () => {
    const { confettis, ajoutes } = monter();
    confettis.lancer(['#f00', '#0f0']);
    expect(ajoutes).toHaveLength(1);
    const c = ajoutes[0]!;
    expect(c.attrs['aria-hidden']).toBe('true');
    expect(c.style.cssText).toContain('pointer-events:none');
    expect(c.width).toBe(800);
    expect(c.height).toBe(600);
  });

  it('dessine le nombre de particules prévu à chaque image', () => {
    const { confettis, canvases, image } = monter();
    confettis.lancer(['#f00']);
    image(100);
    expect(canvases[0]?.ctx?.rects).toBe(60);
  });

  it('retire le canvas et la boucle à la fin, après moins de 4 s', () => {
    const { confettis, canvases, rappels, image } = monter();
    confettis.lancer(['#f00']);
    expect(DUREE_CONFETTIS_MS).toBeLessThan(4000);
    image(DUREE_CONFETTIS_MS - 1);
    expect(canvases[0]?.retire).toBe(false);
    expect(rappels.size).toBe(1);
    image(DUREE_CONFETTIS_MS);
    expect(canvases[0]?.retire).toBe(true);
    expect(rappels.size).toBe(0);
    expect(image(DUREE_CONFETTIS_MS + 16)).toBe(false);
  });

  it('relancer pendant une animation ne cumule pas les boucles', () => {
    const { confettis, canvases, rappels } = monter();
    confettis.lancer(['#f00']);
    confettis.lancer(['#00f']);
    confettis.lancer(['#0f0']);
    expect(rappels.size).toBe(1);
    expect(canvases.map((c) => c.retire)).toEqual([true, true, false]);
  });

  it('arreter() retire le canvas et annule la boucle', () => {
    const { confettis, canvases, rappels } = monter();
    confettis.lancer(['#f00']);
    confettis.arreter();
    expect(rappels.size).toBe(0);
    expect(canvases[0]?.retire).toBe(true);
    expect(() => confettis.arreter()).not.toThrow();
  });

  it('ne fait rien en mouvement réduit (N6)', () => {
    const { confettis, canvases, rappels, ajoutes } = monter({ reduit: true });
    confettis.lancer(['#f00']);
    expect(canvases).toHaveLength(0);
    expect(ajoutes).toHaveLength(0);
    expect(rappels.size).toBe(0);
  });

  it('un contexte 2D nul ne lève pas et ne laisse rien', () => {
    const { confettis, ajoutes, rappels } = monter({ ctxNul: true });
    expect(() => confettis.lancer(['#f00'])).not.toThrow();
    expect(ajoutes).toHaveLength(0);
    expect(rappels.size).toBe(0);
  });

  it('sans couleur : aucun canvas', () => {
    const { confettis, canvases } = monter();
    confettis.lancer([]);
    expect(canvases).toHaveLength(0);
  });
});
