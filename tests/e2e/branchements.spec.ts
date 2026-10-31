import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Branchements 2.4 (relief), 3.1 (conservation, échange) et 3.2 (son, confettis) sur le fichier construit.
const url = pathToFileURL(resolve('dist/roue.html')).href;
const COULEURS = ['#ff0000', '#00cc00', '#0000ff'];

const lignes = (page: Page) => page.locator('.ligne__nom');
const dialogue = (page: Page) => page.getByRole('dialog');
const boutonRelief = (page: Page) => page.getByRole('button', { name: /^Relief :/ });
const boutonSon = (page: Page) => page.getByRole('button', { name: /^Son :/ });
const avis = (page: Page) => page.locator('.donnees__avis');
const toiles = (page: Page) => page.locator('.confettis canvas');
const requetes: string[] = [];

async function ouvrir(page: Page, reduit = true): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  page.on('request', (r) => requetes.push(r.url()));
  page.on('dialog', (d) => {
    erreurs.push(`dialogue natif : ${d.message()}`);
    void d.dismiss();
  });
  if (reduit) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  return erreurs;
}

async function ajouterNoms(page: Page, texte: string): Promise<void> {
  const avant = await lignes(page).count();
  await page.getByLabel('Coller une liste de noms').fill(texte);
  await page.getByRole('button', { name: 'Ajouter la liste' }).click();
  const apres = await lignes(page).count();
  for (let i = avant; i < apres; i++) {
    await page.locator('.ligne__couleur').nth(i).fill(COULEURS[i % COULEURS.length] ?? '#ff0000');
  }
}

async function noms(page: Page): Promise<string[]> {
  return lignes(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

/** Nom dont la couleur est celle du pixel sous le pointeur (trois couleurs très différentes ; le relief assombrit un peu). */
async function nomSousPointeur(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas.roue__canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return null;
    const p = ctx.getImageData(Number(canvas.dataset['sondeX']), Number(canvas.dataset['sondeY']), 1, 1).data;
    let meilleur: { nom: string; ecart: number } | null = null;
    for (const li of document.querySelectorAll('li.ligne')) {
      const nom = li.querySelector<HTMLInputElement>('.ligne__nom')?.value ?? '';
      const hex = li.querySelector<HTMLInputElement>('.ligne__couleur')?.value ?? '#000000';
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const ecart = rgb.reduce((s, c, i) => s + Math.abs(c - (p[i] ?? 0)), 0);
      if (!meilleur || ecart < meilleur.ecart) meilleur = { nom, ecart };
    }
    return meilleur && meilleur.ecart <= 90 ? meilleur.nom : null;
  });
}

/** Lance, attend l'annonce et vérifie que le gagnant annoncé est le secteur sous le pointeur. */
async function lancerEtVerifier(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Lancer la roue' }).click();
  await expect(dialogue(page)).toBeVisible();
  const annonce = await page.locator('.annonce__nom').textContent();
  expect(annonce).not.toBeNull();
  expect(await nomSousPointeur(page)).toBe(annonce);
}

