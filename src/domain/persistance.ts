/** Persistance F14 : tolérante à toute panne, ne lève jamais. */

export interface StockageMinimal {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
  removeItem(cle: string): void;
}

/** Fournisseur de stockage : l'accès à `window.localStorage` peut lui-même lever. */
export type FournisseurStockage = () => StockageMinimal | null | undefined;

const SONDE = "roue:sonde";

export interface Persistance {
  /** Valeur JSON décodée ; `null` si absente, illisible, corrompue ou stockage en panne. */
  lire(cle: string): unknown;
  /** `true` si l'écriture a réussi. */
  ecrire(cle: string, valeur: unknown): boolean;
  supprimer(cle: string): boolean;
  /** Le stockage accepte-t-il lecture et écriture ? (sinon avis F14) */
  fonctionne(): boolean;
}

export function creerPersistance(fournisseur: FournisseurStockage): Persistance {
  const stockage = (): StockageMinimal | null => {
    try {
      return fournisseur() ?? null;
    } catch {
      return null;
    }
  };
  return {
    lire(cle) {
      try {
        const brut = stockage()?.getItem(cle);
        return typeof brut === "string" ? (JSON.parse(brut) as unknown) : null;
      } catch {
        return null;
      }
    },
    ecrire(cle, valeur) {
      try {
        const s = stockage();
        if (!s) return false;
        const texte = JSON.stringify(valeur);
        if (typeof texte !== "string") return false;
        s.setItem(cle, texte);
        return true;
      } catch {
        return false;
      }
    },
    supprimer(cle) {
      try {
        const s = stockage();
        if (!s) return false;
        s.removeItem(cle);
        return true;
      } catch {
        return false;
      }
    },
    fonctionne() {
      try {
        const s = stockage();
        if (!s) return false;
        s.setItem(SONDE, "1");
        const ok = s.getItem(SONDE) === "1";
        s.removeItem(SONDE);
        return ok;
      } catch {
        return false;
      }
    },
  };
}
