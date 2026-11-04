/**
 * Voix (6.2) : enchaîne micro, conversion WAV et transcription, sans DOM. Le résultat n'est jamais
 * exécuté ici : la vue le met dans le champ « Commande », d'où il suit le chemin d'une commande
 * tapée (cascade, planifier, confirmations). Tout échec est un refus en texte, jamais une exception.
 */
import type { Enregistrement, Micro } from './micro';
import type { ClientStt } from './stt';
import { TEXTES_CHAT } from './textes';

export type EtatVoix = 'repos' | 'ecoute' | 'transcription';

export interface Transcription {
  /** Texte nettoyé, mis dans le champ. */
  readonly texte: string;
  /** Réponse brute du STT (inspection). */
  readonly brut: string;
  readonly dureeMs: number;
}

export interface DepsVoix {
  readonly micro: Micro;
  readonly stt: ClientStt;
  /** Prénoms de la liste, envoyés en indice. */
  readonly indices: () => readonly string[];
  readonly surTranscription: (t: Transcription) => void;
  /** Message de refus, en texte. */
  readonly surRefus: (message: string) => void;
  /** Appelé à chaque changement d'état. */
  readonly surEtat: (etat: EtatVoix) => void;
}

export interface Voix {
  etat(): EtatVoix;
  /** Début de l'appui. Sans effet si une prise est déjà en cours. */
  demarrer(): Promise<void>;
  /** Fin de l'appui : l'enregistrement est transcrit. */
  arreter(): void;
  /** Jette tout (panneau fermé, rotation) : ni transcription ni message. */
  annuler(): void;
}

export function creerVoix(deps: DepsVoix): Voix {
  let etat: EtatVoix = 'repos';
  let courant: Enregistrement | null = null;
  let arretDemande = false;
  let annule: AbortController | null = null;
  const changer = (e: EtatVoix): void => {
    etat = e;
    deps.surEtat(e);
  };
  const refuser = (message: string): void => {
    changer('repos');
    deps.surRefus(message);
  };

  return {
    etat: () => etat,
    async demarrer() {
      if (etat !== 'repos') return;
      arretDemande = false;
      changer('ecoute');
      const jeton = new AbortController();
      annule = jeton;
      const depart = await deps.micro.demarrer();
      if (jeton.signal.aborted) {
        if (depart.ok) depart.enregistrement.annuler();
        return;
      }
      if (!depart.ok) {
        refuser(TEXTES_CHAT.voixRefus[depart.erreur]);
        return;
      }
      const enregistrement = depart.enregistrement;
      courant = enregistrement;
      // Bouton relâché avant l'ouverture du micro : on s'arrête aussitôt.
      if (arretDemande) enregistrement.arreter();
      const micro = await enregistrement.resultat;
      if (jeton.signal.aborted) return;
      courant = null;
      if (!micro.ok) {
        refuser(TEXTES_CHAT.voixRefus[micro.erreur]);
        return;
      }
      changer('transcription');
      const reponse = await deps.stt.transcrire(micro.wav, { indices: deps.indices(), signal: jeton.signal });
      if (jeton.signal.aborted) return;
      annule = null;
      if (!reponse.ok) {
        refuser(TEXTES_CHAT.voixRefus[reponse.erreur]);
        return;
      }
      if (reponse.texte === '') {
        refuser(TEXTES_CHAT.voixRefus.vide);
        return;
      }
      changer('repos');
      deps.surTranscription({ texte: reponse.texte, brut: reponse.brut, dureeMs: reponse.dureeMs });
    },
    arreter() {
      if (etat !== 'ecoute') return;
      arretDemande = true;
      courant?.arreter();
    },
    annuler() {
      if (etat === 'repos') return;
      annule?.abort();
      annule = null;
      courant?.annuler();
      courant = null;
      changer('repos');
    },
  };
}
