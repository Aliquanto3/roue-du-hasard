import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Story 7.1 : mode projection (F18), `dist/roue.html` en file://, plus un cas sur l'édition chat.
const url = pathToFileURL(resolve('dist/roue.html')).href;

const boutonProjection = (page: Page) => page.getByRole('button', { name: 'Mode projection' });
const boutonLancer = (page: Page) => page.getByRole('button', { name: 'Lancer la roue' });
const pageApp = (page: Page) => page.locator('.page');
const dialogue = (page: Page) => page.getByRole('dialog');

type Fullscreen = 'simule' | 'absent' | 'refuse';

/** API Fullscreen simulée (sortie du navigateur par `sortieNavigateur()`), absente (iPhone) ou refusée. */
async function preparer(page: Page, fullscreen: Fullscreen): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  await page.addInitScript((mode: Fullscreen) => {
    const w = window as unknown as { sortieNavigateur: () => void; demandes: number };
    w.demandes = 0;
    if (mode === 'absent') {
      Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: undefined });
      return;
    }
    if (mode === 'refuse') {
      Element.prototype.requestFullscreen = function () {
        w.demandes++;
        return Promise.reject(new TypeError('Permissions check failed'));
      };
      return;
    }
    let plein: Element | null = null;
    const signaler = (): void => {
      document.dispatchEvent(new Event('fullscreenchange'));
    };
    Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => plein });
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => true });
    Element.prototype.requestFullscreen = function () {
      w.demandes++;
      plein = document.documentElement;
      queueMicrotask(signaler);
      return Promise.resolve();
    };
    Document.prototype.exitFullscreen = function () {
      plein = null;
      queueMicrotask(signaler);
      return Promise.resolve();
    };
    w.sortieNavigateur = () => {
      plein = null;
      signaler();
    };
  }, fullscreen);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  return erreurs;
}

async function ajouterNoms(page: Page, texte: string): Promise<void> {
  await page.getByLabel('Coller une liste de noms').fill(texte);
  await page.getByRole('button', { name: 'Ajouter la liste' }).click();
}

