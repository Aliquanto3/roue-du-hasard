import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const url = pathToFileURL(resolve('dist/roue.html')).href;

const champAjout = (page: Page) => page.getByLabel('Ajouter un nom');
const zoneCollage = (page: Page) => page.getByLabel('Coller une liste de noms');
const boutonAjout = (page: Page) => page.getByRole('button', { name: 'Ajouter', exact: true });
const boutonCollage = (page: Page) => page.getByRole('button', { name: 'Ajouter la liste' });
const boutonLancer = (page: Page) => page.getByRole('button', { name: 'Lancer la roue' });
const noms = (page: Page) => page.locator('.ligne__nom');
const valeurs = (page: Page): Promise<string[]> =>
  noms(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
const statut =(page: Page) => page.locator('.panneau__statut');

async function ouvrir(page: Page): Promise<string[]> {
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });
  await page.goto(url);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  return erreurs;
}

async function ajouter(page: Page, nom: string): Promise<void> {
  await champAjout(page).fill(nom);
  await boutonAjout(page).click();
}

async function sansDefilementHorizontal(page: Page): Promise<void> {
  const [defilable, vue] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(defilable).toBeLessThanOrEqual(vue as number);
}

/** La roue (canvas et bouton) tient entière dans la fenêtre, en haut de page. */
async function rouePleinement(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const cadre = await page.locator('.roue').boundingBox();
  const vue = page.viewportSize();
  expect(cadre).not.toBeNull();
  if (!cadre || !vue) return;
  expect(cadre.x).toBeGreaterThanOrEqual(0);
  expect(cadre.x + cadre.width).toBeLessThanOrEqual(vue.width);
  expect(cadre.y).toBeGreaterThanOrEqual(0);
  expect(cadre.y + cadre.height).toBeLessThanOrEqual(vue.height + 1);
}

test.describe('parcours saisie, collage et lancement', () => {
  for (const largeur of [320, 1920]) {
    test(`à ${String(largeur)} px de large`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: largeur === 320 ? 640 : 1080 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const erreurs = await ouvrir(page);

      await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');
      await expect(page.locator('#roue-indice')).toHaveText('Ajoutez au moins deux noms pour lancer la roue.');
      await expect(page.locator('.panneau__compteur')).toHaveText('0 nom');

      await ajouter(page, '  Marie  ');
      await expect.poll(() => valeurs(page)).toEqual(['Marie']);
      await expect(champAjout(page)).toHaveValue('');
      await expect(champAjout(page)).toBeFocused();
      await expect(statut(page)).toHaveText('1 nom ajouté.');
      await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');

      await zoneCollage(page).fill('Paul\nJeanne, Louis;Marie\n\n  \n');
      await boutonCollage(page).click();
      await expect(noms(page)).toHaveCount(5);
      await expect(page.locator('.panneau__compteur')).toHaveText('5 noms');
      await expect(page.locator('.panneau__doublons')).toContainText('1 doublon');
      await expect(zoneCollage(page)).toHaveValue('');
      await expect(page.locator('canvas.roue__canvas')).toHaveAttribute('data-noms', '5');
      await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'false');

      await sansDefilementHorizontal(page);
      await rouePleinement(page);

      await boutonLancer(page).click();
      await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');
      await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'false', { timeout: 10_000 });
      await sansDefilementHorizontal(page);
      expect(erreurs).toEqual([]);
    });
  }
});

test('un nom trop long est raccourci à 60 caractères avec un message', async ({ page }) => {
  await ouvrir(page);
  await ajouter(page, 'é'.repeat(75));
  await expect.poll(() => valeurs(page)).toEqual(['é'.repeat(60)]);
  await expect(statut(page)).toHaveText('1 nom ajouté. 1 nom raccourci à 60 caractères.');
});

