/**
 * Capture du micro (6.2) : `getUserMedia` puis `MediaRecorder` (webm/opus), converti dans la page en
 * WAV 16 kHz mono PCM 16 bits (le format que `whisper-server` accepte sans ffmpeg, voir 6.1).
 * Rien n'est conservé : les morceaux restent en mémoire le temps de l'envoi, aucun stockage, aucun
 * lien `blob:`, et les pistes sont toujours arrêtées à la fin. L'audio ne va qu'au client STT.
 */

export const DUREE_MAX_MS = 15000;
export const FREQUENCE_WAV = 16000;

export type ErreurMicro = 'micro-absent' | 'micro-refuse' | 'enregistrement-impossible';

export type ResultatMicro = { readonly ok: true; readonly wav: Blob } | { readonly ok: false; readonly erreur: ErreurMicro };

export interface Enregistrement {
  /** Résolu à l'arrêt (demandé, ou automatique à `DUREE_MAX_MS`) avec le WAV, ou une erreur. */
  readonly resultat: Promise<ResultatMicro>;
  /** Termine l'enregistrement et lance la conversion. */
  arreter(): void;
  /** Termine sans résultat exploitable : tout est jeté. */
  annuler(): void;
}

export interface Micro {
  demarrer(): Promise<{ readonly ok: true; readonly enregistrement: Enregistrement } | { readonly ok: false; readonly erreur: ErreurMicro }>;
}

/** Fichier WAV (44 octets d'en-tête puis PCM 16 bits petit-boutiste) depuis des échantillons flottants dans [-1 ; 1]. */
export function encoderWav(echantillons: Float32Array, frequence: number = FREQUENCE_WAV): Blob {
  const octets = echantillons.length * 2;
  const tampon = new ArrayBuffer(44 + octets);
  const vue = new DataView(tampon);
  const ecrire = (decalage: number, texte: string): void => {
    for (let i = 0; i < texte.length; i++) vue.setUint8(decalage + i, texte.charCodeAt(i));
  };
  ecrire(0, 'RIFF');
  vue.setUint32(4, 36 + octets, true);
  ecrire(8, 'WAVE');
  ecrire(12, 'fmt ');
  vue.setUint32(16, 16, true); // taille du bloc fmt
  vue.setUint16(20, 1, true); // PCM
  vue.setUint16(22, 1, true); // mono
  vue.setUint32(24, frequence, true);
  vue.setUint32(28, frequence * 2, true); // octets par seconde
  vue.setUint16(32, 2, true); // octets par échantillon (mono)
  vue.setUint16(34, 16, true);
  ecrire(36, 'data');
  vue.setUint32(40, octets, true);
  for (let i = 0; i < echantillons.length; i++) {
    const s = Math.max(-1, Math.min(1, echantillons[i] ?? 0));
    vue.setInt16(44 + i * 2, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
  }
  return new Blob([tampon], { type: 'audio/wav' });
}

/** Décode l'enregistrement du navigateur et le rééchantillonne en 16 kHz mono (`OfflineAudioContext`). */
export async function versWav16k(enregistre: Blob): Promise<Blob> {
  const octets = await enregistre.arrayBuffer();
  const contexte = new AudioContext();
  try {
    const audio = await contexte.decodeAudioData(octets);
    const longueur = Math.max(1, Math.ceil(audio.duration * FREQUENCE_WAV));
    const hors = new OfflineAudioContext(1, longueur, FREQUENCE_WAV);
    const source = hors.createBufferSource();
    source.buffer = audio;
    source.connect(hors.destination);
    source.start();
    const rendu = await hors.startRendering();
    return encoderWav(rendu.getChannelData(0), FREQUENCE_WAV);
  } finally {
    void contexte.close();
  }
}

export interface OptionsMicro {
  readonly mediaDevices?: Pick<MediaDevices, 'getUserMedia'> | undefined;
  readonly dureeMaxMs?: number;
  readonly convertir?: (enregistre: Blob) => Promise<Blob>;
  readonly creerEnregistreur?: (flux: MediaStream) => MediaRecorder;
}

/** Vrai si la page peut capter le micro (contexte sûr et API présente) : sinon le bouton n'est pas proposé. */
export function microDisponible(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined';
}

export function creerMicro(options: OptionsMicro = {}): Micro {
  const dureeMax = options.dureeMaxMs ?? DUREE_MAX_MS;
  const convertir = options.convertir ?? versWav16k;
  return {
    async demarrer() {
      const peripheriques = options.mediaDevices ?? (typeof navigator === 'undefined' ? undefined : navigator.mediaDevices);
      if (typeof peripheriques?.getUserMedia !== 'function') return { ok: false, erreur: 'micro-absent' };
      let flux: MediaStream;
      try {
        flux = await peripheriques.getUserMedia({ audio: true });
      } catch (e) {
        const nom = (e as { name?: string } | null)?.name;
        return { ok: false, erreur: nom === 'NotFoundError' || nom === 'OverconstrainedError' ? 'micro-absent' : 'micro-refuse' };
      }
      const arreterPistes = (): void => {
        for (const piste of flux.getTracks()) piste.stop();
      };
      let enregistreur: MediaRecorder;
      try {
        enregistreur = options.creerEnregistreur ? options.creerEnregistreur(flux) : new MediaRecorder(flux);
      } catch {
        arreterPistes();
        return { ok: false, erreur: 'enregistrement-impossible' };
      }
      let morceaux: Blob[] = [];
      let jeter = false;
      let fini = false;
      let resoudre: (r: ResultatMicro) => void = () => undefined;
      const resultat = new Promise<ResultatMicro>((ok) => {
        resoudre = ok;
      });
      enregistreur.addEventListener('dataavailable', (ev) => {
        if (ev.data.size > 0) morceaux.push(ev.data);
      });
      enregistreur.addEventListener('error', () => {
        jeter = true;
      });
      enregistreur.addEventListener('stop', () => {
        clearTimeout(minuteur);
        arreterPistes();
        const enregistre = new Blob(morceaux, { type: enregistreur.mimeType });
        morceaux = [];
        if (jeter) {
          resoudre({ ok: false, erreur: 'enregistrement-impossible' });
          return;
        }
        convertir(enregistre).then(
          (wav) => resoudre({ ok: true, wav }),
          () => resoudre({ ok: false, erreur: 'enregistrement-impossible' }),
        );
      });
      const terminer = (): void => {
        if (fini) return;
        fini = true;
        clearTimeout(minuteur);
        if (enregistreur.state === 'inactive') {
          arreterPistes();
          resoudre({ ok: false, erreur: 'enregistrement-impossible' });
        } else enregistreur.stop();
      };
      try {
        enregistreur.start();
      } catch {
        arreterPistes();
        return { ok: false, erreur: 'enregistrement-impossible' };
      }
      const minuteur = setTimeout(terminer, dureeMax);
      return {
        ok: true,
        enregistrement: {
          resultat,
          arreter: terminer,
          annuler: () => {
            jeter = true;
            terminer();
          },
        },
      };
    },
  };
}
