/**
 * Client de transcription (6.2) : envoie un WAV à `POST /stt`, relais de `scripts/serveur-chat.mjs`
 * vers whisper.cpp (6.1). Jamais d'appel direct au port du STT. Aucun échec n'est une exception :
 * le chat écrit continue de fonctionner. `fetch` est injectable.
 */

export const URL_STT_DEFAUT = '/stt';
export const DELAI_STT_MS = 10000;
/** Taille maximale de l'indice (`prompt`), en caractères. */
export const INDICE_MAX = 200;

const PREFIXE_INDICE = 'Commandes de la roue du hasard : ajoute, retire, supprime, remplace, vide la roue, fais tourner. Prénoms : ';

export type ErreurStt = 'stt-absent' | 'delai' | 'reponse-invalide' | 'annule';

export type ResultatStt =
  | { readonly ok: true; readonly texte: string; readonly dureeMs: number; readonly brut: string }
  | { readonly ok: false; readonly erreur: ErreurStt };

export interface OptionsClientStt {
  readonly url?: string;
  readonly delaiMs?: number;
  readonly fetch?: typeof fetch;
  /** Horloge en ms (injectable pour les tests). */
  readonly maintenant?: () => number;
}

export interface ClientStt {
  transcrire(wav: Blob, options?: { readonly indices?: readonly string[]; readonly signal?: AbortSignal }): Promise<ResultatStt>;
}

/**
 * Indice de vocabulaire : consignes puis prénoms, en texte simple. Les caractères qui ressemblent à
 * un délimiteur ou à une consigne (retours à la ligne, chevrons, guillemets, accolades, crochets,
 * barres) sont remplacés par des espaces ; les prénoms qui ne tiennent pas dans la borne sont omis.
 */
export function construireIndice(indices: readonly string[]): string {
  let indice = PREFIXE_INDICE;
  let premier = true;
  for (const brut of indices) {
    const nom = brut
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f<>"'`{}[\]\\|;:]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (nom === '') continue;
    const ajout = `${premier ? '' : ', '}${nom}`;
    if (indice.length + ajout.length + 1 > INDICE_MAX) break;
    indice += ajout;
    premier = false;
  }
  return premier ? '' : `${indice}.`;
}

/** Nettoie la réponse de whisper : espaces, point final, marqueurs de silence (« [BLANK_AUDIO] », « (musique) »). */
export function nettoyerTexte(brut: string): string {
  const t = brut.replace(/\s+/gu, ' ').trim();
  if (/^[[(][^\])]*[\])]$/u.test(t)) return '';
  return t.replace(/\.+$/u, '').trim();
}

export function creerClientStt(options: OptionsClientStt = {}): ClientStt {
  const url = options.url ?? URL_STT_DEFAUT;
  const delaiMs = options.delaiMs ?? DELAI_STT_MS;
  const maintenant = options.maintenant ?? ((): number => performance.now());
  return {
    async transcrire(wav, { indices = [], signal } = {}) {
      const appel = options.fetch ?? globalThis.fetch.bind(globalThis);
      const controle = new AbortController();
      let cause: ErreurStt | null = null;
      const minuteur = setTimeout(() => {
        cause = 'delai';
        controle.abort();
      }, delaiMs);
      const surAnnulation = (): void => {
        cause ??= 'annule';
        controle.abort();
      };
      if (signal?.aborted === true) {
        clearTimeout(minuteur);
        return { ok: false, erreur: 'annule' };
      }
      signal?.addEventListener('abort', surAnnulation, { once: true });
      const debut = maintenant();
      try {
        const form = new FormData();
        form.append('file', wav, 'voix.wav');
        form.append('language', 'fr');
        form.append('response_format', 'json');
        form.append('temperature', '0');
        const indice = construireIndice(indices);
        if (indice !== '') form.append('prompt', indice);
        let reponse: Response;
        try {
          reponse = await appel(url, { method: 'POST', body: form, signal: controle.signal });
        } catch {
          return { ok: false, erreur: cause ?? 'stt-absent' };
        }
        // 502 : le relais n'a pas joint whisper-server.
        if (reponse.status === 502 || reponse.status === 504) return { ok: false, erreur: 'stt-absent' };
        if (!reponse.ok) return { ok: false, erreur: 'reponse-invalide' };
        let donnees: unknown;
        try {
          donnees = await reponse.json();
        } catch {
          return { ok: false, erreur: cause ?? 'reponse-invalide' };
        }
        const texte = (donnees as { text?: unknown } | null)?.text;
        if (typeof texte !== 'string') return { ok: false, erreur: 'reponse-invalide' };
        return { ok: true, texte: nettoyerTexte(texte), brut: texte, dureeMs: maintenant() - debut };
      } finally {
        clearTimeout(minuteur);
        signal?.removeEventListener('abort', surAnnulation);
      }
    },
  };
}
