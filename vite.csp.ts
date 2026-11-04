import type { Plugin } from 'vite';

/** CSP de `roue.html` : aucune connexion. */
export const CSP_ROUE = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** CSP de `roue-chat.html` : celle de `roue.html`, avec Ollama en local comme seule connexion. */
export const CSP_CHAT = CSP_ROUE.replace(
  "connect-src 'none'",
  'connect-src http://localhost:11434 http://127.0.0.1:11434',
);

/** CSP injectée au build seulement : le serveur de dev a besoin de HMR (websocket). */
export function cspPlugin(csp: string): Plugin {
  return {
    name: 'roue-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      },
    ],
  };
}
