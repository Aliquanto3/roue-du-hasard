import { expect, test, type Page } from '@playwright/test';

// Story 6.2 : bouton « Parler ». Faux micro de Chromium (bip, pas de parole) ; le STT est simulé par
// page.route sur /stt : aucun appel au vrai whisper-server, ni au GPU. La parole réelle est la recette 6.4.
const ORIGINE = 'http://localhost:5200/';

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Le faux micro (--use-fake-device-for-media-stream) n’existe que sous Chromium ; Firefox et WebKit demandent un vrai périphérique.',
);

async function ouvrir(page: Page): Promise<void> {
  await page.goto(ORIGINE);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
  const bascule = page.getByRole('button', { name: 'Ouvrir le chat' });
  if (await bascule.isVisible()) await bascule.click();
  await expect(page.getByLabel('Commande', { exact: true })).toBeVisible();
}

const commande = (page: Page) => page.getByLabel('Commande', { exact: true });
const parler = (page: Page) => page.getByRole('button', { name: 'Parler' });
const fil = (page: Page) => page.getByRole('log', { name: 'Échanges avec le chat' });

interface Vue {
  url: string;
  methode: string;
  prompt: string | null;
  /** En-tête WAV de la partie `file` : RIFF/WAVE, canaux, fréquence, bits, taille des données. */
  wav: { riff: string; canaux: number; frequence: number; bits: number; donnees: number } | null;
}

/** STT simulé : rend `texte`, et note ce que la page a envoyé. */
async function simulerStt(page: Page, texte: string, statut = 200): Promise<Vue[]> {
  const vues: Vue[] = [];
  await page.route('**/stt', async (route) => {
    const req = route.request();
    const corps = req.postDataBuffer()?.toString('latin1') ?? '';
    const prompt = /name="prompt"\r\n\r\n([^\r]*)\r\n/u.exec(corps)?.[1] ?? null;
    const brut = req.postDataBuffer() ?? Buffer.alloc(0);
    const entete = /name="file"; filename="voix\.wav"\r\nContent-Type: audio\/wav\r\n\r\n/u.exec(corps);
    const debut = entete === null ? -1 : entete.index + entete[0].length;
    const wav =
      debut < 0 || brut.length < debut + 44
        ? null
        : {
            riff: `${brut.toString('latin1', debut, debut + 4)}/${brut.toString('latin1', debut + 8, debut + 12)}`,
            canaux: brut.readUInt16LE(debut + 22),
            frequence: brut.readUInt32LE(debut + 24),
            bits: brut.readUInt16LE(debut + 34),
            donnees: brut.readUInt32LE(debut + 40),
          };
    vues.push({
      url: new URL(req.url()).pathname,
      methode: req.method(),
      prompt: prompt === null ? null : Buffer.from(prompt, 'latin1').toString('utf8'),
      wav,
    });
    if (statut === 200) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: texte }) });
    else await route.fulfill({ status: statut, contentType: 'text/plain', body: 'STT indisponible' });
  });
  return vues;
}

async function maintenir(page: Page, ms = 700): Promise<void> {
  await parler(page).hover();
  await page.mouse.down();
  await expect(parler(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status').filter({ hasText: 'J’écoute…' })).toBeVisible();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test('appui maintenu : la transcription arrive dans le champ, puis suit le chemin d’une commande tapée', async ({ page }) => {
  await ouvrir(page);
  await page.getByLabel('Coller une liste de noms').fill('Léa\nAnaël');
  await page.getByRole('button', { name: 'Ajouter la liste' }).click();
  await expect(page.locator('.ligne__nom')).toHaveCount(2);
  const vues = await simulerStt(page, ' Ajoute Zoé.\n');

  await maintenir(page);
  await expect(parler(page)).toHaveAttribute('aria-pressed', 'false');
  // Affichée dans le champ, pas encore exécutée.
  await expect(commande(page)).toHaveValue('Ajoute Zoé');
  await expect(page.locator('.ligne__nom')).toHaveCount(2);
  await expect(fil(page)).not.toContainText('Ajoute Zoé');
  expect(vues).toHaveLength(1);
  expect(vues[0]).toMatchObject({ url: '/stt', methode: 'POST' });
  expect(vues[0]?.wav).toMatchObject({ riff: 'RIFF/WAVE', canaux: 1, frequence: 16000, bits: 16 });
  expect(vues[0]?.wav?.donnees).toBeGreaterThan(0);
  // Indice : consignes puis prénoms de la liste.
  expect(vues[0]?.prompt).toMatch(/Prénoms : Léa, Anaël\.$/);

  // L'utilisateur peut corriger avant d'envoyer.
  await commande(page).fill('Ajoute Zoé Martin');
  await commande(page).press('Enter');
  // Nom nouveau dicté (6.3, C4) : jamais ajouté en silence, confirmation d'abord.
  await expect(fil(page)).toContainText('Je n’ai pas ce nom dans la liste : « Zoé Martin »');
  await expect(page.locator('.ligne__nom')).toHaveCount(2);
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(fil(page)).toContainText('C’est fait.');
  await expect(page.locator('.ligne__nom')).toHaveCount(3);
  await expect(page.locator('.ligne__nom').last()).toHaveValue('Zoé Martin');

  // Inspection : la transcription brute et la latence du STT.
  await page.getByRole('button', { name: 'Inspecter' }).click();
  const fenetre = page.getByRole('dialog', { name: 'Inspection du chat' });
  await fenetre.locator('.inspection__message summary').first().click();
  await expect(fenetre).toContainText(/Transcription brute : « Ajoute Zoé\. » \(STT : \d+ ms\)/u);
});

test('une commande à confirmer dictée passe par la confirmation, comme une commande tapée', async ({ page }) => {
  await ouvrir(page);
  await page.getByLabel('Coller une liste de noms').fill('Léa\nAnaël\nBob');
  await page.getByRole('button', { name: 'Ajouter la liste' }).click();
  await simulerStt(page, 'Supprime Léa et Anaël.');
  await maintenir(page);
  await expect(commande(page)).toHaveValue('Supprime Léa et Anaël');
  await commande(page).press('Enter');
  await expect(page.getByRole('button', { name: 'Confirmer' })).toBeVisible();
  await expect(page.locator('.ligne__nom')).toHaveCount(3);
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.locator('.ligne__nom')).toHaveCount(1);
});

