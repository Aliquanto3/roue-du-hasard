import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Story 5.7 : fenêtre d'inspection de l'édition chat (localhost, étage règles seul : les étages 2 et 3
// ne sont pas joignables en CI, ils sont couverts par les tests unitaires avec des traces simulées).
const ORIGINE = 'http://localhost:5200/';

async function ouvrir(page: Page): Promise<void> {
  await page.goto(ORIGINE);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const bascule = page.getByRole('button', { name: 'Ouvrir le chat' });
  if (await bascule.isVisible()) await bascule.click();
  await expect(page.getByLabel('Commande', { exact: true })).toBeVisible();
}

async function dire(page: Page, texte: string): Promise<void> {
  await page.getByLabel('Commande', { exact: true }).fill(texte);
  await page.getByLabel('Commande', { exact: true }).press('Enter');
}

const fenetre = (page: Page) => page.getByRole('dialog', { name: 'Inspection du chat' });

test('masquée par défaut ; ouverte par le bouton, fermée par Échap sans effet sur le chat', async ({ page }) => {
  await ouvrir(page);
  await expect(fenetre(page)).toBeHidden();
  await dire(page, 'ajoute Zoé');
  await expect(page.getByRole('log', { name: 'Échanges avec le chat' })).toContainText('C’est fait.');
  const bouton = page.getByRole('button', { name: 'Inspecter' });
  await bouton.click();
  await expect(fenetre(page)).toBeVisible();
  await expect(fenetre(page).getByRole('button', { name: 'Fermer' })).toBeFocused();
  // Détail replié : il se construit à l'ouverture.
  await expect(fenetre(page).locator('.inspection__message')).toHaveCount(1);
  await fenetre(page).locator('.inspection__message summary').first().click();
  await expect(fenetre(page)).toContainText('Étage décideur : regles (règle : ajouter)');
  await page.keyboard.press('Escape');
  await expect(fenetre(page)).toBeHidden();
  // Le focus revient au bouton, le chat est intact.
  await expect(bouton).toBeFocused();
  await expect(page.getByRole('log', { name: 'Échanges avec le chat' })).toContainText('ajoute Zoé');
  await expect(page.locator('.ligne__nom')).toHaveCount(1);
});

test('le raccourci Alt+Maj+I ouvre et ferme ; Espace et Entrée restent à la roue', async ({ page }) => {
  await ouvrir(page);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Alt+Shift+KeyI');
  await expect(fenetre(page)).toBeVisible();
  // Touche maintenue (répétition automatique) : un seul basculement.
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyI');
  await page.keyboard.down('KeyI');
  await page.keyboard.up('KeyI');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await expect(fenetre(page)).toBeHidden();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(fenetre(page)).toBeHidden();
});

test('verdict, tableau de bord, erreur d’écoute, export, effacement', async ({ page }) => {
  await ouvrir(page);
  await dire(page, 'ajoute Zoé');
  await dire(page, 'ajoute Léo');
  await dire(page, 'blabla incompris');
  await page.getByRole('button', { name: 'Inspecter' }).click();

  const f = fenetre(page);
  await expect(f.getByText('Aucun verdict posé.')).toBeVisible();
  // Du plus récent au plus ancien : le premier message est « blabla incompris ».
  const messages = f.locator('.inspection__message');
  await expect(messages).toHaveCount(3);
  await expect(messages.nth(0)).toContainText('blabla incompris — aucun étage — sans verdict');

  // Détail replié par défaut, construit à l'ouverture : étages essayés, plan, action, latence.
  await messages.nth(2).locator('summary').first().click();
  await expect(messages.nth(2)).toContainText('Étages essayés');
  await expect(messages.nth(2)).toContainText('regles : a décidé');
  await expect(messages.nth(2)).toContainText('Plan : 1 étape(s)');
  await expect(messages.nth(2)).toContainText('Action : ajouter — exécutée');
  await expect(messages.nth(2)).toContainText('Latence totale');
  await messages.nth(2).getByRole('button', { name: 'Juste', exact: true }).click();
  await expect(messages.nth(2).getByRole('button', { name: 'Juste', exact: true })).toBeFocused();
  await expect(messages.nth(2).getByRole('button', { name: 'Juste', exact: true })).toHaveAttribute('aria-pressed', 'true');

  const tableau = f.getByRole('table');
  const ligne = (nom: string) => tableau.getByRole('row', { name: new RegExp(nom) });
  await expect(ligne('Tous les messages')).toContainText('100 %');
  await expect(ligne('Étage : regles')).toContainText('100 %');
  await expect(ligne('Action : ajouter')).toContainText('100 %');

  // Une erreur sur « blabla incompris » : décision par défaut, puis erreur d'écoute.
  await messages.nth(0).locator('summary').first().click();
  await messages.nth(0).getByRole('button', { name: 'Erreur', exact: true }).click();
  await expect(ligne('Tous les messages')).toContainText('50 %');
  await expect(ligne('Étage : aucun étage')).toContainText('0 %');
  await expect(messages.nth(0)).toContainText('verdict : erreur de décision');
  await expect(f.locator('.inspection__revoir')).toContainText('blabla incompris — aucun étage — verdict : erreur de décision');
  await messages.nth(0).getByLabel(/Erreur d’écoute/).check();
  await expect(messages.nth(0)).toContainText('verdict : erreur d’écoute');

  // Une décision attendue invalide n'est pas enregistrée.
  await messages.nth(0).getByLabel('Décision attendue (JSON, facultatif)').fill('{"pas":"une décision"');
  await messages.nth(0).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f.getByRole('alert')).toContainText('pas une décision valide');
  await messages.nth(0).getByLabel('Décision attendue (JSON, facultatif)').fill('{"action":"ajouter","params":{"nom":"Zoé"}}');
  await messages.nth(0).getByRole('button', { name: 'Enregistrer' }).click();

  // Le verdict survit au rechargement (localStorage).
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Alt+Shift+KeyI');
  await expect(fenetre(page).locator('.inspection__message')).toHaveCount(3);
  await expect(fenetre(page).locator('.inspection__revoir')).toContainText('verdict : erreur d’écoute');

  // Export : un fichier JSON local, non vide, au format lu par le banc.
  const [telechargement] = await Promise.all([
    page.waitForEvent('download'),
    fenetre(page).getByRole('button', { name: 'Exporter en JSON' }).click(),
  ]);
  expect(telechargement.suggestedFilename()).toMatch(/^roue-inspection-\d{4}-\d{2}-\d{2}\.json$/);
  const chemin = await telechargement.path();
  const doc = JSON.parse(readFileSync(chemin, 'utf-8')) as {
    format: string;
    version: number;
    lignes: { commande: string; obtenu: unknown; verdict: { valeur: string; cause?: string } | null; attendu?: unknown }[];
  };
  expect(doc.format).toBe('roue-inspection');
  expect(doc.version).toBe(1);
  expect(doc.lignes.map((l) => l.commande)).toEqual(['ajoute Zoé', 'ajoute Léo', 'blabla incompris']);
  expect(doc.lignes[2]).toMatchObject({
    verdict: { valeur: 'erreur', cause: 'ecoute' },
    attendu: { action: 'ajouter', params: { nom: 'Zoé' } },
    obtenu: { action: 'refuser', code: 'incompris' },
  });

  // Effacement après confirmation : « Annuler » ne change rien.
  await fenetre(page).getByRole('button', { name: 'Effacer l’historique d’inspection' }).click();
  await expect(fenetre(page).getByRole('alertdialog')).toContainText('Effacer 3 message(s)');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(fenetre(page).locator('.inspection__message')).toHaveCount(3);
  await fenetre(page).getByRole('button', { name: 'Effacer l’historique d’inspection' }).click();
  await fenetre(page).getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(fenetre(page).locator('.inspection__message')).toHaveCount(0);
  await expect(fenetre(page).getByText('Aucun message pour le moment.')).toBeVisible();
  await expect(fenetre(page).getByRole('button', { name: 'Exporter en JSON' })).toBeDisabled();
  expect(await page.evaluate(() => window.localStorage.getItem('roue-du-hasard:chat:inspection'))).toBeNull();
});

