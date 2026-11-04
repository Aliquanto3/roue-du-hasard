// Sert l'édition chat sur http://localhost:5200 : `dist/roue-chat.html` sur `/`, rien d'autre.
// Écoute sur 127.0.0.1 seulement. Sans dépendance.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const PORT = 5200;
const HOTE = '127.0.0.1';
const FICHIER = fileURLToPath(new URL('../dist/roue-chat.html', import.meta.url));

try {
  await readFile(FICHIER);
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
const TEXTE = { 'Content-Type': 'text/plain; charset=utf-8' };

const serveur = createServer(async (req, res) => {
  // L'origine de la page doit être http://localhost:5200, la seule qu'Ollama autorise (OLLAMA_ORIGINS).
  // Tout autre Host est refusé, ce qui ferme aussi le DNS rebinding.
  const hote = (req.headers.host ?? '').toLowerCase();
  if (hote === `127.0.0.1:${PORT}`) {
    res.writeHead(302, { ...TEXTE, Location: `http://localhost:${PORT}${req.url ?? '/'}` }).end('Redirection\n');
    return;
  }
  if (hote !== `localhost:${PORT}`) {
    res.writeHead(421, TEXTE).end('Hôte refusé\n');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...TEXTE, Allow: 'GET, HEAD' }).end('Méthode refusée\n');
    return;
  }
  // Chemin brut, sans normalisation : seul `/` (avec ou sans paramètres) est servi.
  const chemin = (req.url ?? '').split(/[?#]/, 1)[0];
  if (chemin !== '/') {
    res.writeHead(404, TEXTE).end('Introuvable\n');
    return;
  }
  // Relu à chaque requête : pas de relance du serveur après un nouveau build.
  let page;
  try {
    page = await readFile(FICHIER);
  } catch {
    res.writeHead(503, TEXTE).end('Build absent : lancer npm run build\n');
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
