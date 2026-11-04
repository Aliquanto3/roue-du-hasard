/**
 * Fenêtre d'inspection (5.7) : dialogue masqué par défaut, ouvert par un bouton du panneau ou par
 * `Alt+Maj+I`. Tout contenu (commande, noms, sortie d'un modèle) est rendu par `textContent` (N2) ;
 * les blocs longs sont repliés (`details`) et construits à l'ouverture seulement. La fermer n'agit
 * pas sur le chat.
 */
import { bouton, creer, idUnique } from '../ui/dom';
import {
  ETAGE_AUCUN,
  MAX_ENTREES,
  actionsDeDecision,
  calculerTableau,
  nomFichierInspection,
  tauxJustes,
  type EntreeInspection,
  type EtageInspecte,
  type Inspection,
  type Taux,
} from './inspection';
import { TEXTES_INSPECTION as T } from './textes-inspection';
import { formeValide, type Decision } from './types';
import './fenetre-inspection.css';

export interface FenetreInspection {
  readonly dialogue: HTMLDialogElement;
  /** `declencheur` : élément refocalisé à la fermeture (WebKit ne donne pas le focus au bouton sur un clic). */
  ouvrir(declencheur?: HTMLElement): void;
  fermer(): void;
  basculer(): void;
  estOuverte(): boolean;
}

const json = (v: unknown): string => JSON.stringify(v, null, 2);
const pct = (t: Taux): string => {
  const x = tauxJustes(t);
  return x === null ? '-' : `${(100 * x).toFixed(0)} %`;
};

