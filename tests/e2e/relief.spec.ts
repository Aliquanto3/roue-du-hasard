import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { PALETTE } from '../../src/domain/palette';
import { CONTRASTE_MIN, PART_CONTRASTE_PLAT, pireContrasteLibelle } from '../../src/ui/roue-relief';
import type { Harnais } from '../harnais/harnais';

declare global {
  interface Window {
    harnais: Harnais;
  }
}

const base = pathToFileURL(resolve('dist-harnais/index.html')).href;
const RELIEF = 'relief=1&duree=150&source=milieu';
/** Le relief assombrit un peu le bord : lecture de pixel tolérante, voisines distinctes (ΔE ≥ 18). */
const TOLERANCE = 14;

async function ouvrir(page: Page, params: string): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  await page.goto(`${base}?${params}`);
  await page.waitForFunction(() => window.harnais !== undefined);
  return erreurs;
}

for (const n of [2, 10, 200]) {
  test(`relief, ${String(n)} noms : arrêt exact sous le pointeur, par le domaine et par le pixel`, async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    const erreurs = await ouvrir(page, `n=${String(n)}&${RELIEF}`);
    expect(await page.evaluate(() => window.harnais.roue.relief)).toBe(true);
    for (const index of [0, n - 1, Math.floor(n / 2)]) {
      const r = await page.evaluate(async (i) => {
        const h = window.harnais;
        const resultat = await h.lancer(i);
        return { resultat, sous: h.indexSousPointeur(), pixel: h.pixelPointe(), attendu: h.couleurAttendue(i) };
      }, index);
      expect(r.resultat.accepte).toBe(true);
      expect(r.sous).toBe(index);
      for (const c of [0, 1, 2]) {
        expect(Math.abs((r.pixel[c] as number) - (r.attendu[c] as number))).toBeLessThanOrEqual(TOLERANCE);
      }
      expect(r.pixel[3]).toBe(255);
    }
    expect(erreurs).toEqual([]);
  });
}

test('relief : le bandeau F10 reste affiché à 200 noms', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  const erreurs = await ouvrir(page, `n=200&${RELIEF}`);
  await page.evaluate(() => window.harnais.lancer(37));
  await expect(page.locator('.roue__bandeau')).toHaveText('Nom 37');
  expect(erreurs).toEqual([]);
});

test('bascule du relief pendant et après une rotation : ni saut d’angle ni autre gagnant', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  const erreurs = await ouvrir(page, 'n=10&duree=1500&source=milieu');
  const r = await page.evaluate(async () => {
    const h = window.harnais;
    const promesse = h.lancer(6);
    await new Promise((suite) => setTimeout(suite, 500));
    const avant = h.roue.rotation;
    h.roue.definirRelief(true);
    const apres = h.roue.rotation;
    const enRotation = h.roue.enRotation;
    await new Promise((suite) => setTimeout(suite, 300));
    h.roue.definirRelief(false);
    h.roue.definirRelief(true);
    const resultat = await promesse;
    const sous = h.indexSousPointeur();
    const pixelAvecRelief = h.pixelPointe();
    const rotation = h.roue.rotation;
    h.roue.definirRelief(false);
    return {
      avant,
      apres,
      enRotation,
      resultat,
      sous,
      pixelAvecRelief,
      rotation,
      rotationPlat: h.roue.rotation,
      sousPlat: h.indexSousPointeur(),
      pixelPlat: h.pixelPointe(),
      attendu: h.couleurAttendue(6),
    };
  });
  expect(r.enRotation).toBe(true);
  expect(r.apres).toBe(r.avant);
  expect(r.resultat.accepte).toBe(true);
  expect(r.sous).toBe(6);
  expect(r.sousPlat).toBe(6);
  expect(r.rotationPlat).toBe(r.rotation);
  for (const c of [0, 1, 2]) {
    expect(Math.abs((r.pixelAvecRelief[c] as number) - (r.attendu[c] as number))).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs((r.pixelPlat[c] as number) - (r.attendu[c] as number))).toBeLessThanOrEqual(3);
  }
  // Même angle d'arrêt qu'une rotation sans bascule.
  const page2 = await page.context().newPage();
  await page2.setViewportSize({ width: 800, height: 800 });
  await page2.goto(`${base}?n=10&duree=150&source=milieu`);
  await page2.waitForFunction(() => window.harnais !== undefined);
  const rotationTemoin = await page2.evaluate(async () => {
    await window.harnais.lancer(6);
    return window.harnais.roue.rotation;
  });
  expect(r.rotation).toBe(rotationTemoin);
  expect(erreurs).toEqual([]);
});

