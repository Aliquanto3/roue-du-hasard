import { readFileSync, statSync } from 'node:fs';

const FILE = 'dist/roue.html';
const MAX_BYTES = 200 * 1024;

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
const external = html.match(/\b(?:src|href)\s*=\s*["']?https?:\/\/[^\s"'>]+/gi);
if (external) errors.push(`Ressource externe référencée : ${external.join(', ')}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`${FILE} : ${size} octets, aucune ressource externe.`);
