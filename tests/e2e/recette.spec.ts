import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Recette automatisée 4.1 : parcours de bout en bout sur le fichier construit, sans harnais, en file://.
const fichier = resolve('dist/roue.html');
const url = pathToFileURL(fichier).href;
const COULEURS = ['#ff0000', '#00cc00', '#0000ff', '#ffff00', '#ff00ff'];

const lignes = (page: Page) => page.locator('.ligne__nom');
const dialogue = (page: Page) => page.getByRole('dialog');
const boutonLancer = (page: Page) => page.getByRole('button', { name: 'Lancer la roue' });
const boutonRelief = (page: Page) => page.getByRole('button', { name: /^Relief :/ });
const boutonSon = (page: Page) => page.getByRole('button', { name: /^Son :/ });
const rangs = (page: Page) => page.locator('.historique__table tbody tr');

interface Suivi {
  erreurs: string[];
  requetes: string[];
}

async function ouvrir(page: Page, reduit: boolean): Promise<Suivi> {
  const suivi: Suivi = { erreurs: [], requetes: [] };
  page.on('pageerror', (e) => suivi.erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') suivi.erreurs.push(m.text());
  });
  page.on('request', (r) => suivi.requetes.push(r.url()));
  page.on('dialog', (d) => {
    suivi.erreurs.push(`dialogue natif : ${d.message()}`);
    void d.dismiss();
  });
  await page.addInitScript(() => {
    const w = window as unknown as { violationsCsp: string[] };
    w.violationsCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.violationsCsp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.emulateMedia({ reducedMotion: reduit ? 'reduce' : 'no-preference' });
  await page.goto(url);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  return suivi;
}

async function verifierSansReseau(page: Page, suivi: Suivi): Promise<void> {
  expect(suivi.requetes.filter((u) => !/^(file|blob|data|about):/i.test(u))).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { violationsCsp: string[] }).violationsCsp)).toEqual([]);
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

/** Lance au bouton, attend l'annonce, vérifie gagnant = secteur sous le pointeur ; renvoie le gagnant. */
async function lancer(page: Page): Promise<string> {
  await boutonLancer(page).click();
  await expect(dialogue(page)).toBeVisible({ timeout: 15_000 });
  const gagnant = (await page.locator('.annonce__nom').textContent()) ?? '';
  expect(await nomSousPointeur(page)).toBe(gagnant);
  return gagnant;
}

