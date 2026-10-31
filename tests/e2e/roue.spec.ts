import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Harnais } from '../harnais/harnais';

declare global {
  interface Window {
    harnais: Harnais;
    suspendreImages?: boolean;
  }
}

const base = pathToFileURL(resolve('dist-harnais/index.html')).href;
const RAPIDE = 'duree=150&source=milieu';

const canvas = (page: Page) => page.locator('canvas.roue__canvas');
const bandeau = (page: Page) => page.locator('.roue__bandeau');

async function ouvrir(page: Page, params: string): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`${base}?${params}`);
  await page.waitForFunction(() => window.harnais !== undefined);
  return erreurs;
}

/** Lance vers `index` et vérifie le secteur à l'arrêt, par le domaine et par le pixel. */
async function verifierArret(page: Page, index: number): Promise<void> {
  const r = await page.evaluate(async (i) => {
    const h = window.harnais;
    const resultat = await h.lancer(i);
    return {
      resultat,
      sousPointeur: h.indexSousPointeur(),
      pixel: h.pixelPointe(),
      attendu: h.couleurAttendue(i),
      enRotation: h.roue.enRotation,
    };
  }, index);
  expect(r.resultat.accepte).toBe(true);
  expect(r.enRotation).toBe(false);
  expect(r.sousPointeur).toBe(index);
  for (const c of [0, 1, 2]) {
    expect(Math.abs((r.pixel[c] as number) - (r.attendu[c] as number))).toBeLessThanOrEqual(3);
  }
  expect(r.pixel[3]).toBe(255);
}

for (const n of [2, 3, 10]) {
  test(`à ${String(n)} noms, à position aléatoire, le secteur sous le pointeur est le gagnant`, async ({ page }) => {
    const erreurs = await ouvrir(page, `n=${String(n)}&duree=150`);
    for (const index of [0, n - 1, Math.floor(n / 2)]) await verifierArret(page, index);
    expect(erreurs).toEqual([]);
  });
}

test('à 200 noms, le secteur sous le pointeur est le gagnant et le bandeau affiche son nom', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  const erreurs = await ouvrir(page, `n=200&${RAPIDE}`);
  for (const index of [0, 37, 199]) {
    await verifierArret(page, index);
    await expect(bandeau(page)).toHaveText(`Nom ${String(index)}`);
  }
  expect(erreurs).toEqual([]);
});

test('une couleur personnalisée ne remplace que son secteur', async ({ page }) => {
  await ouvrir(page, RAPIDE);
  await page.evaluate(() =>
    window.harnais.definir([
      { nom: 'A', couleur: null },
      { nom: 'B', couleur: '#123456' },
      { nom: 'C', couleur: null },
    ]),
  );
  const c = await page.evaluate(() => [0, 1, 2].map((i) => window.harnais.couleurAttendue(i)));
  expect(c).toEqual([
    [0xe6, 0x9f, 0x00],
    [0x12, 0x34, 0x56],
    [0x00, 0x72, 0xb2],
  ]);
  for (const index of [1, 0, 2]) await verifierArret(page, index);
});

test('la vraie rotation dure de 4 à 6 s, fait au moins 4 tours, et refuse un second lancement', async ({ page }) => {
  await ouvrir(page, 'n=10');
  const r = await page.evaluate(async () => {
    const h = window.harnais;
    const t0 = performance.now();
    const promesse = h.lancer(3);
    const pendant = h.roue.enRotation;
    const refus = await h.lancer(4);
    const boutonVerrouille = h.roue.bouton.getAttribute('aria-disabled');
    const resultat = await promesse;
    return {
      duree: performance.now() - t0,
      pendant,
      refus,
      boutonVerrouille,
      resultat,
      journal: { ...h.journal },
      apres: h.roue.bouton.getAttribute('aria-disabled'),
      sousPointeur: h.indexSousPointeur(),
    };
  });
  expect(r.pendant).toBe(true);
  expect(r.refus).toEqual({ accepte: false, raison: 'en-rotation' });
  expect(r.boutonVerrouille).toBe('true');
  expect(r.apres).toBe('false');
  expect(r.duree).toBeGreaterThanOrEqual(4000);
  expect(r.duree).toBeLessThan(6500);
  expect(r.journal.franchis).toBeGreaterThanOrEqual(40);
  expect(r.journal.debuts).toBe(1);
  expect(r.journal.fins).toBe(1);
  expect(r.sousPointeur).toBe(3);
});