async function fermerAnnonce(page: Page): Promise<void> {
  await dialogue(page).getByRole('button', { name: 'Fermer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
}

/** Exporte et renvoie le chemin du fichier téléchargé. */
async function exporter(page: Page): Promise<string> {
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter' }).click();
  return (await (await telechargement).path());
}

test.afterAll(() => {
  // Aucun appel réseau pendant toute la série : seul le fichier lui-même, des blob: ou des data: sont permis.
  expect(requetes.filter((u) => /^(https?|wss?|ftp):/i.test(u))).toEqual([]);
});

for (const [mode, attendu] of [
  ['2D', 'Relief : désactivé'],
  ['3D', 'Relief : activé'],
] as const) {
  test(`bascule du relief : ${mode} mémorisé après rechargement, arrêt exact dans les deux rendus`, async ({ page }) => {
    const erreurs = await ouvrir(page);
    // Relief par défaut.
    await expect(boutonRelief(page)).toHaveText('Relief : activé');
    await ajouterNoms(page, 'Ana\nBob\nChloé');
    if (mode === '2D') await boutonRelief(page).click();
    await expect(boutonRelief(page)).toHaveText(attendu);
    await page.reload();
    await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
    await expect(boutonRelief(page)).toHaveText(attendu);
    expect(await noms(page)).toEqual(['Ana', 'Bob', 'Chloé']);

    await lancerEtVerifier(page);
    await fermerAnnonce(page);
    // Bascule vers l'autre rendu : la roue reste lisible et s'arrête encore exactement.
    await boutonRelief(page).click();
    await expect(boutonRelief(page)).toHaveText(mode === '2D' ? 'Relief : activé' : 'Relief : désactivé');
    await lancerEtVerifier(page);
    expect(erreurs).toEqual([]);
  });
}

test('rechargement : liste, couleurs, cadeaux, historique et options retrouvés, aucune rotation restaurée', async ({ page }) => {
  const erreurs = await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob\nChloé');
  await page.getByLabel('Coller une liste de cadeaux').fill('Bougie\nLivre');
  await page.getByRole('button', { name: 'Ajouter les cadeaux' }).click();
  await page.getByLabel('Retirer les gagnants de la roue').check();
  await lancerEtVerifier(page);
  const gagnant = await page.locator('.annonce__nom').textContent();
  await fermerAnnonce(page);

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  // Le gagnant est sorti de la roue (option cochée) ; l'historique garde sa ligne et son cadeau.
  const restants = ['Ana', 'Bob', 'Chloé'].filter((n) => n !== gagnant);
  expect(await noms(page)).toEqual(restants);
  await expect(page.locator('.historique__table tbody tr')).toHaveCount(1);
  await expect(page.locator('.historique__table tbody tr td').nth(1)).toHaveText(gagnant ?? '');
  await expect(page.locator('.historique__table tbody tr td').nth(2)).toHaveText('Bougie');
  await expect(page.locator('.cadeaux__prochain')).toContainText('Livre');
  await expect(page.getByLabel('Retirer les gagnants de la roue')).toBeChecked();
  const couleurs = await page.locator('.ligne__couleur').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const attendues = ['Ana', 'Bob', 'Chloé'].map((n, i) => [n, COULEURS[i]] as const).filter(([n]) => n !== gagnant).map(([, c]) => c);
  expect(couleurs).toEqual(attendues);
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('canvas.roue__canvas')).toBeVisible();
  expect(erreurs).toEqual([]);
});

test('stockage bloqué : l’application fonctionne et un avis invite à exporter', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Accès refusé', 'SecurityError');
      },
    });
  });
  const erreurs = await ouvrir(page);
  await expect(avis(page)).toBeVisible();
  await expect(avis(page)).toContainText('exportez');
  await ajouterNoms(page, 'Ana\nBob');
  expect(await noms(page)).toEqual(['Ana', 'Bob']);
  await lancerEtVerifier(page);
  // L'avis reste unique malgré les changements d'état suivants.
  await expect(avis(page)).toHaveCount(1);
  expect(erreurs).toEqual([]);
});

test('export puis import : aller-retour exact avec un fichier réel, confirmation avant de remplacer', async ({ page }) => {
  const erreurs = await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob\nChloé');
  await page.getByLabel('Coller une liste de cadeaux').fill('Bougie');
  await page.getByRole('button', { name: 'Ajouter les cadeaux' }).click();
  await boutonRelief(page).click();
  await boutonSon(page).click();
  await lancerEtVerifier(page);
  await fermerAnnonce(page);
  const chemin = await exporter(page);
  const original = readFileSync(chemin, 'utf8');

  // On vide la liste, puis on réimporte : confirmation d'abord (la liste n'est pas vide).
  await page.getByRole('button', { name: 'Supprimer Ana' }).click();
  expect(await noms(page)).toHaveLength(2);
  await page.setInputFiles('input[type=file]', chemin);
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  expect(await noms(page)).toHaveLength(2);
  await confirmation.getByRole('button', { name: 'Garder' }).click();
  await expect(confirmation).toBeHidden();
  expect(await noms(page)).toHaveLength(2);
  await page.setInputFiles('input[type=file]', chemin);
  await confirmation.getByRole('button', { name: 'Remplacer' }).click();
  await expect(confirmation).toBeHidden();

  expect(await noms(page)).toEqual(['Ana', 'Bob', 'Chloé']);
  await expect(boutonRelief(page)).toHaveText('Relief : désactivé');
  await expect(boutonSon(page)).toHaveText('Son : coupé');
  expect(readFileSync(await exporter(page), 'utf8')).toBe(original);
  expect(erreurs).toEqual([]);
});

