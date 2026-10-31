"""Vérifie la structure du corpus d'essai du chat V1.1 (sans dépendance).

Usage : uv run --no-project python docs/v1.1/verifier_corpus.py [corpus.jsonl]
Code de retour 1 si une erreur est relevée. Ne mesure aucune qualité de moteur.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

CORPUS = Path(__file__).with_name("corpus-commandes.jsonl")

CATEGORIES = {
    "formes_directes", "familier_fautes", "tournures_indirectes",
    "noms_composes_prefixes", "homonymes", "accents_casse", "noms_faux_amis",
    "plusieurs_noms", "nom_absent", "injection", "truquage", "hors_sujet",
    "lancement_impossible", "transcription_orale",
}
MIN_PAR_CATEGORIE = 8
MAX_NOM = 60
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")

# action -> {paramètre: type}
ACTIONS: dict[str, dict[str, type]] = {
    "ajouter": {"nom": str},
    "coller": {"texte": str},
    "renommer": {"nom": str, "nouveau": str},
    "supprimer": {"nom": str},
    "definirCouleur": {"nom": str, "couleur": str},
    "reinitialiserCouleur": {"nom": str},
    "reinitialiserCouleurs": {},
    "lancer": {},
    "afficherCadeauSuivant": {},
    "ajouterCadeau": {"nom": str},
    "annulerDernierTirage": {},
    "basculerRendu": {"mode": str},
    "couperSon": {"coupe": bool},
    "retirerGagnants": {"actif": bool},
    "effacerHistorique": {},
    "modeProjection": {"actif": bool},
    "exporter": {},
}
# Le nom doit exister dans etat.noms.
NOM_PRESENT = {"renommer", "supprimer", "definirCouleur", "reinitialiserCouleur"}
# Actions interdites pendant la rotation (liste verrouillée, F8) ou lancer.
VERROUILLEES = {"ajouter", "coller", "renommer", "supprimer", "definirCouleur",
                "reinitialiserCouleur", "reinitialiserCouleurs", "lancer",
                "effacerHistorique", "annulerDernierTirage"}
DESTRUCTIVES = {"effacerHistorique", "reinitialiserCouleurs"}
LOTS = {"dev", "test"}
# Couverture minimale par action cible (étapes attendues), dans chaque lot.
MIN_ACTION_DEV = 2
MIN_ACTION_TEST = 3
# Quasi-doublons dev/test : similarité (difflib) des commandes normalisées.
SEUIL_QUASI_DOUBLON = 0.85
# Formes canoniques « verbe + nom » : une fois les noms de l'état retirés, il ne reste
# que la structure imposée par l'action (seul le nom change d'une ligne à l'autre). Une
# paire est tolérée si l'un des deux textes normalisés figure ici.
GABARITS_CANONIQUES = re.compile(
    r"^(supprime|retire|reinitialise la couleur de"
    r"|mets? (et )?en( \w+)?|renomme en \w+|r?ajoute( \w+)?)$"
)
# Paires (id test, id dev) tolérées une à une, avec le motif.
EXCEPTIONS_QUASI_DOUBLON: dict[tuple[str, str], str] = {}


def etapes(attendu: dict) -> list[dict]:
    if "actions" in attendu:
        return attendu["actions"]
    return [attendu]


def verifier_ligne(n: int, d: dict, erreurs: list[str]) -> list[str]:
    """Retourne la liste des actions de la ligne (pour le décompte)."""
    def err(msg: str) -> None:
        erreurs.append(f"ligne {n} ({d.get('id', '?')}) : {msg}")

    for champ in ("id", "lot", "categorie", "commande", "etat", "attendu", "confirmation"):
        if champ not in d:
            err(f"champ manquant « {champ} »")
            return []
    if d["lot"] not in LOTS:
        err(f"lot inconnu « {d['lot']} »")
    if d["categorie"] not in CATEGORIES:
        err(f"catégorie inconnue « {d['categorie']} »")
    if not isinstance(d["commande"], str) or not d["commande"].strip():
        err("commande vide")
    if not isinstance(d["confirmation"], bool):
        err("confirmation doit être un booléen")

    etat = d["etat"]
    if not isinstance(etat, dict):
        err("etat doit être un objet")
        return []
    noms = etat.get("noms")
    if not isinstance(noms, list) or not all(isinstance(x, str) for x in noms):
        err("etat.noms doit être une liste de chaînes")
        return []
    if not isinstance(etat.get("rotation"), bool):
        err("etat.rotation doit être un booléen")
    cadeaux = etat.get("cadeaux", [])
    if not isinstance(cadeaux, list) or not all(isinstance(x, str) for x in cadeaux):
        err("etat.cadeaux doit être une liste de chaînes")
    rotation = etat.get("rotation") is True

    att = d["attendu"]
    if not isinstance(att, dict):
        err("attendu doit être un objet")
        return []
    liste: list[str] = []

    if att.get("action") == "refuser":
        if set(att) != {"action"}:
            err("refuser ne porte aucun autre champ")
        if d["confirmation"]:
            err("refuser n'a pas de confirmation")
        return ["refuser"]

    if att.get("action") == "clarifier":
        cands = att.get("candidats")
        if set(att) != {"action", "candidats"}:
            err("clarifier ne porte que « candidats »")
        mini = 2 if d["categorie"] == "homonymes" else 1
        if not isinstance(cands, list) or len(cands) < mini:
            err(f"clarifier exige au moins {mini} candidat(s) dans la catégorie {d['categorie']}")
        elif not all(isinstance(x, str) for x in cands):
            err("candidats : liste de chaînes attendue")
        else:
            dispo = Counter(noms)
            for nom, nb in Counter(cands).items():
                if dispo[nom] < nb:
                    err(f"candidat « {nom} » absent de etat.noms (ou en nombre insuffisant)")
        if d["confirmation"]:
            err("clarifier n'a pas de confirmation")
        return ["clarifier"]

    if "actions" in att:
        if set(att) != {"actions"} or not isinstance(att["actions"], list) or len(att["actions"]) < 2:
            err("« actions » : liste d'au moins 2 étapes, sans autre champ")
            return []
    elif set(att) != {"action", "params"}:
        err("attendu : {action, params}, {actions}, refuser ou clarifier")
        return []

    suppressions = 0
    for e in etapes(att):
        nom_a = e.get("action") if isinstance(e, dict) else None
        if nom_a not in ACTIONS:
            err(f"action non autorisée « {nom_a} »")
            continue
        liste.append(nom_a)
        params = e.get("params")
        if set(e) != {"action", "params"} or not isinstance(params, dict):
            err(f"{nom_a} : forme {{action, params}} attendue")
            continue
        if set(params) != set(ACTIONS[nom_a]):
            err(f"{nom_a} : paramètres {sorted(params)} au lieu de {sorted(ACTIONS[nom_a])}")
            continue
        for p, typ in ACTIONS[nom_a].items():
            if not isinstance(params[p], typ):
                err(f"{nom_a}.{p} doit être de type {typ.__name__}")
        if nom_a == "basculerRendu" and params.get("mode") not in ("2d", "3d"):
            err("basculerRendu.mode : « 2d » ou « 3d »")
        if nom_a == "definirCouleur" and not (isinstance(params.get("couleur"), str) and HEX.match(params["couleur"])):
            err("definirCouleur.couleur : #RRGGBB attendu")
        for p in ("nom", "nouveau"):
            v = params.get(p)
            if isinstance(v, str) and not (0 < len(v.strip()) <= MAX_NOM):
                err(f"{nom_a}.{p} vide ou de plus de {MAX_NOM} caractères")
        if nom_a in NOM_PRESENT and params.get("nom") not in noms:
            err(f"{nom_a} : nom « {params.get('nom')} » absent de etat.noms")
        if nom_a == "supprimer":
            suppressions += 1
        if nom_a == "lancer" and (len(noms) < 2 or rotation):
            err("lancer attendu alors que le lancement est impossible (moins de 2 noms ou rotation)")
        if rotation and nom_a in VERROUILLEES:
            err(f"{nom_a} attendu pendant la rotation (doit être refuser)")

    attend_conf = suppressions >= 2 or any(a in DESTRUCTIVES for a in liste)
    if d["confirmation"] != attend_conf:
        err(f"confirmation={d['confirmation']} mais {attend_conf} attendu (action destructive)")
    return liste


def _sans_accents(texte: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texte) if not unicodedata.combining(c))


def _mots(texte: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", _sans_accents(texte.lower())).split())


BRUIT = ("s il te plait", "s il vous plait", "stp", "svp", "euh", "heu")


def normaliser_commande(commande: str, noms: list[str]) -> str:
    """Minuscules, sans accents, sans hésitations, politesse ni noms de l'état."""
    texte = f" {_mots(commande)} "
    for nom in sorted({_mots(n) for n in noms if _mots(n)}, key=len, reverse=True):
        texte = texte.replace(f" {nom} ", " ")
    for bruit in BRUIT:
        texte = texte.replace(f" {bruit} ", " ")
    return " ".join(texte.split())


