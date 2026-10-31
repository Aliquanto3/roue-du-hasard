import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const url = pathToFileURL(resolve('dist/roue.html')).href;

test('le fichier construit s’exécute en file:// sans requête réseau', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(url);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lancer la roue' })).toBeVisible();
  await expect(page).toHaveTitle('Roue du hasard');
  expect(await page.locator('html').getAttribute('lang')).toBe('fr');

  expect(errors).toEqual([]);
  // Hors du document lui-même : ni réseau, ni fichier voisin (tout est en ligne).
  expect(requests.filter((u) => u !== url)).toEqual([]);
});

test('la CSP du fichier construit bloque une connexion sortante', async ({ page }) => {
  await page.goto(url);
  // `.invalid` ne se résout jamais : le rejet du fetch ne prouve rien, seul l'événement CSP compte.
  const directive = await page.evaluate(
    () =>
      new Promise<string | null>((done) => {
        document.addEventListener('securitypolicyviolation', (e) => done(e.effectiveDirective));
        setTimeout(() => done(null), 3000);
        fetch('https://csp-test.invalid/').catch(() => undefined);
      }),
  );
  expect(directive).toBe('connect-src');
});
