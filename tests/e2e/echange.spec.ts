import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { importer } from '../../src/domain/schema';

const harnais = resolve('dist-harnais/echange/index.html');
const url = pathToFileURL(harnais).href;

test('la CSP du harnais est celle du fichier construit', () => {
  const csp = /Content-Security-Policy"\s+content="([^"]+)"/.exec(readFileSync(harnais, 'utf8'));
  expect(csp?.[1]?.replaceAll('&#39;', "'")).toContain("default-src 'none'");
});

test('le téléchargement par lien blob: fonctionne sous la CSP, en file://', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') violations.push(m.text());
  });
  await page.goto(url);
  const telechargement = page.waitForEvent('download');
  await page.click('#exporter');
  const dl = await telechargement;
  expect(dl.suggestedFilename()).toMatch(/^roue-du-hasard-\d{4}-\d{2}-\d{2}\.json$/);
  const chemin = await dl.path();
  const r = importer(readFileSync(chemin, 'utf8'));
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.etat.participants.map((p) => p.nom)).toEqual(['Ana', 'Bob', 'Chloé', '<img src=x onerror=alert(1)>']);
    expect(r.etat.cadeaux).toEqual(['Bougie', 'Livre']);
  }
  expect(violations).toEqual([]);
});

test('la lecture d’un File fonctionne sous la CSP, en file://', async ({ page }) => {
  await page.goto(url);
  // Export d'abord, puis réimport du même fichier.
  const telechargement = page.waitForEvent('download');
  await page.click('#exporter');
  const chemin = await (await telechargement).path();
  await page.setInputFiles('#fichier', chemin);
  await expect(page.locator('#resultat')).toHaveAttribute('data-pret', 'true');
  const lu = JSON.parse((await page.locator('#resultat').textContent()) ?? '') as {
    ok: boolean;
    etat: { participants: { nom: string }[] };
  };
  expect(lu.ok).toBe(true);
  expect(lu.etat.participants[3]?.nom).toBe('<img src=x onerror=alert(1)>');

  // Un fichier invalide est refusé avec un code.
  await page.setInputFiles('#fichier', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{pas du json') });
  await expect(page.locator('#resultat')).toHaveText('{"ok":false,"code":"json-invalide"}');
});