async function fermer(page: Page): Promise<void> {
  await dialogue(page).getByRole('button', { name: 'Fermer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
}

async function exporter(page: Page): Promise<string> {
  const telechargement = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter' }).click();
  return (await telechargement).path();
}

async function sansDefilementHorizontal(page: Page): Promise<void> {
  const [defilable, vue] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(defilable).toBeLessThanOrEqual(vue as number);
}

async function graves(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test('parcours complet du novice, à la vraie durée, sans harnais', async ({ page }) => {
  test.setTimeout(90_000);
  const suivi = await ouvrir(page, false);

  // Ouverture : roue, bouton et champ de collage sont là sans aide.
  await expect(page.locator('canvas.roue__canvas')).toBeVisible();
  await expect(boutonLancer(page)).toBeVisible();
  await ajouterNoms(page, 'Ana\nBob\nChloé\nDan');
  await page.getByLabel('Coller une liste de cadeaux').fill('la bougie\nle livre\nle stylo');
  await page.getByRole('button', { name: 'Ajouter les cadeaux' }).click();
  await expect(page.locator('.cadeaux__prochain')).toHaveText('Cadeau n° 1 sur 3 : la bougie');

  // Lancement à la vraie durée : pas d'annonce avant la fin, puis annonce.
  const debut = Date.now();
  await boutonLancer(page).click();
  await page.waitForTimeout(1500);
  await expect(dialogue(page)).toHaveCount(0);
  await expect(dialogue(page)).toBeVisible({ timeout: 15_000 });
  expect(Date.now() - debut).toBeGreaterThanOrEqual(3000);
  const g1 = (await page.locator('.annonce__nom').textContent()) ?? '';
  expect(['Ana', 'Bob', 'Chloé', 'Dan']).toContain(g1);
  expect(await nomSousPointeur(page)).toBe(g1);
  await expect(page.locator('.annonce__cadeau')).toHaveText('Cadeau : la bougie');
  await fermer(page);
  await expect(rangs(page)).toHaveCount(1);
  const cellules = rangs(page).first().locator('td');
  await expect(cellules.nth(1)).toHaveText(g1);
  await expect(cellules.nth(2)).toHaveText('la bougie');

  // Retrait d'un gagnant : le suivant sort de la roue à la fermeture ; annuler le remet.
  await page.getByLabel('Retirer les gagnants de la roue').check();
  const g2 = await lancer(page);
  await fermer(page);
  expect(await noms(page)).not.toContain(g2);
  await expect(lignes(page)).toHaveCount(3);
  await expect(rangs(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Annuler le dernier tirage' }).click();
  await expect(rangs(page)).toHaveCount(1);
  expect(await noms(page)).toEqual(['Ana', 'Bob', 'Chloé', 'Dan']);
  await page.getByLabel('Retirer les gagnants de la roue').uncheck();

  // Bascule 2D / 3D : la roue reste juste dans les deux rendus.
  await expect(boutonRelief(page)).toHaveText('Relief : activé');
  await boutonRelief(page).click();
  await expect(boutonRelief(page)).toHaveText('Relief : désactivé');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await lancer(page);
  await fermer(page);
  await boutonRelief(page).click();
  await expect(boutonRelief(page)).toHaveText('Relief : activé');
  await boutonRelief(page).click();
  await boutonSon(page).click();
  await expect(boutonSon(page)).toHaveText('Son : coupé');

  // Export, rechargement : état retrouvé.
  const avantRechargement = {
    noms: await noms(page),
    historique: await rangs(page).allTextContents(),
  };
  const chemin = await exporter(page);
  const exporte = readFileSync(chemin, 'utf8');
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  expect(await noms(page)).toEqual(avantRechargement.noms);
  expect(await rangs(page).allTextContents()).toEqual(avantRechargement.historique);
  await expect(boutonRelief(page)).toHaveText('Relief : désactivé');
  await expect(boutonSon(page)).toHaveText('Son : coupé');
  await expect(dialogue(page)).toHaveCount(0);

  // Import du fichier exporté après avoir abîmé l'état : tout revient.
  await page.getByRole('button', { name: 'Supprimer Ana' }).click();
  expect(await noms(page)).toHaveLength(3);
  await page.setInputFiles('input[type=file]', chemin);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remplacer' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  expect(await noms(page)).toEqual(avantRechargement.noms);
  expect(await rangs(page).allTextContents()).toEqual(avantRechargement.historique);
  expect(readFileSync(await exporter(page), 'utf8')).toBe(exporte);

  expect(suivi.erreurs).toEqual([]);
  await verifierSansReseau(page, suivi);
});

const LARGEURS: [number, number][] = [
  [320, 640],
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1920, 1080],
  [3840, 2160],
];

for (const [largeur, hauteur] of LARGEURS) {
  // Vraie durée sur deux tailles seulement ; fondu court (mouvement réduit) ailleurs.
  const reel = largeur === 390 || largeur === 1366;
  test(`largeur ${String(largeur)} px : saisie, lancement (${reel ? 'vraie durée' : 'fondu'}), annonce, roue entière`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: largeur, height: hauteur });
    const suivi = await ouvrir(page, !reel);
    await ajouterNoms(page, 'Ana\nBob\nChloé');
    await sansDefilementHorizontal(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const cadre = await page.locator('canvas.roue__canvas').boundingBox();
    expect(cadre).not.toBeNull();
    expect(cadre?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(cadre?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((cadre?.x ?? 0) + (cadre?.width ?? 0)).toBeLessThanOrEqual(largeur + 1);
    expect((cadre?.y ?? 0) + (cadre?.height ?? 0)).toBeLessThanOrEqual(hauteur + 1);
    await lancer(page);
    const boite = await dialogue(page).boundingBox();
    expect(boite?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(largeur + 1);
    await expect(page.locator('.annonce__nom')).toBeInViewport();
    await sansDefilementHorizontal(page);
    await fermer(page);
    await sansDefilementHorizontal(page);
    expect(suivi.erreurs).toEqual([]);
    await verifierSansReseau(page, suivi);
  });
}

for (const [largeur, hauteur] of LARGEURS) {
  test(`${String(largeur)} px : ni « Lancer » ni « Relief » ne bougent quand le message des deux noms disparaît`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await ouvrir(page, true);
    await expect(page.locator('#roue-indice')).toBeVisible();
    const positions = async (): Promise<(number | undefined)[]> => {
      const l = await boutonLancer(page).boundingBox();
      const r = await boutonRelief(page).boundingBox();
      const defile = await page.evaluate(() => window.scrollY);
      return [l?.x, (l?.y ?? 0) + defile, l?.height, r?.x, (r?.y ?? 0) + defile];
    };
    const avant = await positions();
    expect(avant[1]).toBeDefined();
    await ajouterNoms(page, 'Ana\nBob');
    await expect(page.locator('#roue-indice')).toBeHidden();
    expect(await positions()).toEqual(avant);
  });
}

test('stockage bloqué : avis visible, parcours de base sans erreur', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Accès refusé', 'SecurityError');
      },
    });
  });
  const suivi = await ouvrir(page, true);
  await expect(page.locator('.donnees__avis')).toBeVisible();
  await ajouterNoms(page, 'Ana\nBob\nChloé');
  const g = await lancer(page);
  await fermer(page);
  await expect(rangs(page)).toHaveCount(1);
  await expect(rangs(page).first().locator('td').nth(1)).toHaveText(g);
  await exporter(page);
  expect(suivi.erreurs).toEqual([]);
  await verifierSansReseau(page, suivi);
});

for (const scheme of ['dark', 'light'] as const) {
  for (const relief of [true, false]) {
    test(`axe-core : page remplie et annonce ouverte (${scheme}, ${relief ? '3D' : '2D'})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await ouvrir(page, true);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await ajouterNoms(page, 'Ana\nBob\nChloé');
      await page.getByLabel('Coller une liste de cadeaux').fill('la bougie\nle livre');
      await page.getByRole('button', { name: 'Ajouter les cadeaux' }).click();
      if (!relief) await boutonRelief(page).click();
      await expect(boutonRelief(page)).toHaveText(relief ? 'Relief : activé' : 'Relief : désactivé');
      expect(await graves(page)).toEqual([]);
      await lancer(page);
      expect(await graves(page)).toEqual([]);
    });
  }
}

test('fichier livré : moins de 200 Ko, sans Math.random ni innerHTML', () => {
  expect(statSync(fichier).size).toBeLessThan(200 * 1024);
  const source = readFileSync(fichier, 'utf8');
  expect(source).not.toContain('Math.random');
  expect(source).not.toContain('innerHTML');
});
