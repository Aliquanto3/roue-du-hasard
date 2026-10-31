/** Aides DOM partagées par les modules de l'interface. Tout texte passe par `textContent` (N2). */

export function creer<K extends keyof HTMLElementTagNameMap>(
  balise: K,
  classe: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(balise);
  el.className = classe;
  parent?.append(el);
  return el;
}

export function champ(classe: string, parent: HTMLElement): HTMLInputElement {
  const el = creer('input', classe, parent);
  el.type = 'text';
  el.autocomplete = 'off';
  el.spellcheck = false;
  return el;
}

export function bouton(classe: string, texte: string, parent: HTMLElement): HTMLButtonElement {
  const el = creer('button', `panneau__bouton ${classe}`.trim(), parent);
  el.type = 'button';
  el.textContent = texte;
  return el;
}

export function etiquette(texte: string, idCible: string, parent: HTMLElement): void {
  const el = creer('label', 'panneau__etiquette', parent);
  el.htmlFor = idCible;
  el.textContent = texte;
}

let compteurId = 0;
export const idUnique = (base: string): string => `${base}-${String((compteurId += 1))}`;

/**
 * Message d'un `role="status"` relu même s'il est identique au précédent : vidé puis rempli
 * après un court délai. Renvoie la fonction d'annonce.
 */
export function annonceur(zone: HTMLElement): (message: string, immediat?: boolean) => void {
  let minuteur = 0;
  return (message, immediat = false) => {
    window.clearTimeout(minuteur);
    if (immediat) {
      zone.textContent = message;
      return;
    }
    zone.textContent = '';
    minuteur = window.setTimeout(() => {
      zone.textContent = message;
    }, 30);
  };
}
