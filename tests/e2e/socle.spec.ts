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
  await expect(page.locator('#app')).toHaveText('Prêt');
  await expect(page).toHaveTitle('Roue du hasard');
  expect(await page.locator('html').getAttribute('lang')).toBe('fr');

  expect(errors).toEqual([]);
  expect(requests.filter((u) => !u.startsWith('file:'))).toEqual([]);
});
