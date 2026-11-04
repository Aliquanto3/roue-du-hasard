// Sert l'édition chat sur http://localhost:5200 : `dist/roue-chat.html` sur `/`, rien d'autre.
// Écoute sur 127.0.0.1 seulement. Sans dépendance.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const PORT = 5200;
const HOTE = '127.0.0.1';
const FICHIER = fileURLToPath(new URL('../dist/roue-chat.html', import.meta.url));

let page;
try {
  page = await readFile(FICHIER);
} catch {
  console.error('dist/roue-chat.html est introuvable : lancer npm run build avant npm run chat.');
  process.exit(1);
}

const ENTETES = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const serveur = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }).end('Méthode refusée\n');
    return;
  }
  // Chemin brut, sans normalisation : seul `/` (avec ou sans paramètres) est servi.
  const chemin = (req.url ?? '').split(/[?#]/, 1)[0];
  if (chemin !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable\n');
    return;
  }
  res.writeHead(200, { ...ENTETES, 'Content-Length': page.length });
  res.end(req.method === 'HEAD' ? undefined : page);
});

serveur.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Le port ${PORT} est déjà pris : fermer le programme qui l'utilise.`);
  else console.error(`Le serveur ne démarre pas : ${e.message}`);
  process.exit(1);
});
serveur.listen(PORT, HOTE, () => {
  console.log(`Édition chat : http://localhost:${PORT} (Ctrl+C pour arrêter)`);
});