async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test('entrée par le bouton, contrôles masqués, Espace lance, Échap ferme l’annonce puis sort', async ({ page }) => {
  const erreurs = await preparer(page, 'simule');
  await ajouterNoms(page, 'Ana\nBob\nCléo');
  await expect(boutonProjection(page)).toHaveAttribute('aria-pressed', 'false');

  await boutonProjection(page).click();
  await expect(pageApp(page)).toHaveAttribute('data-projection', 'plein-ecran');
  await expect(boutonProjection(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(boutonProjection(page)).toBeFocused();
  expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  // Contrôles d'édition masqués : liste, réglages, historique ; la roue occupe l'écran.
  await expect(page.getByLabel('Coller une liste de noms')).toBeHidden();
  await expect(page.getByRole('group', { name: 'Réglages de la roue' })).toBeHidden();
  await expect(page.locator('.page__panneau')).toBeHidden();
  await expect(boutonLancer(page)).toBeInViewport();
  const cadre = await pageApp(page).boundingBox();
  const vue = page.viewportSize();
  expect(cadre).toEqual({ x: 0, y: 0, width: vue?.width, height: vue?.height });

  await boutonLancer(page).focus();
  await page.keyboard.press('Space');
  await expect(dialogue(page)).toBeVisible();
  await expect(page.locator('.annonce-live')).toContainText(/Ana|Bob|Cléo/);
  expect(await graves(page)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(dialogue(page)).toHaveCount(0);
  await expect(pageApp(page)).toHaveAttribute('data-projection', 'plein-ecran');
  await expect(boutonLancer(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(pageApp(page)).not.toHaveAttribute('data-projection');
  await expect(pageApp(page)).not.toHaveClass(/page--projection/);
  await expect(boutonProjection(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByLabel('Coller une liste de noms')).toBeVisible();
  await expect(boutonLancer(page)).toBeFocused();
  expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  expect(erreurs).toEqual([]);
});

test('le bouton sort du mode, le focus reste dessus ; la sortie du navigateur fait sortir aussi', async ({ page }) => {
  await preparer(page, 'simule');
  await boutonProjection(page).click();
  await expect(pageApp(page)).toHaveAttribute('data-projection', 'plein-ecran');
  await page.keyboard.press('Enter');
  await expect(boutonProjection(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(boutonProjection(page)).toBeFocused();

  await boutonProjection(page).click();
  await expect(pageApp(page)).toHaveAttribute('data-projection', 'plein-ecran');
  await page.evaluate(() => {
    (window as unknown as { sortieNavigateur: () => void }).sortieNavigateur();
  });
  await expect(pageApp(page)).not.toHaveAttribute('data-projection');
  await expect(boutonProjection(page)).toHaveAttribute('aria-pressed', 'false');
});

for (const cas of ['absent', 'refuse'] as const) {
  test(`repli pleine fenêtre en CSS quand requestFullscreen est ${cas === 'absent' ? 'absent' : 'refusé'}`, async ({
    page,
  }) => {
    const erreurs = await preparer(page, cas);
    await boutonProjection(page).click();
    await expect(pageApp(page)).toHaveAttribute('data-projection', 'fenetre');
    expect(await page.evaluate(() => (window as unknown as { demandes: number }).demandes)).toBe(cas === 'refuse' ? 1 : 0);
    const vue = page.viewportSize();
    expect(await pageApp(page).boundingBox()).toEqual({ x: 0, y: 0, width: vue?.width, height: vue?.height });
    await expect(page.locator('.page__panneau')).toBeHidden();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    expect(await graves(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(pageApp(page)).not.toHaveAttribute('data-projection');
    await expect(page.locator('.page__panneau')).toBeVisible();
    expect(erreurs).toEqual([]);
  });
}

test('le mode n’est pas mémorisé : un rechargement repart en mode normal', async ({ page }) => {
  await preparer(page, 'simule');
  await boutonProjection(page).click();
  await expect(pageApp(page)).toHaveAttribute('data-projection', 'plein-ecran');
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(pageApp(page)).not.toHaveAttribute('data-projection');
  await expect(boutonProjection(page)).toHaveAttribute('aria-pressed', 'false');
});

for (const ecran of [
  { width: 1920, height: 1080, dpr: 2 },
  { width: 3840, height: 2160, dpr: 1 },
]) {
  test.describe(`écran ${String(ecran.width)} px (DPR ${String(ecran.dpr)})`, () => {
    test.use({ viewport: { width: ecran.width, height: ecran.height }, deviceScaleFactor: ecran.dpr });

    test('la roue remplit l’écran et reste nette selon devicePixelRatio', async ({ page }) => {
      await preparer(page, 'simule');
      await ajouterNoms(page, 'Ana\nBob\nCléo\nDan');
      const canvas = page.locator('.roue__canvas');
      const largeurAvant = await canvas.evaluate((c: HTMLCanvasElement) => c.width);
      await boutonProjection(page).click();
      await expect(pageApp(page)).toHaveAttribute('data-projection', 'plein-ecran');
      await expect
        .poll(async () =>
          canvas.evaluate((c: HTMLCanvasElement) => {
            const css = c.getBoundingClientRect().width;
            return c.width === Math.min(2400, Math.round(css * window.devicePixelRatio)) && c.height === c.width;
          }),
        )
        .toBe(true);
      const css = await canvas.evaluate((c: HTMLCanvasElement) => c.getBoundingClientRect().width);
      // La roue prend presque toute la hauteur (le bouton et l'indice gardent leur place).
      expect(css).toBeGreaterThan(ecran.height * 0.8);
      expect(await canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(largeurAvant);
      await expect(boutonLancer(page)).toBeInViewport();
      expect(await graves(page)).toEqual([]);
    });
  });
}

test('édition chat : « active le mode projection » passe par les règles', async ({ page }) => {
  await page.goto('http://localhost:5200/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const bascule = page.getByRole('button', { name: 'Ouvrir le chat' });
  if (await bascule.isVisible()) await bascule.click();
  const commande = page.getByLabel('Commande', { exact: true });
  await commande.fill('active le mode projection');
  await commande.press('Enter');
  await expect(pageApp(page)).toHaveClass(/page--projection/);
  // Le panneau du chat est masqué avec les autres contrôles d'édition ; le focus n'est pas perdu.
  await expect(commande).toBeHidden();
  await expect(boutonProjection(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pageApp(page)).not.toHaveClass(/page--projection/);
  await expect(commande).toBeVisible();
  await expect(commande).toBeFocused();
});
