import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
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

test('relief, 1 000 noms : mesure du pré-rendu et de l’image médiane', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1000 });
  const erreurs = await ouvrir(page, 'relief=1&duree=2000&source=milieu');
  const m = await page.evaluate(async () => {
    const h = window.harnais;
    const prerendu = h.definirN(1000);
    const promesse = h.lancer(777);
    const intervalles = await h.intervallesImages();
    await promesse;
    const tries = [...intervalles].sort((a, b) => a - b);
    return { prerendu, images: intervalles.length, mediane: tries[Math.floor(tries.length / 2)] as number, sous: h.indexSousPointeur() };
  });
  console.log(
    `1000 noms, relief : pré-rendu ${m.prerendu.toFixed(1)} ms, image médiane ${m.mediane.toFixed(1)} ms, ${String(m.images)} images`,
  );
  expect(m.prerendu).toBeLessThan(1000);
  expect(m.mediane).toBeLessThan(150);
  expect(m.sous).toBe(777);
  expect(erreurs).toEqual([]);
});
