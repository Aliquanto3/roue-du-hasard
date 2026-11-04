import { expect, test, type Page } from '@playwright/test';

// Story 5.5 : panneau de chat de l'édition chat, servie en localhost (webServer de la 5.4), règles seules.
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

const fil = (page: Page) => page.getByRole('log', { name: 'Échanges avec le chat' });

test('le panneau envoie par Entrée, rend le texte du fil et garde le focus', async ({ page }) => {
  await ouvrir(page);
  await dire(page, 'blabla <b>gras</b>');
  await expect(fil(page)).toContainText('Je n’ai pas compris cette commande.');
  // La commande est rendue telle quelle, jamais interprétée comme du HTML.
  await expect(fil(page)).toContainText('blabla <b>gras</b>');
  await expect(fil(page).locator('b')).toHaveCount(0);
  await expect(page.getByLabel('Commande', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Commande', { exact: true })).toHaveValue('');
});

test('le bouton Envoyer fonctionne, et le panneau se replie', async ({ page }) => {
  await ouvrir(page);
  await page.getByLabel('Commande', { exact: true }).fill('quoi');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(fil(page)).toContainText('quoi');
  await page.getByRole('button', { name: 'Replier le chat' }).click();
  await expect(page.getByLabel('Commande', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ouvrir le chat' })).toHaveAttribute('aria-expanded', 'false');
});

test('sans modèle, aucun avis d’indisponibilité', async ({ page }) => {
  await ouvrir(page);
  await dire(page, 'a');
  await dire(page, 'b');
  await expect(page.getByText('OLLAMA_ORIGINS')).toHaveCount(0);
});

test('les réglages sont mémorisés en localStorage et vides par défaut', async ({ page }) => {
  await ouvrir(page);
  await page.getByText('Réglages du modèle').click();
  const slm = page.getByLabel('Modèle de langage (SLM)');
  await expect(slm).toHaveValue('');
  await slm.fill('qwen3:4b');
  await slm.press('Tab');
  await page.reload();
  await page.getByText('Réglages du modèle').click();
  await expect(page.getByLabel('Modèle de langage (SLM)')).toHaveValue('qwen3:4b');
  await expect(page.getByLabel('Modèle de décision')).toHaveValue('');
});

for (const [largeur, hauteur] of [
  [320, 640],
  [1920, 1080],
] as const) {
  test(`mise en page à ${String(largeur)} px : pas de défilement horizontal, roue visible`, async ({ page }) => {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await ouvrir(page);
    await dire(page, 'une commande assez longue pour tester le retour à la ligne dans le fil du chat '.repeat(2));
    await expect(fil(page)).toContainText('Je n’ai pas compris');
    const debord = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debord).toBeLessThanOrEqual(0);
    await expect(page.locator('.page__roue')).toBeInViewport();
    // Roue et panneau ouverts ne se recouvrent jamais : le bas de la roue est au-dessus du haut du panneau.
    const roue = await page.locator('.page__roue').boundingBox();
    const panneau = await page.locator('.chat').boundingBox();
    expect(roue).not.toBeNull();
    expect(panneau).not.toBeNull();
    if (roue && panneau) {
      const separes =
        roue.y + roue.height <= panneau.y + 1 ||
        panneau.x + panneau.width <= roue.x ||
        roue.x + roue.width <= panneau.x;
      expect(separes).toBe(true);
    }
    await expect(page.getByLabel('Commande', { exact: true })).toBeInViewport();
  });
}

test.describe('parcours avec l’étage règles', () => {
  test('ajout', async ({ page }) => {
    await ouvrir(page);
    await dire(page, 'ajoute Léo');
    await expect(fil(page)).toContainText('C’est fait.');
    await expect(page.locator('.ligne__nom')).toHaveCount(1);
  });

  test('homonyme clarifié par un bouton', async ({ page }) => {
    await ouvrir(page);
    await dire(page, 'ajoute Marie');
    await dire(page, 'ajoute Marie');
    await dire(page, 'supprime Marie');
    await expect(fil(page)).toContainText('De qui parlez-vous : Marie ?');
    await page.locator('.chat__attente').getByRole('button', { name: 'Marie' }).click();
    // Deux Marie identiques : un nom ne les distingue pas, rien n'est supprimé.
    await expect(fil(page)).toContainText('Plusieurs personnes portent ce nom');
    await expect(page.locator('.ligne__nom')).toHaveCount(2);
  });

  test('suppression confirmée', async ({ page }) => {
    await ouvrir(page);
    for (const nom of ['Ana', 'Bob', 'Cy']) await dire(page, `ajoute ${nom}`);
    await dire(page, 'supprime Ana et Bob');
    await expect(page.getByText('Étapes à exécuter')).toBeVisible();
    await expect(page.locator('.ligne__nom')).toHaveCount(3);
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.locator('.ligne__nom')).toHaveCount(1);
  });

  test('lancement refusé pendant la rotation', async ({ page }) => {
    await ouvrir(page);
    await dire(page, 'ajoute Ana');
    await dire(page, 'ajoute Bob');
    await dire(page, 'lance la roue');
    // La roue tourne vraiment : on attend qu'elle ne soit plus lançable avant la 2e commande.
    await expect(page.locator('.roue__canvas')).toHaveAttribute('data-lancable', 'false');
    await dire(page, 'lance la roue');
    await expect(fil(page)).toContainText('Rotation en cours : la liste ne peut pas être modifiée.');
  });

  test('un nom hostile reste inerte', async ({ page }) => {
    await ouvrir(page);
    const hostile = '<img src=x onerror="window.pwned=1">';
    await dire(page, `ajoute ${hostile}`);
    await expect(fil(page)).toContainText(hostile);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  });
});