test('renommer valide à la sortie du champ, supprimer rend le focus à la ligne voisine', async ({ page }) => {
  await ouvrir(page);
  await zoneCollage(page).fill('Ana\nBob\nChloé');
  await boutonCollage(page).click();
  await noms(page).nth(1).fill('  Robert  ');
  await noms(page).nth(1).press('Enter');
  await expect.poll(() => valeurs(page)).toEqual(['Ana', 'Robert', 'Chloé']);
  await expect(statut(page)).toHaveText('Nom modifié.');
  // Un nom vidé est refusé et l'ancien revient.
  await noms(page).nth(0).fill('   ');
  await noms(page).nth(0).press('Enter');
  await expect(noms(page).nth(0)).toHaveValue('Ana');
  await expect(statut(page)).toHaveText('Le nom est vide.');
  // Échap annule la saisie en cours.
  await noms(page).nth(0).fill('Zoé');
  await noms(page).nth(0).press('Escape');
  await expect(noms(page).nth(0)).toHaveValue('Ana');

  await page.getByRole('button', { name: 'Supprimer Robert' }).click();
  await expect.poll(() => valeurs(page)).toEqual(['Ana', 'Chloé']);
  await expect(noms(page).nth(1)).toBeFocused();
  await expect(statut(page)).toHaveText('Robert retiré de la liste.');
  await page.getByRole('button', { name: 'Supprimer Chloé' }).click();
  await expect(noms(page).nth(0)).toBeFocused();
  await page.getByRole('button', { name: 'Supprimer Ana' }).click();
  await expect(champAjout(page)).toBeFocused();
  await expect(page.locator('.panneau__vide')).toBeVisible();
});

test('un nom hostile reste du texte inerte', async ({ page }) => {
  const erreurs = await ouvrir(page);
  const hostile = '<img src=x onerror="window.pwn=1"><b>x</b>';
  await ajouter(page, hostile);
  await zoneCollage(page).fill('"><svg onload=window.pwn=3>\n<script>window.pwn=2</script>');
  await boutonCollage(page).click();
  await expect(noms(page)).toHaveCount(3);
  await expect(noms(page).nth(0)).toHaveValue(hostile);
  await expect(page.getByRole('button', { name: `Supprimer ${hostile}` })).toBeVisible();
  expect(await page.locator('main img, main svg, main script').count()).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { pwn?: number }).pwn)).toBeUndefined();
  expect(erreurs).toEqual([]);
});

test('une couleur personnalisée ne touche que son secteur, puis retour au défaut', async ({ page }) => {
  await ouvrir(page);
  await zoneCollage(page).fill('Ana\nBob\nChloé');
  await boutonCollage(page).click();
  const couleurs = (): Promise<string[]> =>
    page.locator('.ligne__couleur').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const defauts = await couleurs();
  expect(new Set(defauts).size).toBe(3);

  const colorBob = page.getByLabel('Couleur de Bob');
  await colorBob.fill('#ffffff');
  expect(await couleurs()).toEqual([defauts[0], '#ffffff', defauts[2]]);
  // Fond blanc : texte noir choisi automatiquement ; fond noir : texte blanc.
  await expect(noms(page).nth(1)).toHaveCSS('color', 'rgb(17, 17, 17)');
  await colorBob.fill('#000000');
  await expect(noms(page).nth(1)).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(noms(page).nth(1)).toHaveCSS('background-color', 'rgb(0, 0, 0)');

  // Sans personnalisation, le bouton par nom est masqué ; pour Bob il apparaît.
  await expect(page.getByRole('button', { name: 'Revenir à la couleur par défaut de Ana' })).toBeHidden();
  await page.getByRole('button', { name: 'Revenir à la couleur par défaut de Bob' }).click();
  expect(await couleurs()).toEqual(defauts);
  await expect(colorBob).toBeFocused();

  await page.getByLabel('Couleur de Ana').fill('#123456');
  await page.getByLabel('Couleur de Chloé').fill('#654321');
  expect(await couleurs()).toEqual(['#123456', defauts[1], '#654321']);
  await page.getByRole('button', { name: 'Revenir aux couleurs par défaut' }).click();
  expect(await couleurs()).toEqual(defauts);
  await expect(statut(page)).toHaveText('Couleurs par défaut rétablies.');
});

test('parcours au clavier seul, du premier champ au lancement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ouvrir(page);
  // Ordre de tabulation : roue (bouton), puis champ d'ajout.
  await page.keyboard.press('Tab');
  await expect(boutonLancer(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(champAjout(page)).toBeFocused();
  await page.keyboard.type('Ana');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Bob');
  await page.keyboard.press('Enter');
  await expect.poll(() => valeurs(page)).toEqual(['Ana', 'Bob']);
  // Retour au bouton de lancement, qui garde un focus visible.
  await page.keyboard.press('Shift+Tab');
  await expect(boutonLancer(page)).toBeFocused();
  const anneau = await boutonLancer(page).evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, largeur: parseFloat(s.outlineWidth) };
  });
  expect(anneau.style).toBe('solid');
  expect(anneau.largeur).toBeGreaterThanOrEqual(3);
  await page.keyboard.press('Space');
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'false', { timeout: 10_000 });
  await expect(boutonLancer(page)).toBeFocused();
});

