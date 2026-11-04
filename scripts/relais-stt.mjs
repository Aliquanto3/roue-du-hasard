// Relais `POST /stt` de l'édition chat vers whisper-server (story 6.2, C6).
// Une seule destination : http://127.0.0.1:<port>/inference. Aucune autre route de whisper-server
// (`/load` recharge un modèle par chemin, `/`, `/health`…) n'est joignable depuis la page.
// Le contrôle du Host est fait par l'appelant (serveur-chat.mjs) avant d'arriver ici.
import { request } from 'node:http';

export const LIMITE_CORPS = 2 * 1024 * 1024;
const TEXTE = { 'Content-Type': 'text/plain; charset=utf-8' };

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ port: number; origine: string; delaiMs?: number }} options `origine` : seule origine admise (en-tête Origin, s'il existe).
 */
export function relayerStt(req, res, { port, origine, delaiMs = 30000 }) {
  if (req.method !== 'POST') {
    res.writeHead(405, { ...TEXTE, Allow: 'POST' }).end('Méthode refusée\n');
    return;
  }
  const venantDe = req.headers.origin;
  if (venantDe !== undefined && venantDe !== origine) {
    res.writeHead(403, TEXTE).end('Origine refusée\n');
    return;
  }
  const type = req.headers['content-type'] ?? '';
  if (!/^multipart\/form-data;/i.test(type)) {
    res.writeHead(415, TEXTE).end('multipart/form-data attendu\n');
    return;
  }
  const annoncee = Number(req.headers['content-length'] ?? '0');
  if (annoncee > LIMITE_CORPS) {
    res.writeHead(413, { ...TEXTE, Connection: 'close' }).end('Corps trop gros\n');
    return;
  }
  /** @type {Buffer[]} */
  const morceaux = [];
  let taille = 0;
  let fini = false;
  req.on('data', (/** @type {Buffer} */ m) => {
    if (fini) return;
    taille += m.length;
    if (taille > LIMITE_CORPS) {
      fini = true;
      res.writeHead(413, { ...TEXTE, Connection: 'close' }).end('Corps trop gros\n');
      return;
    }
    morceaux.push(m);
  });
  req.on('error', () => {
    fini = true;
  });
  req.on('end', () => {
    if (fini) return;
    fini = true;
    const corps = Buffer.concat(morceaux);
    const amont = request(
      {
        host: '127.0.0.1',
        port,
        path: '/inference',
        method: 'POST',
        headers: { 'Content-Type': type, 'Content-Length': corps.length },
        timeout: delaiMs,
      },
      (reponse) => {
        /** @type {Buffer[]} */
        const sortie = [];
        reponse.on('data', (/** @type {Buffer} */ m) => sortie.push(m));
        reponse.on('end', () => {
          res
            .writeHead(reponse.statusCode ?? 502, {
              'Content-Type': reponse.headers['content-type'] ?? 'application/json',
              'Cache-Control': 'no-store',
            })
            .end(Buffer.concat(sortie));
        });
        reponse.on('error', () => {
          if (!res.headersSent) res.writeHead(502, TEXTE).end('STT indisponible\n');
        });
      },
    );
    amont.on('timeout', () => amont.destroy());
    amont.on('error', () => {
      if (!res.headersSent) res.writeHead(502, TEXTE).end('STT indisponible\n');
    });
    amont.end(corps);
  });
}
