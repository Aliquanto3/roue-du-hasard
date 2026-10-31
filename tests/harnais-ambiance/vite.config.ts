import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const racine = dirname(fileURLToPath(import.meta.url));

/** Même CSP que le fichier livré (vite.config.ts à la racine), pour vérifier que Web Audio y passe. */
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const csp: Plugin = {
  name: 'harnais-csp',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
};

// Sortie sous dist/ (déjà ignoré par git et ESLint), sans vider le dist/ du build principal.
export default defineConfig({
  root: racine,
  plugins: [viteSingleFile(), csp],
  build: {
    outDir: resolve(racine, '../../dist/harnais-ambiance'),
    emptyOutDir: false,
    target: 'es2022',
    modulePreload: false,
  },
});
