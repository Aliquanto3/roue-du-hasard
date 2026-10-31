// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../domain/palette';
import {
  alphaOmbre,
  composer,
  CONTRASTE_MIN,
  distanceLibelleBord,
  OMBRE_BASE,
  OMBRE_BORD,
  pireContrasteLibelle,
  ZONE_BORD,
} from './roue-relief';
import { dessinerImage } from './roue-rendu';

describe('alphaOmbre', () => {
  it('reste à la valeur de base hors de la zone de bord, et monte jusqu’au bord', () => {
    expect(alphaOmbre(ZONE_BORD)).toBe(OMBRE_BASE);
    expect(alphaOmbre(100)).toBe(OMBRE_BASE);
    expect(alphaOmbre(0)).toBeCloseTo(OMBRE_BORD, 10);
    expect(alphaOmbre(-3)).toBeCloseTo(OMBRE_BORD, 10);
    expect(alphaOmbre(ZONE_BORD / 2)).toBeGreaterThan(OMBRE_BASE);
    expect(alphaOmbre(ZONE_BORD / 2)).toBeLessThan(alphaOmbre(ZONE_BORD / 4));
  });

  it('les libellés s’arrêtent toujours hors de la zone de bord, à toute taille', () => {
    for (const taille of [100, 200, 320, 500, 800, 1000, 1600, 2400]) {
      expect(distanceLibelleBord(taille)).toBeGreaterThanOrEqual(ZONE_BORD);
    }
  });
});

describe('composer', () => {
  it('mélange source-over, canal par canal, avec arrondi', () => {
    expect(composer('#ffffff', [{ couleur: '#000000', alpha: 0.5 }])).toBe('#808080');
    expect(composer('#102030', [])).toBe('#102030');
    expect(composer('#000000', [{ couleur: '#ffffff', alpha: 0.1 }, { couleur: '#000000', alpha: 0.5 }])).toBe('#0d0d0d');
  });
});

describe('contraste des libellés avec relief', () => {
  for (const c of PALETTE) {
    it(`${c.nom} (${c.hex}, texte ${c.texte}) tient au moins ${String(CONTRASTE_MIN)}:1 sous ombrage et reflet`, () => {
      expect(pireContrasteLibelle(c.hex)).toBeGreaterThanOrEqual(CONTRASTE_MIN);
    });
  }

  it('un ombrage fort sous le libellé du vermillon casserait le seuil (la marge est réelle)', () => {
    const fond = composer('#D55E00', [{ couleur: '#111111', alpha: 0.2 }]);
    expect(fond).not.toBe('#D55E00');
    expect(pireContrasteLibelle('#D55E00')).toBeLessThan(5);
  });
});

interface Appel {
  op: string;
  transform: number[];
}

/** Canvas factice : enregistre les dessins et la matrice courante (frontière du DOM). */
function canvasFactice(cote: number): { canvas: HTMLCanvasElement; appels: Appel[] } {
  const appels: Appel[] = [];
  let m = [1, 0, 0, 1, 0, 0];
  const ctx = {
    setTransform: (...a: number[]) => {
      m = a;
    },
    rotate: (r: number) => {
      const [a, b, c, d, e, f] = m as [number, number, number, number, number, number];
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      m = [a * cos + c * sin, b * cos + d * sin, -a * sin + c * cos, -b * sin + d * cos, e, f];
    },
    clearRect: () => undefined,
    drawImage: (img: { nom: string }) => appels.push({ op: img.nom, transform: [...m] }),
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => appels.push({ op: 'pointeur-plat', transform: [...m] }),
    stroke: () => undefined,
  };
  const canvas = { width: cote, height: cote, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, appels };
}

const image = { nom: 'image' } as unknown as HTMLCanvasElement;
const fixe = { nom: 'fixe' } as unknown as HTMLCanvasElement;

describe('séparation couche tournante / couche fixe', () => {
  it('avec relief : l’image tourne, la couche fixe est dessinée une fois, sans rotation, et le pointeur plat disparaît', () => {
    const { canvas, appels } = canvasFactice(400);
    dessinerImage(canvas, image, 400, { rotation: 90 }, fixe);
    expect(appels.map((a) => a.op)).toEqual(['image', 'fixe']);
    const [a, b] = (appels[0] as Appel).transform as [number, number, number, number];
    expect(a).toBeCloseTo(0, 10);
    expect(b).toBeCloseTo(1, 10);
    expect((appels[1] as Appel).transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('sans relief : le dessin plat est inchangé (une image, puis le pointeur)', () => {
    const { canvas, appels } = canvasFactice(400);
    dessinerImage(canvas, image, 400, { rotation: 30 });
    expect(appels.map((a) => a.op)).toEqual(['image', 'pointeur-plat']);
  });

  it('pendant un fondu avec relief : deux images, une seule couche fixe', () => {
    const { canvas, appels } = canvasFactice(400);
    dessinerImage(canvas, image, 400, { rotation: 10, fondu: { depart: 200, progression: 0.5 } }, fixe);
    expect(appels.map((a) => a.op)).toEqual(['image', 'image', 'fixe']);
  });
});
