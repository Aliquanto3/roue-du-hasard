import { readFileSync, statSync } from 'node:fs';

const MAX_BYTES = 200 * 1024;
const REQUIRED_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];
// Doit rester égal à MARQUEUR_CHAT (src/chat/marqueur.ts).
const MARQUEUR_CHAT = "roue-du-hasard:edition-chat";
const OLLAMA = ["http://localhost:11434", "http://127.0.0.1:11434"];
const LOCAL = '(?!#|data:|blob:)';

function verifier(FILE, chat, errors) {
let size;
try {
  size = statSync(FILE).size;
} catch {
  errors.push(`${FILE} introuvable : lancer npm run build.`);
  return;
}
if (size > MAX_BYTES) errors.push(`${FILE} fait ${size} octets (maximum ${MAX_BYTES}).`);
const html = readFileSync(FILE, 'utf8');

// Tout doit être en ligne : une référence relative est aussi une ressource hors du fichier.
// Valeur non citée : seulement une URL, car `a.href=URL.createObjectURL(b)` est légitime en JS.
const external = [
  ...html.matchAll(
    new RegExp(
      `\\b(?:src|href)\\s*=\\s*(?:"${LOCAL}[^"]+"|'${LOCAL}[^']+'|\`${LOCAL}[^\`]+\`|(?:https?:)?//[^\\s"'>]+)`,
      'gi',
    ),
  ),
  ...html.matchAll(new RegExp(`\\burl\\(\\s*["'\`]?${LOCAL}[^)"'\`\\s]+`, 'g')),
].map((m) => m[0]);
if (external.length) errors.push(`${FILE} : ressource externe référencée : ${external.join(', ')}`);

if (!chat) {
  const network = html.match(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/g);
  if (network) errors.push(`${FILE} : API réseau présente : ${[...new Set(network)].join(', ')}`);
}
if (chat !== html.includes(MARQUEUR_CHAT)) {
  errors.push(chat ? `${FILE} ne contient pas le code du chat.` : `${FILE} contient du code du chat.`);
}

const meta = /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(html);
if (!meta) {
  errors.push(`${FILE} : méta-balise CSP absente.`);
} else {
  if (meta.index > html.search(/<script\b/i)) errors.push(`${FILE} : la CSP doit précéder le premier script.`);
  const content = /\bcontent="([^"]*)"/i.exec(meta[0])?.[1] ?? '';
  const directives = content
    .replaceAll('&#39;', "'")
    .split(';')
    .map((d) => d.trim());
  const connect = directives.filter((d) => d.startsWith('connect-src'));
  const attendu = chat ? `connect-src ${OLLAMA.join(' ')}` : "connect-src 'none'";
  if (connect.length !== 1 || connect[0] !== attendu) errors.push(`CSP de ${FILE} : '${attendu}' attendu, trouvé '${connect.join(' ; ')}'.`);
  const missing = REQUIRED_CSP.filter((d) => !directives.includes(d));
  if (missing.length) errors.push(`${FILE} : directives CSP manquantes : ${missing.join(', ')}`);
}

  console.log(`${FILE} : ${size} octets.`);
}

const errors = [];
verifier('dist/roue.html', false, errors);
verifier('dist/roue-chat.html', true, errors);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Aucune ressource externe, CSP conforme.');
