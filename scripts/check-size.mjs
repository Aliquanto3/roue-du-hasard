import { readFileSync, statSync } from 'node:fs';

const FILE = process.argv[2] ?? 'dist/roue.html';
const MAX_BYTES = 200 * 1024;
const REQUIRED_CSP = [
  "default-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];
const LOCAL = '(?!#|data:|blob:)';

let size;
try {
  size = statSync(FILE).size;
} catch {
  console.error(`${FILE} introuvable : lancer npm run build.`);
  process.exit(1);
}
const errors = [];
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
if (external.length) errors.push(`Ressource externe référencée : ${external.join(', ')}`);

const network = html.match(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/g);
if (network) errors.push(`API réseau présente dans le fichier : ${[...new Set(network)].join(', ')}`);

const meta = /<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(html);
if (!meta) {
  errors.push('Méta-balise CSP absente.');
} else {
  if (meta.index > html.search(/<script\b/i)) errors.push('La CSP doit précéder le premier script.');
  const content = /\bcontent="([^"]*)"/i.exec(meta[0])?.[1] ?? '';
  const directives = content
    .replaceAll('&#39;', "'")
    .split(';')
    .map((d) => d.trim());
  const missing = REQUIRED_CSP.filter((d) => !directives.includes(d));
  if (missing.length) errors.push(`Directives CSP manquantes : ${missing.join(', ')}`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${FILE} : ${size} octets, aucune ressource externe, CSP présente.`);