test('la rotation se termine au bon angle si requestAnimationFrame s’arrête', async ({ page }) => {
  await page.addInitScript(() => {
    const vrai = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (rappel) => (window.suspendreImages ? 1 : vrai(rappel));
  });
  await ouvrir(page, `n=10&${RAPIDE}`);
  await page.evaluate(() => {
    window.suspendreImages = true;
  });
  await verifierArret(page, 6);
});

test('mouvement réduit : fondu court, sans secteur franchi, lu à chaque lancement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const erreurs = await ouvrir(page, 'n=10&duree=1500&source=milieu');
  const r = await page.evaluate(async () => {
    const t0 = performance.now();
    const resultat = await window.harnais.lancer(4);
    return { resultat, duree: performance.now() - t0, franchis: window.harnais.journal.franchis };
  });
  expect(r.resultat.accepte).toBe(true);
  expect(r.duree).toBeLessThan(1000);
  expect(r.franchis).toBe(0);
  await verifierArret(page, 7);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const animee = await page.evaluate(async () => {
    const t0 = performance.now();
    await window.harnais.lancer(1);
    return { duree: performance.now() - t0, franchis: window.harnais.journal.franchis };
  });
  expect(animee.duree).toBeGreaterThanOrEqual(1500);
  expect(animee.franchis).toBeGreaterThanOrEqual(40);
  expect(erreurs).toEqual([]);
});

test('redimensionner pendant la rotation ne perturbe ni la fin ni l’arrêt, et réévalue F10', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1000 });
  const erreurs = await ouvrir(page, 'n=100&duree=1500&source=milieu');
  expect(Number(await canvas(page).getAttribute('data-corps'))).toBeGreaterThanOrEqual(11);
  await expect(bandeau(page)).toBeHidden();

  await page.evaluate(() => {
    void window.harnais.lancer(42);
  });
  await page.setViewportSize({ width: 340, height: 700 });
  await expect(bandeau(page)).toBeVisible();
  await page.waitForFunction(() => !window.harnais.roue.enRotation);
  expect(await page.evaluate(() => window.harnais.indexSousPointeur())).toBe(42);
  await expect(bandeau(page)).toHaveText('Nom 42');
  expect(Number(await canvas(page).getAttribute('data-corps'))).toBeLessThan(11);
  await verifierArret(page, 9);

  await page.setViewportSize({ width: 1000, height: 1000 });
  await expect(bandeau(page)).toBeHidden();
  expect(erreurs).toEqual([]);
});

test('une liste reçue pendant la rotation est appliquée à l’arrêt', async ({ page }) => {
  await ouvrir(page, `n=5&${RAPIDE}`);
  const r = await page.evaluate(async () => {
    const h = window.harnais;
    const promesse = h.lancer(2);
    h.definirN(3);
    const pendant = h.roue.nombre;
    await promesse;
    return { pendant, apres: h.roue.nombre };
  });
  expect(r).toEqual({ pendant: 5, apres: 3 });
  await expect(canvas(page)).toHaveAttribute('data-noms', '3');
});

test('un nom hostile reste du texte dans le bandeau', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 700 });
  await ouvrir(page, RAPIDE);
  const hostile = '<img src=x onerror=alert(1)>';
  await page.evaluate(
    (nom) => window.harnais.definir(Array.from({ length: 300 }, () => ({ nom, couleur: null }))),
    hostile,
  );
  await expect(bandeau(page)).toHaveText(hostile);
  await expect(bandeau(page).locator('img')).toHaveCount(0);
});

