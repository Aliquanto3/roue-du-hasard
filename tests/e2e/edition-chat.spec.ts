import http from 'node:http';
import { expect, test } from '@playwright/test';

// Story 5.4 : l'édition chat est servie en local (npm run chat, port 5200), jamais en file://.
const ORIGINE = 'http://localhost:5200/';

function requeteBrute(method: string, path: string, hote = 'localhost:5200'): Promise<number> {
  return new Promise((resolve, reject) => {
    const q = http.request({ host: '127.0.0.1', port: 5200, method, path, headers: { Host: hote } }, (r) => {
      r.resume();
      r.on('end', () => resolve(r.statusCode ?? 0));
    });
    q.on('error', reject);
    q.end();
  });
}

test('l’édition chat se charge sans violation de CSP et la roue fonctionne', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { violationsCsp: string[] };
    w.violationsCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.violationsCsp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  const reponse = await page.goto(ORIGINE);
  expect(reponse?.status()).toBe(200);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-chat', /^roue-du-hasard:edition-chat:d+$/);

  await page.getByLabel('Coller une liste de noms').fill('Ada\nBob\nCy');
  await page.getByRole('button', { name: 'Ajouter la liste' }).click();
  await expect(page.locator('.ligne__nom')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Lancer la roue' })).toBeEnabled();

  expect(await page.evaluate(() => (window as unknown as { violationsCsp: string[] }).violationsCsp)).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('le serveur ne sert que le Host localhost:5200', async () => {
  expect(await requeteBrute('GET', '/', '127.0.0.1:5200')).toBe(302);
  expect(await requeteBrute('GET', '/', 'evil.example:5200')).toBe(421);
  expect(await requeteBrute('GET', '/', 'localhost:80')).toBe(421);
});

test('la redirection de 127.0.0.1 garde le chemin', async () => {
  const location = await new Promise<string>((resolve, reject) => {
    const q = http.request({ host: '127.0.0.1', port: 5200, path: '/x?a=1' }, (r) => {
      r.resume();
      resolve(String(r.headers.location));
    });
    q.on('error', reject);
    q.end();
  });
  expect(location).toBe('http://localhost:5200/x?a=1');
});

test('le serveur refuse la remontée de chemin, le reste de dist/ et les autres méthodes', async () => {
  expect(await requeteBrute('GET', '/')).toBe(200);
  expect(await requeteBrute('GET', '/../package.json')).toBe(404);
  expect(await requeteBrute('GET', '/%2e%2e/package.json')).toBe(404);
  expect(await requeteBrute('GET', '/dist/roue.html')).toBe(404);
  expect(await requeteBrute('GET', '/roue.html')).toBe(404);
  expect(await requeteBrute('POST', '/')).toBe(405);
});