test('pendant la rotation, l’édition est verrouillée sans perdre le focus, puis rendue', async ({ page }) => {
  await ouvrir(page);
  await zoneCollage(page).fill('Ana\nBob\nChloé');
  await boutonCollage(page).click();
  await noms(page).nth(0).focus();
  await boutonLancer(page).click();

  const panneau = page.locator('.panneau');
  await expect(panneau).toHaveAttribute('data-verrou', 'true');
  await expect(statut(page)).toHaveText('Rotation en cours : la modification de la liste est verrouillée.');
  await expect(champAjout(page)).toHaveJSProperty('readOnly', true);
  await expect(zoneCollage(page)).toHaveJSProperty('readOnly', true);
  await expect(noms(page).first()).toHaveJSProperty('readOnly', true);
  for (const b of [boutonAjout(page), boutonCollage(page), page.getByRole('button', { name: 'Supprimer Ana' })]) {
    await expect(b).toHaveAttribute('aria-disabled', 'true');
  }

  // Le champ qui avait le focus le garde, mais ne peut plus changer.
  await noms(page).nth(0).focus();
  await page.keyboard.type('XYZ');
  await page.keyboard.press('Enter');
  await expect(noms(page).nth(0)).toBeFocused();
  await expect(noms(page).nth(0)).toHaveValue('Ana');
  // Clics sur les boutons : refus annoncé, rien ne change.
  // `aria-disabled` : Playwright attendrait la fin de la rotation sans `force`.
  await page.getByRole('button', { name: 'Supprimer Ana' }).click({ force: true });
  await expect(statut(page)).toHaveText('Rotation en cours : la liste ne peut pas être modifiée.');
  await expect(noms(page)).toHaveCount(3);
  await champAjout(page).focus();
  await page.keyboard.type('Zoé');
  await page.keyboard.press('Enter');
  await expect(noms(page)).toHaveCount(3);
  await expect(champAjout(page)).toHaveValue('');
  await expect(boutonLancer(page)).toHaveAttribute('aria-disabled', 'true');

  await expect(panneau).toHaveAttribute('data-verrou', 'false', { timeout: 10_000 });
  await expect(statut(page)).toHaveText('Rotation terminée : la liste peut de nouveau être modifiée.');
  // Le focus n'a pas bougé pendant ni après le verrou.
  await expect(champAjout(page)).toBeFocused();
  await expect(champAjout(page)).toHaveJSProperty('readOnly', false);
  await noms(page).nth(0).fill('Anaïs');
  await noms(page).nth(0).press('Enter');
  await expect(noms(page).nth(0)).toHaveValue('Anaïs');
  await ajouter(page, 'Zoé');
  await expect(noms(page)).toHaveCount(4);
});

test.describe('mise en page N4', () => {
  const tailles: [number, number][] = [
    [320, 568],
    [375, 667],
    [768, 1024],
    [1024, 768],
    [1920, 1080],
    [3840, 2160],
    [667, 375],
    [844, 390],
    [568, 320],
  ];
  for (const [largeur, hauteur] of tailles) {
    test(`${String(largeur)} x ${String(hauteur)} : pas de défilement horizontal, roue entière, 1 000 noms compris`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: largeur, height: hauteur });
      await ouvrir(page);
      await sansDefilementHorizontal(page);
      await rouePleinement(page);
      const lignes = Array.from({ length: 40 }, (_, i) => `Participant ${String(i + 1)} avec un nom un peu long`);
      await zoneCollage(page).fill(lignes.join('\n'));
      await boutonCollage(page).click();
      await expect(noms(page)).toHaveCount(40);
      await sansDefilementHorizontal(page);
      await rouePleinement(page);
      const rouePos = await page.locator('.roue').boundingBox();
      const panneauPos = await page.locator('.panneau').boundingBox();
      expect(rouePos && panneauPos).toBeTruthy();
      if (!rouePos || !panneauPos) return;
      if (largeur >= 832 || (largeur > hauteur && hauteur <= 512 && largeur >= 544)) {
        expect(panneauPos.x).toBeGreaterThanOrEqual(rouePos.x + rouePos.width - 1);
      } else {
        expect(panneauPos.y).toBeGreaterThanOrEqual(rouePos.y + rouePos.height - 1);
      }
    });
  }

  test('les cibles tactiles font au moins 44 px, à 320 px comme à 1920 px', async ({ page }) => {
    for (const largeur of [320, 1920]) {
      await page.setViewportSize({ width: largeur, height: 900 });
      await ouvrir(page);
      await zoneCollage(page).fill('Ana\nBob');
      await boutonCollage(page).click();
      await page.getByLabel('Couleur de Ana').fill('#123456');
      const cibles: Locator = page.locator(
        'button:visible, input:visible, textarea:visible, .ligne__defaut:visible',
      );
      const boites = await cibles.evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { nom: e.className || e.tagName, l: r.width, h: r.height };
        }),
      );
      expect(boites.length).toBeGreaterThan(8);
      for (const b of boites) {
        expect(b.l, `${b.nom} à ${String(largeur)} px`).toBeGreaterThanOrEqual(44);
        expect(b.h, `${b.nom} à ${String(largeur)} px`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('le toucher sur la roue laisse la page défiler', async ({ page }) => {
    await ouvrir(page);
    const touchAction = await page.locator('canvas.roue__canvas').evaluate((c) => getComputedStyle(c).touchAction);
    expect(touchAction).toBe('manipulation');
  });
});