/** Déclenche le téléchargement d'un fichier JSON local, via un lien `blob:` temporaire (aucun réseau). */
export function telechargerTexte(texte: string, nom: string): void {
  const url = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.hidden = true;
  document.body.append(lien);
  try {
    lien.click();
  } finally {
    lien.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}

function bloc(parent: HTMLElement, titre: string, contenu: string, ouvert = false): HTMLDetailsElement {
  const d = creer('details', 'inspection__bloc', parent);
  d.open = ouvert;
  creer('summary', 'inspection__resume', d).textContent = titre;
  creer('pre', 'inspection__pre', d).textContent = contenu;
  return d;
}

const libelleVerdict = (e: EntreeInspection): string =>
  e.verdict === null
    ? T.verdictAucun
    : e.verdict.valeur === 'juste'
      ? T.verdictJuste
      : e.verdict.cause === 'ecoute'
        ? T.verdictErreurEcoute
        : T.verdictErreurDecision;

export function creerFenetreInspection(
  parent: HTMLElement,
  inspection: Inspection,
  maintenant: () => Date = () => new Date(),
): FenetreInspection {
  const dialogue = creer('dialog', 'inspection', parent);
  const idTitre = idUnique('inspection-titre');
  dialogue.setAttribute('aria-labelledby', idTitre);

  const entete = creer('div', 'inspection__entete', dialogue);
  const titre = creer('h2', 'inspection__titre', entete);
  titre.id = idTitre;
  titre.textContent = T.titre;
  const fermerBouton = bouton('inspection__fermer', T.fermer, entete);

  const intro = creer('p', 'panneau__aide inspection__intro', dialogue);
  intro.textContent = `${T.intro} ${T.plafond(MAX_ENTREES)}`;
  const avisStockage = creer('p', 'chat__avis inspection__avis', dialogue);
  avisStockage.setAttribute('role', 'note');
  avisStockage.textContent = T.stockageAbsent;

  const tableauZone = creer('section', 'inspection__section', dialogue);
  const aRevoirZone = creer('section', 'inspection__section', dialogue);

  const barre = creer('div', 'inspection__barre', dialogue);
  const exporter = bouton('inspection__exporter', T.exporter, barre);
  const aideExport = creer('span', 'panneau__aide', barre);
  aideExport.id = idUnique('inspection-export-aide');
  exporter.setAttribute('aria-describedby', aideExport.id);
  aideExport.textContent = T.exportAide;
  const effacer = bouton('inspection__effacer', T.effacer, barre);

  const confirmation = creer('div', 'inspection__confirmation', dialogue);
  confirmation.hidden = true;
  confirmation.setAttribute('role', 'alertdialog');
  const questionEffacement = creer('p', 'inspection__question', confirmation);
  questionEffacement.id = idUnique('inspection-effacer');
  confirmation.setAttribute('aria-labelledby', questionEffacement.id);
  const confirmerEffacement = bouton('inspection__confirmer', T.confirmer, confirmation);
  const annulerEffacement = bouton('inspection__annuler', T.annuler, confirmation);

  const messagesZone = creer('section', 'inspection__section', dialogue);
  creer('h3', 'inspection__sous-titre', messagesZone).textContent = T.messagesTitre;
  const liste = creer('ol', 'inspection__liste', messagesZone);
  const vide = creer('p', 'panneau__aide', messagesZone);
  vide.textContent = T.aucunMessage;

  /** Messages dont le détail est ouvert : conservé d'un rendu à l'autre. */
  const ouverts = new Set<string>();
  let refocaliser: { id: string; role: string } | null = null;

  // --- Tableau de bord ---
  const rendreTableau = (): void => {
    const tb = calculerTableau(inspection.entrees());
    tableauZone.replaceChildren();
    creer('h3', 'inspection__sous-titre', tableauZone).textContent = T.tableauTitre;
    creer('p', 'panneau__aide', tableauZone).textContent = tb.total.justes + tb.total.erreurs === 0 ? T.sansVerdict : T.tableauAide;
    const table = creer('table', 'inspection__table', tableauZone);
    const tete = creer('thead', '', table);
    const ligneTete = creer('tr', '', tete);
    for (const c of [T.colCategorie, T.colJustes, T.colErreurs, T.colVerdicts, T.colTaux]) {
      const th = creer('th', '', ligneTete);
      th.scope = 'col';
      th.textContent = c;
    }
    const corps = creer('tbody', '', table);
    const ligne = (libelle: string, t: Taux): void => {
      const tr = creer('tr', '', corps);
      const th = creer('th', '', tr);
      th.scope = 'row';
      th.textContent = libelle;
      for (const v of [String(t.justes), String(t.erreurs), String(t.justes + t.erreurs), pct(t)]) {
        creer('td', '', tr).textContent = v;
      }
    };
    ligne(T.ligneTotal, tb.total);
    for (const k of Object.keys(tb.parEtage).sort()) {
      ligne(T.groupeEtage(k === ETAGE_AUCUN ? T.etageAucun : k), tb.parEtage[k] as Taux);
    }
    for (const k of Object.keys(tb.parAction).sort()) ligne(T.groupeAction(k), tb.parAction[k] as Taux);

    aRevoirZone.replaceChildren();
    creer('h3', 'inspection__sous-titre', aRevoirZone).textContent = T.aRevoirTitre;
    if (tb.aRevoir.length === 0) creer('p', 'panneau__aide', aRevoirZone).textContent = T.aRevoirVide;
    else {
      const ul = creer('ul', 'inspection__revoir', aRevoirZone);
      for (const e of tb.aRevoir) {
        creer('li', '', ul).textContent = `${e.commande} — ${e.etage ?? T.etageAucun} — ${libelleVerdict(e)}`;
      }
    }
  };

  // --- Détail d'un message ---
  const rendreEtage = (parent: HTMLElement, e: EtageInspecte): void => {
    if (e.contexte !== null) {
      const c = e.contexte;
      const d = creer('details', 'inspection__bloc', parent);
      creer('summary', 'inspection__resume', d).textContent = T.contexte(e.etage, c.jetons, c.limite);
      const coupes = creer('p', 'panneau__aide', d);
      coupes.textContent = c.coupes.length === 0 ? T.contexteSansCoupe : `${T.contexteCoupes} : ${c.coupes.join(' ; ')}`;
      creer('pre', 'inspection__pre', d).textContent = c.messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n');
    }
    if (e.sortie !== null) bloc(parent, T.sortieBrute(e.etage), e.sortie);
    if (e.probabilites !== null && Object.keys(e.probabilites).length > 0) bloc(parent, T.probabilites, json(e.probabilites));
    if (e.appelsOutils.length > 0) bloc(parent, T.appelsOutils, json(e.appelsOutils));
  };

  const rendreVerdict = (parent: HTMLElement, e: EntreeInspection): void => {
    const groupe = creer('fieldset', 'inspection__verdict', parent);
    creer('legend', '', groupe).textContent = T.verdictTitre;
    const juste = bouton('inspection__juste', T.juste, groupe);
    juste.dataset['id'] = e.id;
    juste.dataset['role'] = 'juste';
    juste.setAttribute('aria-pressed', String(e.verdict?.valeur === 'juste'));
    const erreur = bouton('inspection__erreur', T.erreur, groupe);
    erreur.dataset['id'] = e.id;
    erreur.dataset['role'] = 'erreur';
    erreur.setAttribute('aria-pressed', String(e.verdict?.valeur === 'erreur'));
    juste.addEventListener('click', () => {
      refocaliser = { id: e.id, role: 'juste' };
      inspection.poserVerdict(e.id, e.verdict?.valeur === 'juste' ? null : { valeur: 'juste' });
    });
    erreur.addEventListener('click', () => {
      refocaliser = { id: e.id, role: 'erreur' };
      inspection.poserVerdict(e.id, e.verdict?.valeur === 'erreur' ? null : { valeur: 'erreur', cause: 'decision' }, e.attendu);
    });
    if (e.verdict?.valeur !== 'erreur') return;

    const idCase = idUnique('inspection-ecoute');
    const ligneCase = creer('div', 'inspection__ligne', groupe);
    const caseEcoute = creer('input', 'inspection__case', ligneCase);
    caseEcoute.type = 'checkbox';
    caseEcoute.id = idCase;
    caseEcoute.checked = e.verdict.cause === 'ecoute';
    caseEcoute.dataset['id'] = e.id;
    caseEcoute.dataset['role'] = 'ecoute';
    const etiquetteCase = creer('label', '', ligneCase);
    etiquetteCase.htmlFor = idCase;
    etiquetteCase.textContent = T.causeEcoute;
    caseEcoute.addEventListener('change', () => {
      refocaliser = { id: e.id, role: 'ecoute' };
      inspection.poserVerdict(e.id, { valeur: 'erreur', cause: caseEcoute.checked ? 'ecoute' : 'decision' }, e.attendu);
    });

    const idAttendu = idUnique('inspection-attendu');
    const etiquetteAttendu = creer('label', 'panneau__etiquette', groupe);
    etiquetteAttendu.htmlFor = idAttendu;
    etiquetteAttendu.textContent = T.attenduLibelle;
    const attendu = creer('textarea', 'panneau__champ inspection__attendu', groupe);
    attendu.id = idAttendu;
    attendu.rows = 3;
    attendu.spellcheck = false;
    attendu.value = e.attendu === null ? '' : json(e.attendu);
    const message = creer('p', 'chat__avis inspection__avis-attendu', groupe);
    message.setAttribute('role', 'alert');
    message.hidden = true;
    message.textContent = T.attenduInvalide;
    const enregistrer = bouton('inspection__enregistrer', T.enregistrerAttendu, groupe);
    enregistrer.addEventListener('click', () => {
      const brut = attendu.value.trim();
      let valeur: Decision | null = null;
      if (brut !== '') {
        try {
          const lu: unknown = JSON.parse(brut);
          if (formeValide(lu)) valeur = lu;
        } catch {
          valeur = null;
        }
        if (valeur === null) {
          message.hidden = false;
          attendu.focus();
          return;
        }
      }
      refocaliser = { id: e.id, role: 'enregistrer' };
      inspection.poserVerdict(e.id, e.verdict ?? { valeur: 'erreur', cause: 'decision' }, valeur);
    });
    enregistrer.dataset['id'] = e.id;
    enregistrer.dataset['role'] = 'enregistrer';
  };

  const rendreDetail = (corps: HTMLElement, e: EntreeInspection): void => {
    const decideur = e.etages.find((x) => x.etage === e.etage && x.raison === null && x.erreur === null);
    creer('p', 'inspection__ligne', corps).textContent = T.decideur(e.etage, decideur?.regle ?? null);
    bloc(corps, T.decision, json(e.decision), true);
    if (e.confiance !== null) creer('p', 'inspection__ligne', corps).textContent = T.confiance(e.confiance);

    creer('h4', 'inspection__sous-sous-titre', corps).textContent = T.etagesEssayes;
    const ul = creer('ul', 'inspection__etages', corps);
    for (const x of e.etages) {
      const etat = x.erreur !== null ? T.etageErreur(x.erreur) : x.raison !== null ? T.etagePasse(x.raison) : T.etageDecide;
      creer('li', '', ul).textContent = `${x.etage} : ${etat} — ${T.latence(x.dureeMs)}`;
      creer('p', 'panneau__aide', ul).textContent = `${T.validation} : ${x.validation}`;
    }
    for (const x of e.etages) rendreEtage(corps, x);

    creer('p', 'inspection__ligne', corps).textContent =
      `${T.plan} : ${e.plan.detail}${e.plan.confirmation ? ` (${T.planConfirmation})` : ''}`;
    creer('p', 'inspection__ligne', corps).textContent = T.action(
      `${actionsDeDecision(e.decision).join(', ')} — ${T.execution(e.execution)}`,
    );
    creer('p', 'inspection__ligne', corps).textContent = T.latenceTotale(e.latenceMs);
    if (e.transcription !== undefined) {
      creer('p', 'inspection__ligne', corps).textContent = T.transcription(e.transcription.brut, e.transcription.latenceMs);
      for (const c of e.transcription.corrections ?? []) creer('p', 'inspection__ligne', corps).textContent = T.correction(c);
      if (e.transcription.corrigee !== undefined) {
        creer('p', 'inspection__ligne', corps).textContent = T.commandeCorrigee(e.transcription.corrigee);
      }
    }
    bloc(corps, T.etatEnvoye, json(e.etat));
    rendreVerdict(corps, e);
  };

  const rendreListe = (): void => {
    const entrees = inspection.entrees();
    liste.replaceChildren();
    vide.hidden = entrees.length > 0;
    for (const e of [...entrees].reverse()) {
      const li = creer('li', 'inspection__message', liste);
      const d = creer('details', 'inspection__details', li);
      d.open = ouverts.has(e.id);
      const resume = creer('summary', 'inspection__resume', d);
      resume.textContent = `${e.commande} — ${e.etage ?? T.etageAucun} — ${libelleVerdict(e)}`;
      const corps = creer('div', 'inspection__corps', d);
      let construitOuvert = false;
      const construire = (): void => {
        construitOuvert = d.open;
        corps.replaceChildren();
        if (d.open) rendreDetail(corps, e);
      };
      construire();
      d.addEventListener('toggle', () => {
        // L'ouverture posée par le rendu émet un `toggle` après coup (Firefox, WebKit) : sans changement
        // réel, ne pas recréer les boutons, le focus rendu après le verdict serait perdu.
        if (d.open === construitOuvert) return;
        if (d.open) ouverts.add(e.id);
        else ouverts.delete(e.id);
        construire();
      });
    }
    if (refocaliser !== null) {
      const { id, role } = refocaliser;
      refocaliser = null;
      liste.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"][data-role="${role}"]`)?.focus();
    }
  };

  const rendre = (): void => {
    avisStockage.hidden = inspection.stockageDisponible();
    rendreTableau();
    rendreListe();
    effacer.disabled = inspection.entrees().length === 0;
    exporter.disabled = inspection.entrees().length === 0;
  };

  // --- Actions globales ---
  exporter.addEventListener('click', () => {
    telechargerTexte(inspection.exporter(maintenant()), nomFichierInspection(maintenant()));
  });
  effacer.addEventListener('click', () => {
    questionEffacement.textContent = T.effacerQuestion(inspection.entrees().length);
    confirmation.hidden = false;
    annulerEffacement.focus();
  });
  annulerEffacement.addEventListener('click', () => {
    confirmation.hidden = true;
    effacer.focus();
  });
  confirmerEffacement.addEventListener('click', () => {
    confirmation.hidden = true;
    ouverts.clear();
    inspection.effacer();
    fermerBouton.focus();
  });

  // --- Ouverture, fermeture, clavier ---
  let declencheur: HTMLElement | null = null;
  const ouvrir = (explicite?: HTMLElement): void => {
    if (dialogue.open) return;
    declencheur = explicite ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    rendre();
    if (typeof dialogue.showModal === 'function') dialogue.showModal();
    else dialogue.setAttribute('open', '');
    fermerBouton.focus();
  };
  const fermer = (): void => {
    if (!dialogue.open) return;
    confirmation.hidden = true;
    if (typeof dialogue.close === 'function') dialogue.close();
    else dialogue.removeAttribute('open');
  };
  dialogue.addEventListener('close', () => {
    confirmation.hidden = true;
    declencheur?.focus();
    declencheur = null;
  });
  fermerBouton.addEventListener('click', fermer);
  // Un clic sur le fond (le dialogue lui-même, hors de son contenu) ferme la fenêtre.
  dialogue.addEventListener('click', (ev) => {
    if (ev.target === dialogue) fermer();
  });
  inspection.abonner(() => {
    if (dialogue.open) rendre();
  });

  const basculer = (): void => {
    if (dialogue.open) fermer();
    else ouvrir();
  };
  // Alt+Maj+I : ni Espace ni Entrée (roue), ni Ctrl+Maj+I (outils du navigateur).
  document.addEventListener('keydown', (ev) => {
    if (!ev.repeat && ev.altKey && ev.shiftKey && !ev.ctrlKey && !ev.metaKey && ev.code === 'KeyI') {
      ev.preventDefault();
      basculer();
    }
  });

  return { dialogue, ouvrir, fermer, basculer, estOuverte: () => dialogue.open };
}
