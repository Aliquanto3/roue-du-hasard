import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const url = pathToFileURL(resolve('dist/harnais-ambiance/index.html')).href;

test.beforeAll(() => {
  execFileSync('npx', ['vite', 'build', '--config', 'tests/harnais-ambiance/vite.config.ts', '--logLevel', 'error'], {
    stdio: 'inherit',
    shell: true,
  });
});

test('la CSP du harnais est celle du fichier livré, sans media-src', () => {
  const meta = (f: string) => /http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/.exec(readFileSync(f, 'utf8'))?.[1]?.replaceAll('&#39;', "'");
  const harnais = meta('dist/harnais-ambiance/index.html');
  expect(harnais).toContain("default-src 'none'");
  expect(harnais).not.toContain('media-src');
  // dist/roue.html absent si npm run build n'a pas été lancé : la comparaison est alors sans objet.
  if (existsSync('dist/roue.html')) {
    expect(harnais).toBe(meta('dist/roue.html'));
  }
});

test('son et confettis sous la CSP du dépôt : aucune erreur, aucune violation, canvas retiré', async ({ page }) => {
  test.setTimeout(20_000);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
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
  await page.click('#confettis');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveCount(0, { timeout: 6000 });

  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
  expect(erreurs).toEqual([]);
});
