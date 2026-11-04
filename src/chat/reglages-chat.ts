/** Réglages du chat (modèles SLM et décision), mémorisés en `localStorage` ; vides par défaut. */
export interface ReglagesChat {
  readonly modeleSlm: string;
  readonly modeleDecision: string;
}

export const CLE_REGLAGES_CHAT = 'roue-du-hasard:chat:reglages';
export const REGLAGES_VIDES: ReglagesChat = {
  modeleSlm: '',
  modeleDecision: '',
};

type Stockage = Pick<Storage, 'getItem' | 'setItem'>;

/** `acces` peut lever (stockage bloqué, `file://`) : on retombe alors sur les réglages vides. */
export function lireReglages(acces: () => Stockage): ReglagesChat {
  try {
    const brut = acces().getItem(CLE_REGLAGES_CHAT);
    if (brut === null) return REGLAGES_VIDES;
    const v: unknown = JSON.parse(brut);
    if (typeof v !== 'object' || v === null) return REGLAGES_VIDES;
    const { modeleSlm, modeleDecision } = v as Record<string, unknown>;
    return {
      modeleSlm: typeof modeleSlm === 'string' ? modeleSlm.trim() : '',
      modeleDecision: typeof modeleDecision === 'string' ? modeleDecision.trim() : '',
    };
  } catch {
    return REGLAGES_VIDES;
  }
}

/** Rend `true` si l'écriture a réussi. */
export function ecrireReglages(acces: () => Stockage, reglages: ReglagesChat): boolean {
  try {
    acces().setItem(CLE_REGLAGES_CHAT, JSON.stringify(reglages));
    return true;
  } catch {
    return false;
  }
}