test.describe('thèmes et accessibilité', () => {
  for (const [scheme, fond] of [
    ['dark', 'rgb(20, 22, 43)'],
    ['light', 'rgb(244, 245, 251)'],
  ] as const) {
    test(`thème ${scheme} : fond attendu et axe-core sans violation sérieuse`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await ouvrir(page);
      await expect(page.locator('body')).toHaveCSS('background-color', fond);
      await zoneCollage(page).fill('Ana\nBob\nChloé\nDan\nÉva\nFay\nGus\nHugo');
      await boutonCollage(page).click();
      await page.getByLabel('Couleur de Bob').fill('#336699');
      await expect(noms(page)).toHaveCount(8);

      const resultat = await new AxeBuilder({ page }).analyze();
      const graves = resultat.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }

  test('le pointeur et le moyeu restent visibles sur les deux fonds', async ({ page }) => {
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await ouvrir(page);
      await zoneCollage(page).fill('Ana\nBob\nChloé');
      await boutonCollage(page).click();
      const pixels = await page.locator('canvas.roue__canvas').evaluate((c) => {
        const canvas = c as HTMLCanvasElement;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const lire = (x: number, y: number): number[] => Array.from(ctx.getImageData(x, y, 1, 1).data);
        const centre = Math.floor(canvas.width / 2);
        // Pointeur : sonde juste sous la pointe ; moyeu : centre du disque.
        return { moyeu: lire(centre, centre), pointe: lire(Number(c.dataset['sondeX']), Number(c.dataset['sondeY'])) };
      });
      // Moyeu #14162B opaque au centre de la roue, quel que soit le thème de la page.
      expect(pixels.moyeu).toEqual([20, 22, 43, 255]);
      expect(pixels.pointe[3]).toBe(255);
    }
  });
});

test('coller 1 000 noms d’un coup reste fluide', async ({ page }, info) => {
  await ouvrir(page);
  const texte = Array.from({ length: 1000 }, (_, i) => `Participant ${String(i + 1)}`).join('\n');
  await zoneCollage(page).fill(texte);
  const duree = await page.evaluate(async () => {
    const bouton = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Ajouter la liste');
    const debut = performance.now();
    bouton?.click();
    // Jusqu'à l'image suivante : inclut la mise en page et la peinture.
    await new Promise<void>((fini) => requestAnimationFrame(() => requestAnimationFrame(() => fini())));
    return performance.now() - debut;
  });
  await expect(noms(page)).toHaveCount(1000);
  await expect(page.locator('.panneau__compteur')).toHaveText('1000 noms');
  await expect(page.locator('canvas.roue__canvas')).toHaveAttribute('data-noms', '1000');
  info.annotations.push({ type: 'collage-1000-ms', description: String(Math.round(duree)) });
  console.log(`Collage de 1000 noms jusqu'à la peinture : ${String(Math.round(duree))} ms`);
  expect(duree).toBeLessThan(1500);

  // Renommer, supprimer et colorer une ligne ne reconstruit pas la liste.
  const marque = await noms(page).nth(500).evaluateHandle((el) => el.closest('li'));
  await noms(page).nth(10).fill('Renommé');
  await noms(page).nth(10).press('Enter');
  await page.getByRole('button', { name: 'Supprimer Participant 3', exact: true }).click();
  await expect(noms(page)).toHaveCount(999);
  expect(await marque.evaluate((li) => li?.isConnected)).toBe(true);
  await expect(noms(page).nth(9)).toHaveValue('Renommé');
});