def quasi_doublons(lignes: list[dict]) -> list[str]:
    """Paires test/dev trop proches une fois les noms de l'état et le bruit retirés."""
    erreurs: list[str] = []
    dev = [(d["id"], normaliser_commande(d["commande"], d["etat"]["noms"])) for d in lignes if d["lot"] == "dev"]
    brutes_dev = {d["commande"].strip().lower(): d["id"] for d in lignes if d["lot"] == "dev"}
    for d in lignes:
        if d["lot"] != "test":
            continue
        doublon = brutes_dev.get(d["commande"].strip().lower())
        if doublon:
            erreurs.append(f"commande « {d['commande']} » présente dans dev ({doublon}) et test ({d['id']})")
        a = normaliser_commande(d["commande"], d["etat"]["noms"])
        for id_dev, b in dev:
            if (d["id"], id_dev) in EXCEPTIONS_QUASI_DOUBLON:
                continue
            if GABARITS_CANONIQUES.match(a) or GABARITS_CANONIQUES.match(b):
                continue
            ratio = SequenceMatcher(None, a, b).ratio()
            if ratio >= SEUIL_QUASI_DOUBLON:
                erreurs.append(
                    f"quasi-doublon test/dev : {d['id']} « {d['commande']} » ~ {id_dev} "
                    f"(similarité {ratio:.2f} sur « {a} » / « {b} »)"
                )
    return erreurs