test('le reflet reste fixe pendant que la roue tourne', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  const erreurs = await ouvrir(
    page,
    'duree=150&source=milieu&relief=1',
  );
  // Trois secteurs de même couleur : l'image tournante est la même à chaque arrêt (pas de 120°),
  // seule la lumière fixe peut distinguer deux points symétriques.
  const mesures = await page.evaluate(async () => {
    const h = window.harnais;
    h.definir([0, 1, 2].map(() => ({ nom: '', couleur: '#3366CC' })));
    const sorties: { reflet: number; oppose: number; rotation: number }[] = [];
    for (const i of [0, 1, 2]) {
      await h.lancer(i);
      const a = h.pixelRelatif(-0.35, -0.4);
      const b = h.pixelRelatif(0.35, 0.4);
      const somme = (p: number[]): number => (p[0] as number) + (p[1] as number) + (p[2] as number);
      sorties.push({ reflet: somme(a), oppose: somme(b), rotation: h.roue.rotation });
    }
    return sorties;
  });
  expect(new Set(mesures.map((m) => m.rotation)).size).toBeGreaterThan(1);
  for (const m of mesures) expect(m.reflet - m.oppose).toBeGreaterThanOrEqual(4);
  const ecarts = mesures.map((m) => m.reflet - m.oppose);
  expect(Math.max(...ecarts) - Math.min(...ecarts)).toBeLessThanOrEqual(3);
  expect(erreurs).toEqual([]);
});

test('relief, 100 noms : l’image médiane reste proche de celle du rendu plat (N7)', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1000, height: 1000 });
  const erreurs = await ouvrir(page, 'duree=2000&source=milieu');
  const m = await page.evaluate(async () => {
    const h = window.harnais;
    h.definirN(100);
    const mesurer = async (relief: boolean): Promise<{ mediane: number; sous: number }> => {
      h.roue.definirRelief(relief);
      const promesse = h.lancer(77);
      const intervalles = await h.intervallesImages();
      await promesse;
      const tries = [...intervalles].sort((a, b) => a - b);
      return { mediane: tries[Math.floor(tries.length / 2)] as number, sous: h.indexSousPointeur() };
    };
    const plat = await mesurer(false);
    const relief = await mesurer(true);
    return { plat, relief };
  });
  console.log(`${browserName}, 100 noms, image médiane : plat ${m.plat.mediane.toFixed(1)} ms, relief ${m.relief.mediane.toFixed(1)} ms`);
  // WebKit sans carte graphique, en CI : médiane trop lente et instable pour un seuil de temps.
  if (browserName !== 'webkit') {
    expect(m.relief.mediane).toBeLessThanOrEqual(m.plat.mediane * 1.5 + 5);
    expect(m.relief.mediane).toBeLessThan(50);
  }
  expect(m.relief.sous).toBe(77);
  expect(erreurs).toEqual([]);
});

