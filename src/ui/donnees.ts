/**
 * Conservation et échange (F14, F15) : boutons d'export et d'import, avis de sauvegarde indisponible,
 * confirmation avant de remplacer des données. Tout passe par la table d'actions ; messages en texte seul.
 */
import type { Actions } from '../actions';
import type { Etat } from '../domain/etat';
import { TEXTS } from '../texts';
import { annonceur, bouton, creer, idUnique } from './dom';
import { lireFichierImport } from './echange';
import type { Roue } from './roue';
import './panneau.css';
import './carte.css';
import './donnees.css';

export interface Donnees {
  /** Avis discret invitant à exporter ; affiché une seule fois. */
  avertirSansSauvegarde(): void;
}

const nonVide = (e: Etat): boolean => e.participants.length > 0 || e.cadeaux.length > 0 || e.historique.length > 0;

type RoueVerrou = Pick<Roue, 'ecouter' | 'enRotation'>;

export function creerDonnees(conteneur: HTMLElement, actions: Actions, roue: RoueVerrou): Donnees {
  const racine = creer('section', 'carte donnees', conteneur);
  const titre = creer('h2', 'panneau__titre', racine);
  titre.id = idUnique('donnees-titre');
  titre.textContent = TEXTS.donnees.titre;
  racine.setAttribute('aria-labelledby', titre.id);
  creer('p', 'panneau__aide', racine).textContent = TEXTS.donnees.aide;

  const avis = creer('p', 'donnees__avis', racine);
  avis.hidden = true;
  avis.setAttribute('role', 'status');
  const statut = creer('p', 'carte__statut', racine);
  statut.setAttribute('role', 'status');
  const annoncer = annonceur(statut);

  const barre = creer('div', 'donnees__barre', racine);
  const boutonExporter = bouton('', TEXTS.donnees.exporter, barre);
  const boutonImporter = bouton('', TEXTS.donnees.importer, barre);
  // Sélecteur natif piloté par le bouton « Importer » : absent de la page et de l'ordre de tabulation.
  const fichier = creer('input', 'donnees__fichier', racine);
  fichier.type = 'file';
  fichier.accept = '.json,application/json';
  fichier.hidden = true;
  fichier.setAttribute('aria-label', TEXTS.donnees.fichierLibelle);

  // Confirmation dans la page (comme l'effacement de l'historique), jamais `confirm` natif.
  const confirmation = creer('div', 'donnees__confirmation', racine);
  confirmation.hidden = true;
  confirmation.setAttribute('role', 'alertdialog');
  const titreConfirmation = creer('p', 'donnees__confirmation-titre', confirmation);
  titreConfirmation.id = idUnique('import-titre');
  titreConfirmation.textContent = TEXTS.donnees.confirmationTitre;
  const aideConfirmation = creer('p', 'panneau__aide', confirmation);
  aideConfirmation.id = idUnique('import-aide');
  aideConfirmation.textContent = TEXTS.donnees.confirmationAide;
  confirmation.setAttribute('aria-labelledby', titreConfirmation.id);
  confirmation.setAttribute('aria-describedby', aideConfirmation.id);
  const rangee = creer('div', 'donnees__barre', confirmation);
  const boutonConfirmer = bouton('', TEXTS.donnees.confirmer, rangee);
  const boutonGarder = bouton('', TEXTS.donnees.garder, rangee);

  let enAttente: Etat | null = null;
  let verrouille = false;

  function fermerConfirmation(rendreFocus: boolean): void {
    enAttente = null;
    confirmation.hidden = true;
    if (rendreFocus) boutonImporter.focus();
  }

  function appliquer(etat: Etat): void {
    const r = actions.executer('importer', { etat });
    annoncer(r.ok ? TEXTS.donnees.statutImporte : TEXTS.refus[r.code]);
  }

  boutonExporter.addEventListener('click', () => {
    const r = actions.executer('exporter', {});
    annoncer(r.ok ? TEXTS.donnees.statutExporte : TEXTS.refus[r.code]);
  });

  boutonImporter.addEventListener('click', () => {
    if (verrouille) {
      annoncer(TEXTS.refus['rotation-en-cours']);
      return;
    }
    fichier.click();
  });

  fichier.addEventListener('change', () => {
    const choisi = fichier.files?.[0];
    fichier.value = '';
    if (!choisi) return;
    void lireFichierImport(choisi).then((r) => {
      if (!r.ok) {
        annoncer(TEXTS.donnees.erreurs[r.code]);
        return;
      }
      if (!nonVide(actions.magasin.lire())) {
        appliquer(r.etat);
        return;
      }
      enAttente = r.etat;
      confirmation.hidden = false;
      boutonGarder.focus();
    });
  });

  boutonGarder.addEventListener('click', () => {
    fermerConfirmation(true);
  });
  boutonConfirmer.addEventListener('click', () => {
    const etat = enAttente;
    fermerConfirmation(true);
    if (etat) appliquer(etat);
  });
  confirmation.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      fermerConfirmation(true);
    }
  });

  function appliquerVerrou(v: boolean): void {
    verrouille = v;
    for (const b of [boutonExporter, boutonImporter]) b.setAttribute('aria-disabled', String(v));
    if (v && !confirmation.hidden) fermerConfirmation(false);
  }
  roue.ecouter('debut', () => {
    appliquerVerrou(true);
  });
  roue.ecouter('fin', () => {
    appliquerVerrou(roue.enRotation);
  });
  appliquerVerrou(roue.enRotation);

  return {
    avertirSansSauvegarde() {
      avis.textContent = TEXTS.donnees.avisSansSauvegarde;
      avis.hidden = false;
    },
  };
}