def main(chemin: Path) -> int:
    erreurs: list[str] = []
    lignes = [ligne for ligne in chemin.read_text(encoding="utf-8").splitlines() if ligne.strip()]
    ids: set[str] = set()
    par_cat: Counter[str] = Counter()
    par_action: Counter[str] = Counter()
    action_lot: dict[str, Counter[str]] = {}
    par_lot: Counter[str] = Counter()
    refuser_lot: Counter[str] = Counter()
    lot_cat: dict[str, Counter[str]] = {}
    valides: list[dict] = []

    for n, brut in enumerate(lignes, 1):
        try:
            d = json.loads(brut)
        except json.JSONDecodeError as exc:
            erreurs.append(f"ligne {n} : JSON invalide ({exc})")
            continue
        if not isinstance(d, dict):
            erreurs.append(f"ligne {n} : objet JSON attendu")
            continue
        id_ligne = str(d.get("id"))
        if id_ligne in ids:
            erreurs.append(f"ligne {n} : id en double « {id_ligne} »")
        ids.add(id_ligne)
        nb_erreurs = len(erreurs)
        actions = verifier_ligne(n, d, erreurs)
        lot = str(d.get("lot"))
        cat = str(d.get("categorie"))
        par_cat[cat] += 1
        par_lot[lot] += 1
        lot_cat.setdefault(cat, Counter())[lot] += 1
        for a in actions:
            par_action[a] += 1
            action_lot.setdefault(a, Counter())[lot] += 1
        if actions == ["refuser"]:
            refuser_lot[lot] += 1
        etat = d.get("etat")
        if (
            len(erreurs) == nb_erreurs
            and isinstance(d.get("commande"), str)
            and isinstance(etat, dict)
            and isinstance(etat.get("noms"), list)
        ):
            valides.append(d)

    # Une même commande ne doit pas être répartie entre dev et test (doublon exact)
    # et aucune paire dev/test ne doit être quasi identique.
    erreurs.extend(quasi_doublons(valides))

    for cat in sorted(CATEGORIES):
        if par_cat[cat] == 0:
            erreurs.append(f"catégorie absente : {cat}")
        elif par_cat[cat] < MIN_PAR_CATEGORIE:
            erreurs.append(f"catégorie {cat} : {par_cat[cat]} lignes (minimum {MIN_PAR_CATEGORIE})")
        c = lot_cat.get(cat, Counter())
        if par_cat[cat] and not (0.3 <= c["dev"] / par_cat[cat] <= 0.5):
            erreurs.append(f"catégorie {cat} : dev = {c['dev']}/{par_cat[cat]} (hors de 30 à 50 %)")

    for a in sorted(set(ACTIONS) | {"refuser", "clarifier"}):
        c = action_lot.get(a, Counter())
        if c["dev"] < MIN_ACTION_DEV or c["test"] < MIN_ACTION_TEST:
            erreurs.append(
                f"action {a} : dev {c['dev']}, test {c['test']} "
                f"(minimum {MIN_ACTION_DEV} et {MIN_ACTION_TEST})"
            )

    total = sum(par_cat.values())
    print(f"{total} lignes ; lot dev {par_lot['dev']}, test {par_lot['test']}")
    print("\nPar catégorie (dev/test) :")
    for cat in sorted(par_cat):
        c = lot_cat[cat]
        print(f"  {cat:26} {par_cat[cat]:3}  ({c['dev']}/{c['test']})")
    print("\nPar action (étapes attendues ; dev/test) :")
    for a in sorted(par_action):
        c = action_lot[a]
        print(f"  {a:26} {par_action[a]:3}  ({c['dev']}/{c['test']})")
    if total:
        print("\nRéférence « moteur qui refuse tout » (part de lignes attendues en refuser) :")
        for lot in sorted(par_lot):
            print(f"  {lot:5} {refuser_lot[lot]}/{par_lot[lot]} = {refuser_lot[lot] / par_lot[lot]:.0%}")

    if erreurs:
        print(f"\n{len(erreurs)} erreur(s) :", file=sys.stderr)
        for e in erreurs:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("\nCorpus valide.")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else CORPUS))
