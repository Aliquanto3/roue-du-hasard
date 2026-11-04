import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { CSP_CHAT, cspPlugin } from './vite.csp';

// Second build : `dist/roue-chat.html`. `emptyOutDir: false` garde le `dist/roue.html` du premier build.
export default defineConfig({
  plugins: [viteSingleFile(), cspPlugin(CSP_CHAT)],
  build: { rollupOptions: { input: 'roue-chat.html' }, target: 'es2022', modulePreload: false, emptyOutDir: false },
});