test('avec 0 ou 1 nom, roue neutre sans plantage et lancement impossible', async ({ page }) => {
  const erreurs = await ouvrir(page, RAPIDE);
  for (const n of [0, 1]) {
    await page.evaluate((k) => window.harnais.definirN(k), n);
    await expect(page.locator('.roue__indice')).toBeVisible();
    await expect(page.locator('.roue__bouton')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('.roue__bouton').click({ force: true });
    await canvas(page).click();
    expect(await page.evaluate(() => window.harnais.journal.demandes)).toBe(0);
    expect(await page.evaluate(() => window.harnais.lancer(0))).toEqual({
      accepte: false,
      raison: 'trop-peu-de-noms',
    });
  }
  await page.evaluate(() => window.harnais.definirN(2));
  await expect(page.locator('.roue__indice')).toBeHidden();
  await expect(page.locator('.roue__bouton')).toHaveAttribute('aria-disabled', 'false');
  expect(erreurs).toEqual([]);
});

test('bouton, Entrée, Espace et clic sur la roue lancent ; un glisser ne lance pas', async ({ page }) => {
  await ouvrir(page, `n=5&${RAPIDE}`);
  const attendreFin = (k: number) =>
    page.waitForFunction((f) => window.harnais.journal.fins === f && !window.harnais.roue.enRotation, k);

  await page.locator('.roue__bouton').click();
  await attendreFin(1);
  await page.locator('.roue__bouton').focus();
  await page.keyboard.press('Enter');
  await attendreFin(2);
  await page.keyboard.press('Space');
  await attendreFin(3);
  await canvas(page).click();
  await attendreFin(4);

  const cadre = await canvas(page).boundingBox();
  if (!cadre) throw new Error('canvas absent');
  const cx = cadre.x + cadre.width / 2;
  const cy = cadre.y + cadre.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 3 });
  await page.mouse.move(cx, cy);
  await page.mouse.up();
  // Hors du disque : un coin du canvas ne lance pas.
  await page.mouse.click(cadre.x + 2, cadre.y + cadre.height - 2);

  const demandes = await page.evaluate(() => {
    const c = window.harnais.roue.canvas;
    const evenement = (type: string) =>
      new PointerEvent(type, { pointerId: 9, isPrimary: true, button: 0, clientX: 300, clientY: 300 });
    c.dispatchEvent(evenement('pointerdown'));
    c.dispatchEvent(evenement('pointercancel'));
    c.dispatchEvent(evenement('pointerup'));
    return window.harnais.journal.demandes;
  });
  expect(demandes).toBe(4);
  expect(await page.evaluate(() => window.harnais.journal.debuts)).toBe(4);
});

test.describe('toucher', () => {
  test.use({ hasTouch: true });
  test('un toucher lance une seule fois, sans doublon par le clic synthétique', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Playwright ne simule pas le toucher sous Firefox');
    await ouvrir(page, 'n=5&duree=800&source=milieu');
    const cadre = await canvas(page).boundingBox();
    if (!cadre) throw new Error('canvas absent');
    await page.touchscreen.tap(cadre.x + cadre.width / 2, cadre.y + cadre.height / 2);
    await page.waitForFunction(() => window.harnais.journal.fins === 1);
    const journal = await page.evaluate(() => window.harnais.journal);
    expect(journal.demandes).toBe(1);
    expect(journal.debuts).toBe(1);
  });
});

test('à 1 000 noms, le rendu tient et le rappel de secteur reste agrégé par image', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1000 });
  const erreurs = await ouvrir(page, 'duree=2000&source=milieu');
  const m = await page.evaluate(async () => {
    const h = window.harnais;
    const prerendu = h.definirN(1000);
    const promesse = h.lancer(777);
    const intervalles = await h.intervallesImages();
    await promesse;
    const tries = [...intervalles].sort((a, b) => a - b);
    return {
      prerendu,
      images: intervalles.length,
      mediane: tries[Math.floor(tries.length / 2)] as number,
      journal: h.journal,
      sousPointeur: h.indexSousPointeur(),
    };
  });
  console.log(
    `1000 noms : pré-rendu ${m.prerendu.toFixed(1)} ms, image médiane ${m.mediane.toFixed(1)} ms, ${String(m.images)} images`,
  );
  // Seuils tolérants pour la CI ; N7 vise 16 ms sur PC et 33 ms sur téléphone.
  expect(m.prerendu).toBeLessThan(1000);
  expect(m.mediane).toBeLessThan(150);
  expect(m.sousPointeur).toBe(777);
  expect(m.journal.franchis).toBeGreaterThanOrEqual(4000);
  expect(m.journal.appelsSecteur).toBeLessThanOrEqual(m.images + 2);
  expect(erreurs).toEqual([]);
});

test('le fichier livré ne contient rien du harnais', () => {
  const html = readFileSync(resolve('dist/roue.html'), 'utf8');
  for (const interdit of ['harnais', '__test', 'URLSearchParams', 'Math.random', 'innerHTML']) {
    expect(html).not.toContain(interdit);
  }
});