test('un nom hostile est affiché en texte, jamais interprété', async ({ page }) => {
  const erreurs: string[] = [];
  page.on('dialog', (d) => {
    erreurs.push(d.message());
    void d.dismiss();
  });
  await ouvrir(page);
  const hostile = '<img src=x onerror=alert(1)>';
  await dire(page, `ajoute ${hostile}`);
  await page.getByRole('button', { name: 'Inspecter' }).click();
  const f = fenetre(page);
  await expect(f.locator('.inspection__message').first()).toContainText(hostile);
  await f.locator('.inspection__message').first().locator('summary').first().click();
  await expect(f.locator('img, script')).toHaveCount(0);
  expect(erreurs).toEqual([]);
});

test('sans stockage : la fenêtre marche, avec un avis', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('stockage bloqué');
      },
    });
  });
  await ouvrir(page);
  await dire(page, 'ajoute Zoé');
  await page.getByRole('button', { name: 'Inspecter' }).click();
  await expect(fenetre(page).locator('.inspection__message')).toHaveCount(1);
  await expect(fenetre(page).getByRole('note')).toContainText('stockage du navigateur est indisponible');
});

for (const largeur of [320, 1920]) {
  test(`mise en page à ${String(largeur)} px : la fenêtre tient dans l’écran, sans défilement horizontal`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: 800 });
    await ouvrir(page);
    await dire(page, 'ajoute Zoé');
    await page.getByRole('button', { name: 'Inspecter' }).click();
    const f = fenetre(page);
    await f.locator('.inspection__message').first().locator('summary').first().click();
    await f.getByRole('button', { name: 'Erreur', exact: true }).click();
    const boite = await f.boundingBox();
    expect(boite).not.toBeNull();
    expect(boite?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((boite?.x ?? 0) + (boite?.width ?? 0)).toBeLessThanOrEqual(largeur);
    const debordement = await f.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(debordement).toBe(false);
    await expect(f.getByRole('button', { name: 'Fermer' })).toBeVisible();
  });
}
