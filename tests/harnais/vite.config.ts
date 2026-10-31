import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Construit la page de test dans `dist-harnais/`, sans rien ajouter à `dist/roue.html`. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [viteSingleFile()],
  server: { port: 5199 },
  build: {
    outDir: fileURLToPath(new URL('../../dist-harnais', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
});