/** Contraste mesuré sur les pixels rendus, là où le texte couvre entièrement le pixel. */
async function contrasteRendu(page: Page, couleur: string, n: number): Promise<{ plat: number; relief: number; pixels: number }> {
  return page.evaluate(
    ({ couleur, n }) => {
      const h = window.harnais;
      const lin = Array.from({ length: 256 }, (_, i) => {
        const c = i / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      const lum = (d: Uint8ClampedArray, i: number): number =>
        0.2126 * (lin[d[i] as number] as number) +
        0.7152 * (lin[d[i + 1] as number] as number) +
        0.0722 * (lin[d[i + 2] as number] as number);
      const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const rendre = (relief: boolean, nom: string): Uint8ClampedArray => {
        h.roue.definirRelief(relief);
        h.definir(Array.from({ length: n }, () => ({ nom, couleur })));
        const c = h.roue.canvas;
        return (c.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height).data;
      };
      const texte = 'M'.repeat(40);
      const platT = rendre(false, texte);
      const platF = rendre(false, '');
      const reliefT = rendre(true, texte);
      const reliefF = rendre(true, '');
      const ecart = (i: number): number =>
        Math.abs((platT[i] as number) - (platF[i] as number)) +
        Math.abs((platT[i + 1] as number) - (platF[i + 1] as number)) +
        Math.abs((platT[i + 2] as number) - (platF[i + 2] as number));
      let max = 0;
      for (let i = 0; i < platT.length; i += 4) max = Math.max(max, ecart(i));
      let plat = Infinity;
      let relief = Infinity;
      let pixels = 0;
      for (let i = 0; i < platT.length; i += 4) {
        if (ecart(i) < max) continue;
        pixels++;
        plat = Math.min(plat, ratio(lum(platT, i), lum(platF, i)));
        relief = Math.min(relief, ratio(lum(reliefT, i), lum(reliefF, i)));
      }
      return { plat, relief, pixels };
    },
    { couleur, n },
  );
}

test.describe('contraste des libellés sur les pixels rendus', () => {
  test.use({ viewport: { width: 800, height: 800 }, deviceScaleFactor: 2 });

  // À 12 noms un libellé passe sous le pic du reflet ; à 3, un autre descend vers l'ombre du moyeu.
  for (const n of [3, 12]) {
    test(`palette, ${String(n)} noms : au moins 4,5:1 en relief`, async ({ page }) => {
      await ouvrir(page, 'duree=150&source=milieu');
      for (const { hex } of PALETTE) {
        const m = await contrasteRendu(page, hex, n);
        console.log(`${hex} n=${String(n)} plat ${m.plat.toFixed(3)} relief ${m.relief.toFixed(3)}`);
        expect(m.pixels, hex).toBeGreaterThan(100);
        expect(m.relief, hex).toBeGreaterThanOrEqual(CONTRASTE_MIN);
        if (n === 12) expect(m.relief, `${hex} : le pic du reflet est mesuré`).toBeLessThan(pireContrasteLibelle(hex) * 1.03);
      }
    });

    test(`couleurs personnalisées, ${String(n)} noms : perte d'au plus 15 %`, async ({ page }) => {
      await ouvrir(page, 'duree=150&source=milieu');
      for (const couleur of ['#797979', '#FF0000', '#FFFFFF', '#000000']) {
        const m = await contrasteRendu(page, couleur, n);
        expect(m.relief, couleur).toBeGreaterThanOrEqual(PART_CONTRASTE_PLAT * m.plat);
      }
    });
  }
});

test('relief : l’ombre portée s’éteint avant le bord du canvas', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await ouvrir(page, `n=12&${RELIEF}`);
  const alpha = await page.evaluate(() => {
    const c = window.harnais.roue.canvas;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    return ctx.getImageData(Math.floor(c.width / 2), c.height - 1, 1, 1).data[3] as number;
  });
  expect(alpha).toBeLessThanOrEqual(3);
});

test('un clic sur la jante lance la roue en relief, sans effet au même point en rendu plat', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  const erreurs = await ouvrir(page, `n=12&${RELIEF}`);
  const cadre = await page.evaluate(() => {
    const r = window.harnais.roue.canvas.getBoundingClientRect();
    return { gauche: r.left, haut: r.top, cote: r.width };
  });
  // Point de la jante, sous le centre : la marge vaut 4 % du côté, la jante 60 % de la marge.
  const x = cadre.gauche + cadre.cote / 2;
  const y = cadre.haut + cadre.cote * 0.97;
  const demandes = (): Promise<number> => page.evaluate(() => window.harnais.journal.demandes);
  await page.evaluate(() => {
    window.harnais.roue.definirRelief(false);
  });
  await page.mouse.click(x, y);
  expect(await demandes()).toBe(0);
  await page.evaluate(() => {
    window.harnais.roue.definirRelief(true);
  });
  await page.mouse.click(x, y);
  expect(await demandes()).toBe(1);
  expect(erreurs).toEqual([]);
});
