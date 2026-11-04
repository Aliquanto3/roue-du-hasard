// Lance le banc du corpus du chat (src/banc/cli.ts). Le TypeScript du dépôt s'importe sans
// extension : on le charge par le serveur de Vite (déjà présent), sans dépendance de plus.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serveur = await createServer({
  root: racine,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});
let code;
try {
  const { main } = await serveur.ssrLoadModule('/src/banc/cli.ts');
  code = await main(process.argv.slice(2));
} finally {
  await serveur.close();
}
process.exit(code);