test('fichier invalide : message clair par code, état intact', async ({ page }) => {
  const erreurs = await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob');
  const statut = page.locator('.donnees .carte__statut');
  const cas: [string, string, string][] = [
    ['pas du json {', 'x.json', 'n’est pas un fichier JSON valide'],
    ['{"version":1,"participants":"oups"}', 'y.json', 'Le contenu de ce fichier est invalide'],
    ['{"version":99}', 'z.json', 'version inconnue'],
    ['[1,2]', 'w.json', 'n’est pas un export'],
  ];
  for (const [contenu, name, message] of cas) {
    await page.setInputFiles('input[type=file]', { name, mimeType: 'application/json', buffer: Buffer.from(contenu) });
    await expect(statut).toContainText(message);
    await expect(page.getByRole('alertdialog')).toBeHidden();
    expect(await noms(page)).toEqual(['Ana', 'Bob']);
  }
  expect(erreurs).toEqual([]);
});

test('un nom hostile importé reste du texte', async ({ page }) => {
  const erreurs = await ouvrir(page);
  const hostile = '<img src=x onerror=alert(1)>';
  const contenu = JSON.stringify({
    version: 1,
    participants: [
      { id: 'p1', nom: hostile, couleur: null },
      { id: 'p2', nom: 'Bob', couleur: null },
    ],
    cadeaux: [hostile],
    attribues: 0,
    historique: [],
    retirerGagnants: false,
    sonCoupe: false,
    prochainId: 3,
  });
  await page.setInputFiles('input[type=file]', { name: 'h.json', mimeType: 'application/json', buffer: Buffer.from(contenu) });
  await expect.poll(() => noms(page)).toEqual([hostile, 'Bob']);
  await expect(page.locator('img')).toHaveCount(0);
  // L'annonce, l'historique et la liste de cadeaux affichent aussi le nom en texte.
  await page.getByRole('button', { name: 'Lancer la roue' }).click();
  await expect(dialogue(page)).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(dialogue(page)).toContainText(`Cadeau : ${hostile}`);
  expect(erreurs).toEqual([]);
});

test('le son coupé est mémorisé après rechargement', async ({ page }) => {
  const erreurs = await ouvrir(page);
  await expect(boutonSon(page)).toHaveText('Son : activé');
  await boutonSon(page).click();
  await expect(boutonSon(page)).toHaveText('Son : coupé');
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await expect(boutonSon(page)).toHaveText('Son : coupé');
  await boutonSon(page).click();
  await page.reload();
  await expect(boutonSon(page)).toHaveText('Son : activé');
  expect(erreurs).toEqual([]);
});

test('confettis : un canvas à l’annonce, retiré à la fermeture, sans gêner les clics', async ({ page }) => {
  const erreurs = await ouvrir(page, false);
  await ajouterNoms(page, 'Ana');
  await page.getByLabel('Ajouter un cadeau').fill('Bougie');
  await page.getByRole('button', { name: 'Ajouter le cadeau' }).click();
  await expect(toiles(page)).toHaveCount(0);
  await page.getByRole('button', { name: /sans rotation/ }).click();
  await expect(dialogue(page)).toBeVisible();
  await expect(toiles(page)).toHaveCount(1);
  await expect(page.locator('.confettis')).toHaveCSS('pointer-events', 'none');
  // Le clic traverse les confettis : « Fermer » reste cliquable pendant qu'ils tombent.
  await fermerAnnonce(page);
  await expect(toiles(page)).toHaveCount(0);
  expect(erreurs).toEqual([]);
});

test('confettis arrêtés d’eux-mêmes au bout de 3,5 s', async ({ page }) => {
  await ouvrir(page, false);
  await ajouterNoms(page, 'Ana');
  await page.getByLabel('Ajouter un cadeau').fill('Bougie');
  await page.getByRole('button', { name: 'Ajouter le cadeau' }).click();
  await page.getByRole('button', { name: /sans rotation/ }).click();
  await expect(toiles(page)).toHaveCount(1);
  await expect(toiles(page)).toHaveCount(0, { timeout: 6000 });
  await expect(dialogue(page)).toBeVisible();
});

test('mouvement réduit : aucun confetti', async ({ page }) => {
  const erreurs = await ouvrir(page, true);
  await ajouterNoms(page, 'Ana');
  await page.getByLabel('Ajouter un cadeau').fill('Bougie');
  await page.getByRole('button', { name: 'Ajouter le cadeau' }).click();
  await page.getByRole('button', { name: /sans rotation/ }).click();
  await expect(dialogue(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(toiles(page)).toHaveCount(0);
  expect(erreurs).toEqual([]);
});