test('prénom écorché (« Thibaut » pour Thibault) : commande corrigée et confirmation affichées, puis exécution (6.3)', async ({ page }) => {
  await ouvrir(page);
  await page.getByLabel('Coller une liste de noms').fill('Thibault\nLéa');
  await page.getByRole('button', { name: 'Ajouter la liste' }).click();
  await expect(page.locator('.ligne__nom')).toHaveCount(2);
  await simulerStt(page, 'Supprime Thibaut.');
  await maintenir(page);
  await expect(commande(page)).toHaveValue('Supprime Thibaut');
  await commande(page).press('Enter');
  await expect(fil(page)).toContainText('Vous vouliez dire Thibault ?');
  await expect(fil(page)).toContainText('« Supprime Thibault »');
  await expect(page.locator('.ligne__nom')).toHaveCount(2);
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(fil(page)).toContainText('C’est fait.');
  await expect(page.locator('.ligne__nom')).toHaveCount(1);
  await expect(page.locator('.ligne__nom').first()).toHaveValue('Léa');

  // Inspection : la correction (avant, après, score, méthode) et la commande corrigée.
  await page.getByRole('button', { name: 'Inspecter' }).click();
  const fenetre = page.getByRole('dialog', { name: 'Inspection du chat' });
  await fenetre.locator('.inspection__message summary').first().click();
  await expect(fenetre).toContainText(/Correction : « Thibaut » devient « Thibault » \(score 0\.\d\d, proche, à confirmer\)/u);
  await expect(fenetre).toContainText('Commande corrigée envoyée à la cascade : « Supprime Thibault »');
});

test('au clavier : Espace maintenu enregistre, le relâchement transcrit', async ({ page }) => {
  await ouvrir(page);
  await simulerStt(page, 'Ajoute Bob.');
  await parler(page).focus();
  await page.keyboard.down('Space');
  await expect(parler(page)).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(600);
  await page.keyboard.up('Space');
  await expect(commande(page)).toHaveValue('Ajoute Bob');
  await expect(parler(page)).toHaveAttribute('aria-pressed', 'false');
});

test('STT absent : refus en texte avec la commande npm run stt, le chat écrit continue', async ({ page }) => {
  await ouvrir(page);
  await simulerStt(page, '', 502);
  await maintenir(page);
  await expect(page.locator('.chat__voix')).toContainText('npm run stt');
  await expect(commande(page)).toHaveValue('');
  await commande(page).fill('ajoute Zoé');
  await commande(page).press('Enter');
  await expect(fil(page)).toContainText('C’est fait.');
});

test('transcription vide : refus propre, rien dans le champ', async ({ page }) => {
  await ouvrir(page);
  await simulerStt(page, ' [BLANK_AUDIO]');
  await maintenir(page);
  await expect(page.locator('.chat__voix')).toContainText('Je n’ai rien entendu');
  await expect(commande(page)).toHaveValue('');
});

test('micro refusé : refus propre, le chat écrit continue', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('refusé', 'NotAllowedError'));
  });
  await ouvrir(page);
  const vues = await simulerStt(page, 'ne doit pas être appelé');
  await parler(page).hover();
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.chat__voix')).toContainText('Le micro est refusé');
  expect(vues).toEqual([]);
  await commande(page).fill('ajoute Zoé');
  await commande(page).press('Enter');
  await expect(fil(page)).toContainText('C’est fait.');
});

test('sans API micro (navigator.mediaDevices absent) : pas de bouton Parler', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  });
  await ouvrir(page);
  await expect(parler(page)).toHaveCount(0);
  await commande(page).fill('ajoute Zoé');
  await commande(page).press('Enter');
  await expect(fil(page)).toContainText('C’est fait.');
});
