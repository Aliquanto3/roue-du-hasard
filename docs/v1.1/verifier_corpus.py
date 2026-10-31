"""Vérifie la structure du corpus d'essai du chat V1.1 (sans dépendance).

Usage : uv run --no-project python docs/v1.1/verifier_corpus.py [corpus.jsonl]
Code de retour 1 si une erreur est relevée. Ne mesure aucune qualité de moteur.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
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
        if not isinstance(cands, list) or len(cands) < 2:
            err("clarifier exige au moins 2 candidats")
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


def main(chemin: Path) -> int:
    erreurs: list[str] = []
    lignes = [l for l in chemin.read_text(encoding="utf-8").splitlines() if l.strip()]
    ids: set[str] = set()
    par_cat: Counter[str] = Counter()
    par_action: Counter[str] = Counter()
    par_lot: Counter[str] = Counter()
    lot_cat: dict[str, Counter[str]] = {}
    commandes_lot: dict[str, str] = {}

    for n, brut in enumerate(lignes, 1):
        try:
            d = json.loads(brut)
        except json.JSONDecodeError as exc:
            erreurs.append(f"ligne {n} : JSON invalide ({exc})")
            continue
        if not isinstance(d, dict):
            erreurs.append(f"ligne {n} : objet JSON attendu")
            continue
        if d.get("id") in ids:
            erreurs.append(f"ligne {n} : id en double « {d.get('id')} »")
        ids.add(d.get("id"))
        actions = verifier_ligne(n, d, erreurs)
        par_cat[d.get("categorie")] += 1
        par_lot[d.get("lot")] += 1
        lot_cat.setdefault(d.get("categorie"), Counter())[d.get("lot")] += 1
        for a in actions:
            par_action[a] += 1
        # Une même commande ne doit pas être répartie entre dev et test.
        cle = d.get("commande", "").strip().lower()
        if commandes_lot.setdefault(cle, d.get("lot")) != d.get("lot"):
            erreurs.append(f"ligne {n} : commande « {d.get('commande')} » présente dans dev et test")

    for cat in sorted(CATEGORIES):
        if par_cat[cat] == 0:
            erreurs.append(f"catégorie absente : {cat}")
        elif par_cat[cat] < MIN_PAR_CATEGORIE:
            erreurs.append(f"catégorie {cat} : {par_cat[cat]} lignes (minimum {MIN_PAR_CATEGORIE})")
        c = lot_cat.get(cat, Counter())
        if par_cat[cat] and not (0.3 <= c["dev"] / par_cat[cat] <= 0.5):
            erreurs.append(f"catégorie {cat} : dev = {c['dev']}/{par_cat[cat]} (hors de 30 à 50 %)")

    total = sum(par_cat.values())
    print(f"{total} lignes ; lot dev {par_lot['dev']}, test {par_lot['test']}")
    print("\nPar catégorie (dev/test) :")
    for cat in sorted(par_cat, key=str):
        c = lot_cat[cat]
        print(f"  {cat:26} {par_cat[cat]:3}  ({c['dev']}/{c['test']})")
    print("\nPar action (étapes attendues) :")
    for a in sorted(par_action):
        print(f"  {a:26} {par_action[a]:3}")

    if erreurs:
        print(f"\n{len(erreurs)} erreur(s) :", file=sys.stderr)
        for e in erreurs:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print("\nCorpus valide.")
    return 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else CORPUS))
