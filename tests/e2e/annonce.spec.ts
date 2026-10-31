import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const url = pathToFileURL(resolve('dist/roue.html')).href;

const boutonLancer = (page: Page) => page.getByRole('button', { name: 'Lancer la roue' });
const dialogue = (page: Page) => page.getByRole('dialog');
const nomAnnonce = (page: Page) => page.locator('.annonce__nom');
const live = (page: Page) => page.locator('.annonce-live');
const lignes = (page: Page) => page.locator('.ligne__nom');
const rangsHistorique = (page: Page) => page.locator('.historique__table tbody tr');
const phrase = (page: Page) => page.locator('.cadeaux__prochain');
const indice = (page: Page) => page.locator('#roue-indice');
const fermer = (page: Page) => dialogue(page).getByRole('button', { name: 'Fermer' });
const relancer = (page: Page) => dialogue(page).getByRole('button', { name: 'Relancer' });

async function ouvrir(page: Page, reduit = true): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  // Le fondu de 400 ms remplace la rotation de 4 à 6 s : même chemin de code pour l'arrêt.
  if (reduit) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  return erreurs;
}

const COULEURS_DISTINCTES = ['#ff0000', '#00cc00', '#0000ff', '#ffff00', '#ff00ff'];

/** Ajoute les noms avec des couleurs toutes différentes : le secteur sous le pointeur se lit alors sans ambiguïté. */
async function ajouterNoms(page: Page, texte: string): Promise<void> {
  const avant = await lignes(page).count();
  await page.getByLabel('Coller une liste de noms').fill(texte);
  await page.getByRole('button', { name: 'Ajouter la liste' }).click();
  const apres = await lignes(page).count();
  for (let i = avant; i < apres; i++) {
    await page.locator('.ligne__couleur').nth(i).fill(COULEURS_DISTINCTES[i % COULEURS_DISTINCTES.length] ?? '#ff0000');
  }
}

async function ajouterCadeaux(page: Page, texte: string): Promise<void> {
  await page.getByLabel('Coller une liste de cadeaux').fill(texte);
  await page.getByRole('button', { name: 'Ajouter les cadeaux' }).click();
}

/** Nom dont la couleur est celle du pixel sous le pointeur (couleurs toutes différentes, 5 noms au plus). */
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
    return meilleur && meilleur.ecart <= 12 ? meilleur.nom : null;
  });
}

async function sansDefilementHorizontal(page: Page): Promise<void> {
  const [defilable, vue] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(defilable).toBeLessThanOrEqual(vue as number);
}

/** Lance au bouton et attend l'annonce ; renvoie le nom annoncé après avoir vérifié qu'il est sous le pointeur. */
async function lancerEtAnnoncer(page: Page): Promise<string> {
  await boutonLancer(page).click();
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  const annonce = (await nomAnnonce(page).textContent()) ?? '';
  const diag = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas.roue__canvas');
    const p = c?.getContext('2d')?.getImageData(Number(c.dataset['sondeX']), Number(c.dataset['sondeY']), 1, 1).data;
    return JSON.stringify({
      p: Array.from(p ?? []),
      noms: c?.dataset['noms'],
      l: [...document.querySelectorAll('li.ligne')].map((li) => [
        li.querySelector<HTMLInputElement>('.ligne__nom')?.value,
        li.querySelector<HTMLInputElement>('.ligne__couleur')?.value,
      ]),
    });
  });
  expect(await nomSousPointeur(page), diag).toBe(annonce);
  return annonce;
}

