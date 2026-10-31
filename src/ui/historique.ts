/**
 * Historique des tirages (F13) et retrait des gagnants (F19). Tout passe par la table d'actions ;
 * les lignes sont mises à jour une à une (clé = rang) : après plusieurs centaines de tirages, un
 * nouveau tirage n'ajoute qu'une ligne. Rien n'est rendu en HTML (N2).
 */
import type { Actions, NomAction, ParametresActions, Resultat } from '../actions';
import type { Etat, Tirage } from '../domain/etat';
import { TEXTS } from '../texts';
import { annonceur, bouton, creer, idUnique } from './dom';
import { formaterHeure, formaterPourCopie } from './historique-format';
import type { Roue } from './roue';
import './panneau.css';
import './carte.css';
import './historique.css';

type RoueVerrou = Pick<Roue, 'ecouter' | 'enRotation'>;

interface LigneTirage {
  readonly tr: HTMLTableRowElement;
  readonly cellules: readonly HTMLTableCellElement[];
  tirage: Tirage | null;
}

export function creerHistorique(conteneur: HTMLElement, actions: Actions, roue: RoueVerrou): void {
  const racine = creer('section', 'carte historique', conteneur);
  const titre = creer('h2', 'panneau__titre', racine);
  titre.id = idUnique('historique-titre');
  titre.textContent = TEXTS.historique.titre;
  racine.setAttribute('aria-labelledby', titre.id);

  // --- F19 ---
  const option = creer('label', 'historique__option', racine);
  const caseRetirer = creer('input', 'historique__case', option);
  caseRetirer.type = 'checkbox';
  const libelleOption = creer('span', 'historique__option-texte', option);
  libelleOption.textContent = TEXTS.historique.retirerLibelle;
  const aideOption = creer('p', 'panneau__aide', racine);
  aideOption.id = idUnique('aide-retirer');
  aideOption.textContent = TEXTS.historique.retirerAide;
  caseRetirer.setAttribute('aria-describedby', aideOption.id);

  const compteur = creer('p', 'carte__compteur', racine);
  const statut = creer('p', 'carte__statut', racine);
  statut.setAttribute('role', 'status');
  const annoncer = annonceur(statut);

  // --- Boutons ---
  const barre = creer('div', 'historique__barre', racine);
  const boutonAnnuler = bouton('', TEXTS.historique.annuler, barre);
  const boutonCopier = bouton('', TEXTS.historique.copier, barre);
  const boutonEffacer = bouton('', TEXTS.historique.effacer, barre);

  // --- Confirmation d'effacement : petite boîte dans la page, jamais `confirm` natif ---
  const confirmation = creer('div', 'historique__confirmation', racine);
  confirmation.hidden = true;
  confirmation.setAttribute('role', 'alertdialog');
  const titreConfirmation = creer('p', 'historique__confirmation-titre', confirmation);
  titreConfirmation.id = idUnique('confirmation-titre');
  const aideConfirmation = creer('p', 'panneau__aide', confirmation);
  aideConfirmation.id = idUnique('confirmation-aide');
  aideConfirmation.textContent = TEXTS.historique.confirmationAide;
  confirmation.setAttribute('aria-labelledby', titreConfirmation.id);
  confirmation.setAttribute('aria-describedby', aideConfirmation.id);
  const rangeeConfirmation = creer('div', 'historique__barre', confirmation);
  const boutonConfirmer = bouton('', TEXTS.historique.confirmer, rangeeConfirmation);
  const boutonGarder = bouton('', TEXTS.historique.garder, rangeeConfirmation);

  // --- Repli de copie ---
  const zoneCopie = creer('textarea', 'panneau__texte historique__copie', racine);
  zoneCopie.hidden = true;
  zoneCopie.readOnly = true;
  zoneCopie.setAttribute('aria-label', TEXTS.historique.copieZoneLibelle);

  // --- Table ---
  const vide = creer('p', 'carte__vide', racine);
  vide.textContent = TEXTS.historique.vide;
  // Région défilante focalisable au clavier : plusieurs centaines de lignes restent navigables.
  const defilant = creer('div', 'historique__defilant', racine);
  defilant.tabIndex = 0;
  defilant.setAttribute('role', 'region');
  defilant.setAttribute('aria-label', TEXTS.historique.tableLibelle);
  const table = creer('table', 'historique__table', defilant);
  const entete = creer('thead', '', table).insertRow();
  for (const texte of Object.values(TEXTS.historique.colonnes)) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = texte;
    entete.append(th);
  }
  const corps = creer('tbody', '', table);

  const lignes: LigneTirage[] = [];
  let verrouille = false;

  function executer<N extends NomAction>(nom: N, params: ParametresActions[N]): Resultat {
    const r = actions.executer(nom, params);
    if (!r.ok) annoncer(TEXTS.refus[r.code]);
    return r;
  }

  function creerLigne(): LigneTirage {
    const tr = document.createElement('tr');
    const cellules = [0, 1, 2, 3].map(() => tr.appendChild(document.createElement('td')));
    corps.append(tr);
    return { tr, cellules, tirage: null };
  }

  function synchroniser(etat: Etat, precedent: Etat | null): void {
    const h = etat.historique;
    if (precedent?.historique !== h) {
      while (lignes.length > h.length) lignes.pop()?.tr.remove();
      let ajoute = false;
      h.forEach((t, i) => {
        let ligne = lignes[i];
        if (!ligne) {
          ligne = creerLigne();
          lignes.push(ligne);
          ajoute = true;
        }
        if (ligne.tirage === t) return;
        ligne.tirage = t;
        const [ordre, nom, cadeau, heure] = ligne.cellules;
        if (ordre) ordre.textContent = String(t.ordre);
        if (nom) nom.textContent = t.nom;
        if (cadeau) cadeau.textContent = t.cadeau ?? '';
        if (heure) heure.textContent = formaterHeure(t.heure);
      });
      if (ajoute) defilant.scrollTop = defilant.scrollHeight;
      zoneCopie.hidden = true;
    }
    compteur.textContent = TEXTS.historique.compteur(h.length);
    vide.hidden = h.length > 0;
    defilant.hidden = h.length === 0;
    const sansTirage = h.length === 0;
    for (const b of [boutonAnnuler, boutonCopier, boutonEffacer]) {
      b.dataset['vide'] = String(sansTirage);
      b.setAttribute('aria-disabled', String(sansTirage || verrouille));
    }
    if (caseRetirer.checked !== etat.retirerGagnants) caseRetirer.checked = etat.retirerGagnants;
    if (sansTirage && !confirmation.hidden) fermerConfirmation(false);
  }

  function appliquerVerrou(v: boolean): void {
    verrouille = v;
    caseRetirer.setAttribute('aria-disabled', String(v));
    for (const b of [boutonAnnuler, boutonCopier, boutonEffacer]) {
      b.setAttribute('aria-disabled', String(v || b.dataset['vide'] === 'true'));
    }
  }

  // --- Interactions ---
  caseRetirer.addEventListener('change', () => {
    const valeur = caseRetirer.checked;
    const r = executer('definirRetirerGagnants', { valeur });
    if (r.ok) annoncer(TEXTS.historique.statutOption(valeur));
    caseRetirer.checked = actions.magasin.lire().retirerGagnants;
  });

  boutonAnnuler.addEventListener('click', () => {
    const etat = actions.magasin.lire();
    const dernier = etat.historique[etat.historique.length - 1];
    if (!dernier) {
      annoncer(TEXTS.refus['historique-vide']);
      return;
    }
    const remis = dernier.retrait !== null && !etat.participants.some((p) => p.id === dernier.participantId);
    const cadeauRendu = dernier.cadeau !== null && !dernier.cadeauSupprime;
    if (executer('annulerDernierTirage', {}).ok) {
      annoncer(TEXTS.historique.statutAnnule(dernier.nom, remis, cadeauRendu));
    }
  });

  async function copier(): Promise<void> {
    const texte = formaterPourCopie(actions.magasin.lire().historique);
    try {
      await navigator.clipboard.writeText(texte);
      zoneCopie.hidden = true;
      annoncer(TEXTS.historique.copieOk);
      return;
    } catch {
      // `file://` ou autorisation refusée : repli ci-dessous.
    }
    zoneCopie.hidden = false;
    zoneCopie.value = texte;
    zoneCopie.focus();
    zoneCopie.select();
    let copie: boolean;
    try {
      copie = document.execCommand('copy');
    } catch {
      copie = false;
    }
    if (copie) {
      zoneCopie.hidden = true;
      boutonCopier.focus();
    }
    annoncer(copie ? TEXTS.historique.copieOk : TEXTS.historique.copieRepli);
  }

  boutonCopier.addEventListener('click', () => {
    if (actions.magasin.lire().historique.length === 0) {
      annoncer(TEXTS.historique.vide);
      return;
    }
    void copier();
  });

  function fermerConfirmation(rendreFocus: boolean): void {
    confirmation.hidden = true;
    if (rendreFocus) boutonEffacer.focus();
  }

  boutonEffacer.addEventListener('click', () => {
    const n = actions.magasin.lire().historique.length;
    if (verrouille) {
      annoncer(TEXTS.refus['rotation-en-cours']);
      return;
    }
    if (n === 0) {
      annoncer(TEXTS.historique.vide);
      return;
    }
    titreConfirmation.textContent = TEXTS.historique.confirmationTitre(n);
    confirmation.hidden = false;
    boutonGarder.focus();
  });
  boutonGarder.addEventListener('click', () => {
    fermerConfirmation(true);
  });
  boutonConfirmer.addEventListener('click', () => {
    const r = executer('effacerHistorique', {});
    fermerConfirmation(true);
    if (r.ok) annoncer(TEXTS.historique.statutEfface);
  });
  confirmation.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      fermerConfirmation(true);
    }
  });

  roue.ecouter('debut', () => {
    appliquerVerrou(true);
  });
  roue.ecouter('fin', () => {
    appliquerVerrou(roue.enRotation);
  });
  actions.magasin.abonner((etat, precedent) => {
    synchroniser(etat, precedent);
  });
  synchroniser(actions.magasin.lire(), null);
  appliquerVerrou(roue.enRotation);
}
