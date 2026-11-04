// Relais POST /stt de scripts/serveur-chat.mjs (6.2, C6) : vrai serveur lancé sur des ports libres,
// faux whisper-server (frontière externe) ; aucun appel au vrai STT.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SERVEUR = fileURLToPath(new URL('./serveur-chat.mjs', import.meta.url));
const FRONTIERE = 'XXboundary';
const TYPE = `multipart/form-data; boundary=${FRONTIERE}`;

const portLibre = (): Promise<number> =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => ok(port));
    });
  });

interface Reponse {
  readonly statut: number;
  readonly corps: string;
  readonly entetes: Record<string, string | string[] | undefined>;
}

function appeler(
  port: number,
  chemin: string,
  { methode = 'POST', hote, corps = '', entetes = {} }: { methode?: string; hote?: string; corps?: string | Buffer; entetes?: Record<string, string> } = {},
): Promise<Reponse> {
  return new Promise((ok, ko) => {
    const req = request(
      {
        host: '127.0.0.1',
        port,
        path: chemin,
        method: methode,
        headers: { Host: hote ?? `localhost:${String(port)}`, 'Content-Type': TYPE, 'Content-Length': Buffer.byteLength(corps), ...entetes },
      },
      (res) => {
        const morceaux: Buffer[] = [];
        res.on('data', (m: Buffer) => morceaux.push(m));
        res.on('end', () => {
          ok({ statut: res.statusCode ?? 0, corps: Buffer.concat(morceaux).toString('utf8'), entetes: res.headers });
        });
      },
    );
    req.on('error', ko);
    req.end(corps);
  });
}

let chat: ChildProcess;
let portChat = 0;
let portStt = 0;
let faux: Server | null = null;
/** Requêtes vues par le faux whisper-server. */
const vues: { methode: string; url: string; taille: number; type: string }[] = [];

beforeAll(async () => {
  portChat = await portLibre();
  portStt = await portLibre();
  const dossier = mkdtempSync(join(tmpdir(), 'relais-stt-'));
  const page = join(dossier, 'page.html');
  writeFileSync(page, '<p>page</p>');
  chat = spawn(process.execPath, [SERVEUR], {
    env: { ...process.env, ROUE_CHAT_PORT: String(portChat), ROUE_STT_PORT: String(portStt), ROUE_CHAT_FICHIER: page },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((ok, ko) => {
    chat.stdout?.on('data', () => ok());
    chat.on('exit', (c) => ko(new Error(`serveur-chat arrêté (${String(c)})`)));
  });
}, 20000);

afterAll(async () => {
  chat.kill();
  await new Promise<void>((ok) => (faux ? faux.close(() => ok()) : ok()));
});

const demarrerFaux = (statut: number, corps: string): Promise<void> =>
  new Promise((ok) => {
    faux = createServer((req, res) => {
      const morceaux: Buffer[] = [];
      req.on('data', (m: Buffer) => morceaux.push(m));
      req.on('end', () => {
        vues.push({
          methode: req.method ?? '',
          url: req.url ?? '',
          taille: Buffer.concat(morceaux).length,
          type: req.headers['content-type'] ?? '',
        });
        res.writeHead(statut, { 'Content-Type': 'application/json' }).end(corps);
      });
    });
    faux.listen(portStt, '127.0.0.1', () => ok());
  });

describe('POST /stt', () => {
  it('répond 502 quand le STT est absent', async () => {
    const r = await appeler(portChat, '/stt', { corps: 'x' });
    expect(r.statut).toBe(502);
    expect(r.corps).toBe('STT indisponible\n');
  });

  it('refuse un Host étranger (421), même sur /stt', async () => {
    const r = await appeler(portChat, '/stt', { hote: 'evil.example', corps: 'x' });
    expect(r.statut).toBe(421);
  });

  it('refuse une autre origine (403) et tout autre type de corps (415)', async () => {
    expect((await appeler(portChat, '/stt', { corps: 'x', entetes: { Origin: 'http://evil.example' } })).statut).toBe(403);
    expect((await appeler(portChat, '/stt', { corps: 'x', entetes: { 'Content-Type': 'text/plain' } })).statut).toBe(415);
  });

  it('n’accepte que POST (405, Allow: POST)', async () => {
    for (const methode of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
      const r = await appeler(portChat, '/stt', { methode });
      expect(r.statut, methode).toBe(405);
      expect(r.entetes['allow']).toBe('POST');
    }
  });

  it('refuse un corps de plus de 2 Mo (413) sans le relayer', async () => {
    vues.length = 0;
    const r = await appeler(portChat, '/stt', { corps: Buffer.alloc(2 * 1024 * 1024 + 1) }).catch(() => null);
    // Le serveur répond avant la fin de l'envoi : réponse 413 ou coupure de la connexion, jamais 200.
    if (r !== null) expect(r.statut).toBe(413);
    expect(vues).toEqual([]);
  });

  it('refuse un corps envoyé par morceaux (sans Content-Length) au-delà de 2 Mo (413)', async () => {
    vues.length = 0;
    const statut = await new Promise<number | null>((ok) => {
      const req = request(
        {
          host: '127.0.0.1',
          port: portChat,
          path: '/stt',
          method: 'POST',
          headers: { Host: `localhost:${String(portChat)}`, 'Content-Type': TYPE, 'Transfer-Encoding': 'chunked' },
        },
        (res) => {
          res.resume();
          ok(res.statusCode ?? 0);
        },
      );
      req.on('error', () => ok(null));
      const morceau = Buffer.alloc(256 * 1024);
      for (let i = 0; i < 9; i += 1) req.write(morceau);
      req.end();
    });
    expect(statut).toBe(413);
    expect(vues).toEqual([]);
  });

  it('relaie vers /inference seulement, avec le corps et le type d’origine, et rend la réponse', async () => {
    await demarrerFaux(200, '{"text":" Fais tourner la roue.\\n"}');
    const corps = `--${FRONTIERE}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr\r\n--${FRONTIERE}--\r\n`;
    const r = await appeler(portChat, '/stt?path=/load', { corps });
    expect(r.statut).toBe(200);
    expect(r.corps).toBe('{"text":" Fais tourner la roue.\\n"}');
    expect(vues).toEqual([{ methode: 'POST', url: '/inference', taille: Buffer.byteLength(corps), type: TYPE }]);
  });

  it('une réponse amont de plus d’1 Mo donne 502, sans la recopier', async () => {
    faux?.closeAllConnections();
    await new Promise<void>((ok) => (faux ? faux.close(() => ok()) : ok()));
    await demarrerFaux(200, 'x'.repeat(1024 * 1024 + 1));
    const r = await appeler(portChat, '/stt', { corps: 'x' });
    expect(r.statut).toBe(502);
    expect(r.corps).toBe('STT indisponible\n');
  });

  it('les autres routes de whisper-server ne sont pas joignables', async () => {
    vues.length = 0;
    for (const chemin of ['/load', '/inference', '/health', '/stt/load', '/stt/']) {
      const r = await appeler(portChat, chemin, { methode: 'GET' });
      expect(r.statut, chemin).toBe(404);
    }
    expect((await appeler(portChat, '/load', { methode: 'POST' })).statut).toBe(405);
    expect(vues).toEqual([]);
  });
});
