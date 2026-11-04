// Balaie `seuilAmbigu` de l'étage décision sur un lot du banc (5.10) ; seuilDecision reste fixe.
// Usage : node scripts/banc-seuil-ambigu.mjs <modele> [url] [seuils séparés par des virgules] [seuilDecision]
// Le TypeScript du dépôt se charge par le serveur de Vite, comme `banc-chat.mjs`.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [modele, url, liste, decision] = process.argv.slice(2);
if (!modele) {
  console.error('Usage : node scripts/banc-seuil-ambigu.mjs <modele> [url] [seuils] [seuilDecision]');
  process.exit(2);
}
const seuils = (liste || '0.6,0.7,0.8,0.9,0.95,1').split(',').map(Number);
const seuilDecision = decision ? Number(decision) : 0.6;
const serveur = await createServer({
  root: racine,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const cli = await serveur.ssrLoadModule('/src/banc/cli.ts');
  const { lancerBanc } = await serveur.ssrLoadModule('/src/banc/banc.ts');
  const { fabriquesDuMoteur } = await serveur.ssrLoadModule('/src/banc/moteurs.ts');
  const corpus = cli.lireCorpusDuLot('dev');
  for (const seuilAmbigu of seuils) {
    const options = { modele, seuilDecision, seuilAmbigu, ...(url ? { urlOllama: url } : {}) };
    const r = await lancerBanc(corpus, 'dev', { moteur: 'decision', fabriques: fabriquesDuMoteur('decision'), options });
    const tort = r.lignes.filter((l) => l.obtenu?.action === 'clarifier' && l.attendu?.action !== 'clarifier').map((l) => l.id);
    console.log(
      `seuilAmbigu ${seuilAmbigu} : ${r.global.ok}/${r.global.total} ; clarifier à tort ${tort.length} [${tort.join(' ')}] ; médiane ${r.latenceMedianeMs.toFixed(0)} ms`,
    );
  }
} finally {
  await serveur.close();
}
process.exit(0);
