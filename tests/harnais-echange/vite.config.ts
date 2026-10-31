import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Reprend la CSP du fichier construit (`dist/roue.html`) pour que le harnais soit soumis à la même. */
function cspDuBuild(): Plugin {
  return {
    name: 'harnais-csp',
    transformIndexHtml: () => {
      const html = readFileSync(resolve('dist/roue.html'), 'utf8');
      const m = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
      if (!m?.[1]) throw new Error('CSP introuvable dans dist/roue.html : lancer `npm run build` d’abord');
      return [
        {
          tag: 'meta',
          // Le HTML construit échappe les apostrophes (`&#39;`) : on les décode avant de réinjecter.
          attrs: { 'http-equiv': 'Content-Security-Policy', content: m[1].replaceAll('&#39;', "'") },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  root: resolve('tests/harnais-echange'),
  plugins: [viteSingleFile(), cspDuBuild()],
  build: {
    outDir: resolve('dist/harnais-echange'),
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
  },
});
