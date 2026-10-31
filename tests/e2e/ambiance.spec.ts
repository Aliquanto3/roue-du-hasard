import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Page, expect, test } from '@playwright/test';

interface Sondes {
  etat(): string;
  oscillateurs(): number;
  termines(): number;
  pic(): number;
}
const sonde = <K extends keyof Sondes>(page: Page, nom: K) =>
  page.evaluate((n) => (window as unknown as { ambiance: Sondes }).ambiance[n](), nom) as Promise<ReturnType<Sondes[K]>>;

const canvasPeint = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#zone canvas');
    const donnees = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
    return donnees?.some((v, i) => i % 4 === 3 && v > 0) ?? false;
  });

const meta = (f: string) =>
  /http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/.exec(readFileSync(f, 'utf8'))?.[1]?.replaceAll('&#39;', "'");

// Un dossier par moteur : `playwright test` lance les trois projets en parallèle.
let dossier = '';
let url = '';

test.beforeAll(({ browserName }) => {
  dossier = resolve(`dist/harnais-ambiance-${browserName}`);
  url = pathToFileURL(resolve(dossier, 'index.html')).href;
  execFileSync(
    'npx',
    ['vite', 'build', '--config', 'tests/harnais-ambiance/vite.config.ts', '--outDir', `"${dossier}"`, '--logLevel', 'error'],
    { stdio: 'inherit', shell: true },
  );
});

test('la CSP du harnais interdit tout, sans media-src', () => {
  const harnais = meta(resolve(dossier, 'index.html'));
  expect(harnais).toContain("default-src 'none'");
  expect(harnais).not.toContain('media-src');
});

test('la CSP du harnais est celle du fichier livré', () => {
  test.skip(!existsSync('dist/roue.html'), 'dist/roue.html absent : lancer npm run build');
  expect(meta(resolve(dossier, 'index.html'))).toBe(meta('dist/roue.html'));
});

test('son et confettis sous la CSP du dépôt : aucune erreur, violation ni requête, canvas retiré', async ({ page }) => {
  test.setTimeout(20_000);
  const erreurs: string[] = [];
  const requetes: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  page.on('request', (r) => requetes.push(r.url()));
  await page.addInitScript(() => {
    (window as unknown as { violations: string[] }).violations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      (window as unknown as { violations: string[] }).violations.push(e.effectiveDirective),
    );
  });
  await page.goto(url);

  await page.click('#clic');
  await page.click('#fanfare');
  await page.click('#couper');
  await expect(page.locator('#etat')).toHaveText('coupe');
  await page.click('#couper');
  await page.click('#fanfare');

  await page.click('#confettis');
  const canvas = page.locator('#zone canvas');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  await expect(canvas).toHaveCSS('pointer-events', 'none');
  await expect.poll(() => canvasPeint(page)).toBe(true);
  await page.click('#confettis');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveCount(0, { timeout: 6000 });

  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
  expect(erreurs).toEqual([]);
  expect(requetes.filter((u) => u !== url)).toEqual([]);
});

test('le son sort vraiment, se coupe, et chaque source se termine', async ({ page, browserName }) => {
  // Sans périphérique audio (CI), seul Chromium garantit le passage à `running` ;
  // sous Firefox et WebKit, le test précédent couvre l'absence d'erreur.
  test.skip(browserName !== 'chromium', 'contexte audio non garanti sans périphérique');
  test.setTimeout(20_000);
  await page.goto(url);

  await page.click('#clic');
  await expect.poll(() => sonde(page, 'etat')).toBe('running');
  const avant = await sonde(page, 'oscillateurs');

  // Un clic trop proche du précédent tombe dans la fenêtre de 50 ms : on réessaie.
  await expect(async () => {
    await page.click('#clic');
    expect(await sonde(page, 'oscillateurs')).toBeGreaterThan(avant);
  }).toPass();

  await page.click('#fanfare');
  await expect.poll(() => sonde(page, 'pic'), { intervals: [20] }).toBeGreaterThan(0.01);

  await page.click('#couper');
  await expect.poll(() => sonde(page, 'pic'), { intervals: [20] }).toBe(0);

  await page.click('#couper');
  await page.click('#fanfare');
  await expect.poll(() => sonde(page, 'pic'), { intervals: [20] }).toBeGreaterThan(0.01);

  // Toutes les sources, y compris celles arrêtées par la coupure, finissent par se terminer.
  const total = await sonde(page, 'oscillateurs');
  await expect.poll(() => sonde(page, 'termines'), { timeout: 5000 }).toBe(total);
});

test('mouvement réduit : aucun confetti, préférence relue à chaque lancement (N6)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await page.click('#confettis');
  await expect(page.locator('#etat')).toHaveText('confettis');
  await expect(page.locator('#zone canvas')).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.click('#confettis');
  await expect(page.locator('#zone canvas')).toHaveCount(1);
});