for (const largeur of [320, 1920]) {
  test.describe(`parcours complet à ${String(largeur)} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: largeur === 320 ? 640 : 1080 });
    });

    test('sans cadeau : nom annoncé = secteur sous le pointeur = ligne d’historique', async ({ page }) => {
      const erreurs = await ouvrir(page);
      await ajouterNoms(page, 'Ana\nBob\nChloé\nDan');
      await expect(live(page)).toHaveAttribute('aria-live', 'polite');
      await expect(live(page)).toHaveText('');
      await expect(phrase(page)).toBeHidden();
      await expect(page.getByText('Cadeau n°', { exact: false }).first()).toBeHidden();

      await boutonLancer(page).click();
      // L'annonce n'existe pas tant que la roue tourne.
      await expect(dialogue(page)).toHaveCount(0);
      await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
      const gagnant = (await nomAnnonce(page).textContent()) ?? '';
      expect(['Ana', 'Bob', 'Chloé', 'Dan']).toContain(gagnant);
      expect(await nomSousPointeur(page)).toBe(gagnant);
      await expect(page.locator('.annonce__cadeau')).toHaveCount(0);
      await expect(live(page)).toHaveText(`Le gagnant est ${gagnant}.`);
      // Le fond de l'annonce est la couleur du secteur gagnant, le texte suit couleurTexte.
      const couleurs = await nomAnnonce(page).evaluate((el) => ({
        attendue: el.getAttribute('data-couleur'),
        fond: getComputedStyle(el).backgroundColor,
      }));
      const [r, g, b] = [1, 3, 5].map((i) => parseInt((couleurs.attendue ?? '#000000').slice(i, i + 2), 16));
      expect(couleurs.fond).toBe(`rgb(${String(r)}, ${String(g)}, ${String(b)})`);
      // Le focus est dans l'annonce, le reste de la page est inerte.
      expect(await dialogue(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);
      expect(await page.locator('.page').evaluate((el) => (el as HTMLElement).inert)).toBe(true);
      await sansDefilementHorizontal(page);

      await fermer(page).click();
      await expect(dialogue(page)).toHaveCount(0);
      await expect(boutonLancer(page)).toBeFocused();
      expect(await page.locator('.page').evaluate((el) => (el as HTMLElement).inert)).toBe(false);
      // Sans l'option F19, tous les noms restent dans la roue ; une ligne d'historique, le même nom.
      await expect(lignes(page)).toHaveCount(4);
      await expect(rangsHistorique(page)).toHaveCount(1);
      const cellules = rangsHistorique(page).first().locator('td');
      await expect(cellules.nth(0)).toHaveText('1');
      await expect(cellules.nth(1)).toHaveText(gagnant);
      await expect(cellules.nth(2)).toHaveText('');
      await expect(cellules.nth(3)).toHaveText(/^\d\d:\d\d:\d\d$/);
      await sansDefilementHorizontal(page);
      expect(erreurs).toEqual([]);
    });

    test('avec cadeaux : phrase avant le lancement, cadeau annoncé et historisé', async ({ page }) => {
      const erreurs = await ouvrir(page);
      await ajouterNoms(page, 'Ana\nBob\nChloé');
      await ajouterCadeaux(page, 'la bougie\nle livre\nle stylo');
      await expect(phrase(page)).toHaveText('Cadeau n° 1 sur 3 : la bougie');
      await expect(page.locator('.cadeau')).toHaveCount(3);

      const gagnant = await lancerEtAnnoncer(page);
      await expect(page.locator('.annonce__cadeau')).toHaveText('Cadeau : la bougie');
      await expect(live(page)).toHaveText(`Le gagnant est ${gagnant}. Cadeau : la bougie.`);
      await fermer(page).click();
      await expect(phrase(page)).toHaveText('Cadeau n° 2 sur 3 : le livre');
      const cellules = rangsHistorique(page).first().locator('td');
      await expect(cellules.nth(1)).toHaveText(gagnant);
      await expect(cellules.nth(2)).toHaveText('la bougie');
      await expect(page.locator('.cadeau').first()).toContainText('Attribué');
      await expect(page.locator('.cadeau').nth(1)).toContainText('Prochain');
      await sansDefilementHorizontal(page);
      // La roue et le bouton restent entiers dans la fenêtre malgré la phrase.
      await page.evaluate(() => window.scrollTo(0, 0));
      const cadre = await page.locator('.roue').boundingBox();
      const vue = page.viewportSize();
      expect(cadre).not.toBeNull();
      expect((cadre?.y ?? 0) + (cadre?.height ?? 0)).toBeLessThanOrEqual((vue?.height ?? 0) + 1);
      expect(erreurs).toEqual([]);
    });
  });
}

test('un nom de 60 caractères sans espace ne déborde ni n’est tronqué dans l’annonce, à 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await ouvrir(page);
  const long1 = 'W'.repeat(60);
  const long2 = 'M'.repeat(60);
  await ajouterNoms(page, `${long1}\n${long2}`);
  await ajouterCadeaux(page, 'C'.repeat(60));
  await boutonLancer(page).click();
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  const texte = (await nomAnnonce(page).textContent()) ?? '';
  expect([long1, long2]).toContain(texte);
  const mesure = await nomAnnonce(page).evaluate((el) => ({
    defilable: el.scrollWidth,
    visible: el.clientWidth,
    gauche: el.getBoundingClientRect().left,
    droite: el.getBoundingClientRect().right,
    ellipse: getComputedStyle(el).textOverflow,
  }));
  expect(mesure.defilable).toBeLessThanOrEqual(mesure.visible);
  expect(mesure.gauche).toBeGreaterThanOrEqual(0);
  expect(mesure.droite).toBeLessThanOrEqual(320);
  expect(mesure.ellipse).toBe('clip');
  await sansDefilementHorizontal(page);
  const cadeau = await page.locator('.annonce__cadeau').evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(cadeau).toBe(true);
});

test('cadeaux épuisés : lancement désactivé au bouton, au toucher et au clavier, récapitulatif, recommencer', async ({
  page,
}) => {
  await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob');
  await ajouterCadeaux(page, 'la bougie');
  const gagnant = await lancerEtAnnoncer(page);
  // Dernier cadeau attribué : « Relancer » est expliqué et inactif.
  await expect(relancer(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(dialogue(page)).toContainText('Tous les cadeaux sont attribués.');
  await relancer(page).click({ force: true });
  await expect(dialogue(page)).toBeVisible();
  await fermer(page).click();

  const recap = page.locator('.cadeaux__recap');
  await expect(recap).toBeVisible();
  await expect(recap).toContainText('Tous les cadeaux sont attribués');
  await expect(recap.locator('li')).toHaveText([`la bougie : ${gagnant}`]);
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(indice(page)).toBeVisible();
  await expect(indice(page)).toContainText('Tous les cadeaux sont attribués');
  await expect(boutonLancer(page)).toHaveAttribute('aria-describedby', 'roue-indice');
  await expect(phrase(page)).toBeHidden();

  // Bouton, toucher sur la roue et clavier : aucun lancement, aucune annonce.
  await boutonLancer(page).click({ force: true });
  await boutonLancer(page).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.locator('canvas.roue__canvas').click();
  await page.waitForTimeout(700);
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('.cadeaux')).toHaveAttribute('data-verrou', 'false');
  await expect(rangsHistorique(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Recommencer les attributions' }).click();
  await expect(recap).toBeHidden();
  await expect(phrase(page)).toHaveText('Cadeau n° 1 sur 1 : la bougie');
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'false');
  await expect(boutonLancer(page)).toBeFocused();
  await lancerEtAnnoncer(page);
  await expect(rangsHistorique(page)).toHaveCount(2);
});

test('annuler le dernier tirage sans F19 : ligne retirée, cadeau rendu', async ({ page }) => {
  await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob\nChloé');
  await ajouterCadeaux(page, 'la bougie\nle livre');
  const annuler = page.getByRole('button', { name: 'Annuler le dernier tirage' });
  await expect(annuler).toHaveAttribute('aria-disabled', 'true');
  await lancerEtAnnoncer(page);
  await fermer(page).click();
  await expect(phrase(page)).toHaveText('Cadeau n° 2 sur 2 : le livre');
  await annuler.click();
  await expect(rangsHistorique(page)).toHaveCount(0);
  await expect(phrase(page)).toHaveText('Cadeau n° 1 sur 2 : la bougie');
  await expect(lignes(page)).toHaveCount(3);
  await expect(page.locator('.historique .carte__statut')).toContainText('Dernier tirage annulé');
  await expect(page.locator('.historique .carte__statut')).toContainText('cadeau de nouveau disponible');
  await annuler.click({ force: true });
  await expect(page.locator('.historique .carte__statut')).toHaveText('Il n’y a aucun tirage à annuler.');
});

test('F19 : le gagnant sort à la fermeture, l’annulation le remet à sa place', async ({ page }) => {
  await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob\nChloé');
  const caseRetirer = page.getByLabel('Retirer les gagnants de la roue');
  await expect(caseRetirer).not.toBeChecked();
  await caseRetirer.check();
  const gagnant = await lancerEtAnnoncer(page);
  await expect(dialogue(page)).toContainText('Ce nom sortira de la roue à la fermeture.');
  // Tant que l'annonce est ouverte, le gagnant est encore dans la liste.
  await expect(lignes(page)).toHaveCount(3);
  await fermer(page).click();
  await expect(lignes(page)).toHaveCount(2);
  const restants = await lignes(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(restants).not.toContain(gagnant);
  await expect(page.locator('canvas.roue__canvas')).toHaveAttribute('data-noms', '2');
  await expect(rangsHistorique(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Annuler le dernier tirage' }).click();
  await expect(lignes(page)).toHaveCount(3);
  const ordre = await lignes(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(ordre).toEqual(['Ana', 'Bob', 'Chloé']);
  await expect(page.locator('canvas.roue__canvas')).toHaveAttribute('data-noms', '3');
  await expect(page.locator('.historique .carte__statut')).toContainText(`${gagnant} est de nouveau dans la roue`);
});

test('Relancer avec F19 : le gagnant sort avant la nouvelle rotation', async ({ page }) => {
  await ouvrir(page, false);
  await ajouterNoms(page, 'Ana\nBob\nChloé\nDan');
  await page.getByLabel('Retirer les gagnants de la roue').check();
  // Mouvement réduit pour les deux premiers lancements, rotation réelle pour le troisième.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const premier = await lancerEtAnnoncer(page);
  await expect(lignes(page)).toHaveCount(4);
  await relancer(page).click();
  // Aussitôt après le clic : plus d'annonce, le premier gagnant est déjà sorti de la liste.
  await expect(dialogue(page)).toHaveCount(0);
  await expect(lignes(page)).toHaveCount(3);
  const pendant = await lignes(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(pendant).not.toContain(premier);
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  const second = (await nomAnnonce(page).textContent()) ?? '';
  expect(second).not.toBe(premier);
  expect(pendant).toContain(second);
  expect(await nomSousPointeur(page)).toBe(second);
  await expect(dialogue(page)).toContainText('Ce nom sortira de la roue à la fermeture.');
  await fermer(page).click();
  await expect(lignes(page)).toHaveCount(2);
  const noms = await rangsHistorique(page).locator('td:nth-child(2)').allTextContents();
  expect(noms).toEqual([premier, second]);
});

test('F19 : moins de 2 noms après le retrait, message clair et relance impossible', async ({ page }) => {
  await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob');
  await page.getByLabel('Retirer les gagnants de la roue').check();
  await lancerEtAnnoncer(page);
  await expect(relancer(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(dialogue(page)).toContainText('Il faut au moins deux noms pour lancer la roue.');
  await relancer(page).click({ force: true });
  await expect(dialogue(page)).toBeVisible();
  await expect(lignes(page)).toHaveCount(2);
  await fermer(page).click();
  await expect(lignes(page)).toHaveCount(1);
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(indice(page)).toContainText('Il reste moins de deux noms');
  await boutonLancer(page).click({ force: true });
  await expect(dialogue(page)).toHaveCount(0);
  // Annuler remet le gagnant : le lancement redevient possible et l'explication disparaît.
  await page.getByRole('button', { name: 'Annuler le dernier tirage' }).click();
  await expect(lignes(page)).toHaveCount(2);
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'false');
  await expect(indice(page)).toBeHidden();
});

test('tous les noms retirés après « Recommencer les attributions » : message clair', async ({ page }) => {
  await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob');
  await ajouterCadeaux(page, 'a\nb');
  await page.getByLabel('Retirer les gagnants de la roue').check();
  await lancerEtAnnoncer(page);
  await fermer(page).click();
  // Un seul nom et un cadeau : attribution sans rotation.
  const sansRotation = page.locator('.cadeaux__sans-rotation');
  await expect(sansRotation).toBeVisible();
  await sansRotation.click();
  await expect(dialogue(page)).toBeVisible();
  await fermer(page).click();
  await expect(lignes(page)).toHaveCount(0);
  await expect(page.locator('.cadeaux__recap')).toBeVisible();
  await page.getByRole('button', { name: 'Recommencer les attributions' }).click();
  await expect(indice(page)).toContainText('Il reste moins de deux noms');
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');
});

test('un nom et un cadeau : attribution sans rotation', async ({ page }) => {
  await ouvrir(page);
  await ajouterNoms(page, 'Ana');
  const sansRotation = page.getByRole('button', { name: 'Attribuer à Ana sans rotation' });
  await expect(sansRotation).toBeHidden();
  await ajouterCadeaux(page, 'la bougie');
  await expect(sansRotation).toBeVisible();
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');
  await sansRotation.click();
  await expect(dialogue(page)).toBeVisible();
  await expect(nomAnnonce(page)).toHaveText('Ana');
  await expect(page.locator('.annonce__cadeau')).toHaveText('Cadeau : la bougie');
  await expect(live(page)).toHaveText('Le gagnant est Ana. Cadeau : la bougie.');
  // Aucune rotation n'a eu lieu.
  await expect(page.locator('.cadeaux')).toHaveAttribute('data-verrou', 'false');
  await expect(relancer(page)).toHaveAttribute('aria-disabled', 'true');
  await fermer(page).click();
  await expect(rangsHistorique(page)).toHaveCount(1);
  await expect(sansRotation).toBeHidden();
  await expect(page.locator('.cadeaux__recap')).toBeVisible();
});

test('clavier seul : lancement, focus retenu dans l’annonce, Échap, relance', async ({ page, browserName }) => {
  await ouvrir(page);
  const option = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+' : '';
  await ajouterNoms(page, 'Ana\nBob\nChloé');
  await boutonLancer(page).focus();
  await page.keyboard.press('Space');
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  await expect(dialogue(page)).toBeFocused();
  // Tab parcourt Relancer puis Fermer, puis revient dans la boîte au lieu de sortir vers la page.
  await page.keyboard.press(`${option}Tab`);
  await expect(relancer(page)).toBeFocused();
  await page.keyboard.press(`${option}Tab`);
  await expect(fermer(page)).toBeFocused();
  await page.keyboard.press(`${option}Tab`);
  await expect(relancer(page)).toBeFocused();
  await page.keyboard.press(`${option}Shift+Tab`);
  await expect(fermer(page)).toBeFocused();
  await page.keyboard.press(`${option}Shift+Tab`);
  await expect(relancer(page)).toBeFocused();
  await page.keyboard.press(`${option}Shift+Tab`);
  await expect(fermer(page)).toBeFocused();
  // Le focus ne peut pas atteindre la page, même forcé.
  await boutonLancer(page).evaluate((el) => {
    (el as HTMLElement).focus();
  });
  expect(await dialogue(page).evaluate((el) => el.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialogue(page)).toHaveCount(0);
  await expect(boutonLancer(page)).toBeFocused();

  // Relancer au clavier : l'annonce disparaît pendant la rotation puis revient.
  await page.keyboard.press('Space');
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press(`${option}Tab`);
  await expect(relancer(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  // Trois tirages : le premier, le second, puis la relance.
  await expect(rangsHistorique(page)).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(boutonLancer(page)).toBeFocused();
});

test('Échap n’est ni retenu ni détourné : un écouteur du document le reçoit aussi', async ({ page }) => {
  await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob');
  await page.evaluate(() => {
    (window as unknown as { echap: boolean[] }).echap = [];
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') (window as unknown as { echap: boolean[] }).echap.push(e.defaultPrevented);
    });
  });
  await boutonLancer(page).click();
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(dialogue(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { echap: boolean[] }).echap)).toEqual([false]);
});

test('noms et cadeaux hostiles : rendus en texte partout', async ({ page }) => {
  const erreurs = await ouvrir(page);
  const hostile1 = '<img src=x onerror="window.__pwn=1">';
  const hostile2 = '<b>gras</b> &amp <script>window.__pwn=2</script>';
  await ajouterNoms(page, `${hostile1}\n${hostile2}`);
  await ajouterCadeaux(page, '<svg onload="window.__pwn=3">');
  await boutonLancer(page).click();
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  expect([hostile1, hostile2]).toContain((await nomAnnonce(page).textContent()) ?? '');
  await expect(page.locator('.annonce__cadeau')).toHaveText('Cadeau : <svg onload="window.__pwn=3">');
  await expect(live(page)).toContainText('<svg onload="window.__pwn=3">');
  await fermer(page).click();
  const cellules = rangsHistorique(page).first().locator('td');
  expect([hostile1, hostile2]).toContain((await cellules.nth(1).textContent()) ?? '');
  await expect(cellules.nth(2)).toHaveText('<svg onload="window.__pwn=3">');
  await expect(page.locator('#app img, #app svg, #app b, #app script')).toHaveCount(0);
  await expect(page.locator('.cadeau__nom').first()).toHaveValue('<svg onload="window.__pwn=3">');
  expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
  expect(erreurs).toEqual([]);
});

test('cadeaux : ajout, collage, renommage, suppression et verrou pendant la rotation', async ({ page }) => {
  await ouvrir(page);
  const statut = page.locator('.cadeaux .carte__statut');
  await expect(page.locator('.cadeaux .carte__vide')).toBeVisible();
  await page.getByLabel('Ajouter un cadeau').fill('  la bougie  ');
  await page.getByRole('button', { name: 'Ajouter le cadeau' }).click();
  await expect(statut).toHaveText('1 cadeau ajouté.');
  await expect(page.getByLabel('Ajouter un cadeau')).toBeFocused();
  await ajouterCadeaux(page, 'le livre\nle stylo, la tasse');
  await expect(statut).toHaveText('3 cadeaux ajoutés.');
  const valeurs = (): Promise<string[]> =>
    page.locator('.cadeau__nom').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(await valeurs()).toEqual(['la bougie', 'le livre', 'le stylo', 'la tasse']);
  await expect(page.locator('.cadeaux .carte__compteur')).toHaveText('0 attribué sur 4');

  const deux = page.getByLabel('Cadeau n° 2', { exact: true });
  await deux.fill('le roman');
  await deux.press('Enter');
  await expect(statut).toHaveText('Cadeau modifié.');
  await deux.fill('abandon');
  await deux.press('Escape');
  await expect(deux).toHaveValue('le roman');
  await page.getByRole('button', { name: 'Supprimer le cadeau le roman' }).click();
  await expect(statut).toHaveText('Cadeau le roman retiré de la liste.');
  expect(await valeurs()).toEqual(['la bougie', 'le stylo', 'la tasse']);
  await expect(page.getByLabel('Cadeau n° 2', { exact: true })).toBeFocused();
  await expect(phrase(page)).toHaveText('Cadeau n° 1 sur 3 : la bougie');

  // Rotation réelle : édition des cadeaux et de l'historique verrouillée, aucune annonce.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await ajouterNoms(page, 'Ana\nBob');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await lancerEtAnnoncer(page);
  await fermer(page).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await boutonLancer(page).click();
  await expect(page.locator('.cadeaux')).toHaveAttribute('data-verrou', 'true');
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.getByLabel('Ajouter un cadeau')).toHaveJSProperty('readOnly', true);
  await page.getByRole('button', { name: 'Ajouter le cadeau' }).click({ force: true });
  await expect(statut).toHaveText('Rotation en cours : la liste ne peut pas être modifiée.');
  await page.getByRole('button', { name: 'Annuler le dernier tirage' }).click({ force: true });
  await expect(page.locator('.historique .carte__statut')).toHaveText(
    'Rotation en cours : la liste ne peut pas être modifiée.',
  );
  await page.getByRole('button', { name: 'Effacer l’historique' }).click({ force: true });
  await expect(page.locator('.historique__confirmation')).toBeHidden();
  await expect(rangsHistorique(page)).toHaveCount(1);
  await expect(dialogue(page)).toBeVisible({ timeout: 10_000 });
  await expect(rangsHistorique(page)).toHaveCount(2);
  await expect(page.locator('.cadeaux')).toHaveAttribute('data-verrou', 'false');
});

test('historique : copie, repli si le presse-papiers est refusé, effacement avec confirmation', async ({ page }) => {
  const dialoguesNatifs: string[] = [];
  page.on('dialog', (d) => {
    dialoguesNatifs.push(d.message());
    void d.dismiss();
  });
  await page.addInitScript(() => {
    (window as unknown as { copies: string[] }).copies = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (t: string) => {
          if ((window as unknown as { refuse?: boolean }).refuse) return Promise.reject(new Error('refusé'));
          (window as unknown as { copies: string[] }).copies.push(t);
          return Promise.resolve();
        },
      },
    });
  });
  await ouvrir(page);
  await ajouterNoms(page, 'Ana\nBob');
  await ajouterCadeaux(page, 'la bougie\nle livre');
  const statut = page.locator('.historique .carte__statut');
  const copier = page.getByRole('button', { name: 'Copier l’historique' });
  await copier.click({ force: true });
  await expect(statut).toHaveText('Aucun tirage pour le moment.');
  const g1 = await lancerEtAnnoncer(page);
  await fermer(page).click();
  const g2 = await lancerEtAnnoncer(page);
  await fermer(page).click();

  await copier.click();
  await expect(statut).toHaveText('Historique copié dans le presse-papiers.');
  const copies = await page.evaluate(() => (window as unknown as { copies: string[] }).copies);
  expect(copies).toHaveLength(1);
  const lignesCopie = (copies[0] ?? '').split('\n');
  expect(lignesCopie[0]).toBe('N°\tNom\tCadeau\tHeure');
  expect(lignesCopie[1]).toMatch(new RegExp(`^1\\t${g1}\\tla bougie\\t\\d\\d:\\d\\d:\\d\\d$`));
  expect(lignesCopie[2]).toMatch(new RegExp(`^2\\t${g2}\\tle livre\\t\\d\\d:\\d\\d:\\d\\d$`));

  // API refusée (file://) : zone de texte sélectionnée et message clair.
  await page.evaluate(() => {
    (window as unknown as { refuse: boolean }).refuse = true;
    document.execCommand = () => false;
  });
  await copier.click();
  const zone = page.getByLabel('Historique à copier');
  await expect(zone).toBeVisible();
  await expect(zone).toHaveValue(copies[0] ?? '');
  await expect(statut).toContainText('La copie automatique est refusée par le navigateur');
  expect(await zone.evaluate((el) => (el as HTMLTextAreaElement).selectionEnd - (el as HTMLTextAreaElement).selectionStart)).toBe(
    (copies[0] ?? '').length,
  );

  // Effacement : boîte dans la page, focus sur « Garder », Échap et « Garder » conservent.
  const effacer = page.getByRole('button', { name: 'Effacer l’historique' });
  await effacer.click();
  const boite = page.getByRole('alertdialog');
  await expect(boite).toBeVisible();
  await expect(boite).toContainText('Effacer 2 tirages de l’historique ?');
  await expect(page.getByRole('button', { name: 'Garder' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(boite).toBeHidden();
  await expect(effacer).toBeFocused();
  await expect(rangsHistorique(page)).toHaveCount(2);
  await effacer.click();
  await page.getByRole('button', { name: 'Garder' }).click();
  await expect(rangsHistorique(page)).toHaveCount(2);
  await effacer.click();
  await page.getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(boite).toBeHidden();
  await expect(rangsHistorique(page)).toHaveCount(0);
  await expect(statut).toHaveText('Historique effacé.');
  await expect(page.locator('.historique .carte__compteur')).toHaveText('0 tirage');
  // Les cadeaux déjà attribués le restent.
  await expect(page.locator('.cadeaux .carte__compteur')).toHaveText('2 attribués sur 2');
  expect(dialoguesNatifs).toEqual([]);
});

test('plusieurs centaines de lignes d’historique : le panneau reste utilisable', async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrir(page);
  await page.setViewportSize({ width: 375, height: 667 });
  await ajouterNoms(page, 'Ana');
  const total = 300;
  await ajouterCadeaux(page, Array.from({ length: total }, (_, i) => `cadeau ${String(i + 1)}`).join('\n'));
  const bouton = page.getByRole('button', { name: 'Attribuer à Ana sans rotation' });
  for (let i = 0; i < total; i++) {
    await bouton.click();
    await page.keyboard.press('Escape');
  }
  await expect(rangsHistorique(page)).toHaveCount(total);
  await expect(page.locator('.historique .carte__compteur')).toHaveText('300 tirages');
  await expect(page.locator('.cadeaux__recap')).toBeVisible();
  // La région défile (hauteur bornée), à la dernière ligne ; la page reste courte et sans débordement.
  const mesure = await page.locator('.historique__defilant').evaluate((el) => ({
    visible: el.clientHeight,
    contenu: el.scrollHeight,
    haut: el.scrollTop,
  }));
  expect(mesure.visible).toBeLessThanOrEqual(300);
  expect(mesure.contenu).toBeGreaterThan(mesure.visible * 5);
  expect(mesure.haut).toBeGreaterThan(0);
  await sansDefilementHorizontal(page);
  await expect(page.locator('.historique__defilant')).toHaveAttribute('tabindex', '0');
  await expect(rangsHistorique(page).last().locator('td').nth(2)).toHaveText('cadeau 300');
  // Les autres commandes du panneau répondent toujours.
  await page.getByLabel('Ajouter un nom').fill('Zoé');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(lignes(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Annuler le dernier tirage' }).click();
  await expect(rangsHistorique(page)).toHaveCount(total - 1);
});

for (const scheme of ['dark', 'light'] as const) {
  test(`axe-core sans violation sérieuse, annonce ouverte (thème ${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await ouvrir(page);
    await ajouterNoms(page, 'Ana\nBob\nChloé');
    await ajouterCadeaux(page, 'la bougie\nle livre');
    await lancerEtAnnoncer(page);
    const ouverte = await new AxeBuilder({ page }).analyze();
    const graves = ouverte.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(graves.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    await fermer(page).click();
    const analyser = async (): Promise<string[]> => {
      const r = await new AxeBuilder({ page }).analyze();
      return r.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
    };
    // Page avec cadeaux, historique et boîte de confirmation d'effacement.
    await page.getByRole('button', { name: 'Effacer l’historique' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(await analyser()).toEqual([]);
    await page.getByRole('button', { name: 'Garder' }).click();
    // Deuxième tirage : cadeaux épuisés, récapitulatif et explication sous la roue à l'écran.
    await lancerEtAnnoncer(page);
    await fermer(page).click();
    await expect(page.locator('.cadeaux__recap')).toBeVisible();
    expect(await analyser()).toEqual([]);
  });
}

test('aucun débordement horizontal de 320 à 3840 px, annonce ouverte ou non, cibles de 44 px', async ({ page }) => {
  await ouvrir(page);
  await ajouterNoms(page, `${'W'.repeat(60)}\nBob\nChloé`);
  await ajouterCadeaux(page, `${'C'.repeat(60)}\nle livre`);
  for (const [largeur, hauteur] of [
    [320, 568],
    [375, 667],
    [768, 1024],
    [1920, 1080],
    [3840, 2160],
    [568, 320],
  ] as const) {
    await page.setViewportSize({ width: largeur, height: hauteur });
    await page.evaluate(() => window.scrollTo(0, 0));
    await sansDefilementHorizontal(page);
    await lancerEtAnnoncer(page);
    await sansDefilementHorizontal(page);
    const boites = await dialogue(page)
      .locator('button')
      .evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { nom: e.textContent ?? '', l: r.width, h: r.height, bas: r.bottom, haut: r.top };
        }),
      );
    expect(boites).toHaveLength(2);
    for (const b of boites) {
      expect(b.l, `${b.nom} à ${String(largeur)} px`).toBeGreaterThanOrEqual(44);
      expect(b.h, `${b.nom} à ${String(largeur)} px`).toBeGreaterThanOrEqual(44);
    }
    await fermer(page).click();
    await sansDefilementHorizontal(page);
    // Le prochain tirage reprend la liste : on annule pour rester sur le même cadeau.
    await page.getByRole('button', { name: 'Annuler le dernier tirage' }).click();
  }
});
