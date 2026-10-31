"""Mesure la matrice des DeltaE2000 CVD de la palette (spec 5).

Usage : uv run --no-project --with coloraide==8.13.1 python scripts/mesure-palette.py
Ecrit src/domain/palette-matrice.json (fixture de test, hors bundle).
Pire cas des quatre visions (normale, protanopie, deuteranopie, tritanopie
a severite 1) pour chaque paire.
"""
import json
from itertools import combinations
from pathlib import Path

from coloraide import Color

COULEURS = ["#E69F00", "#56B4E9", "#F0E442", "#CC79A7", "#009E73", "#D55E00", "#0072B2"]
VISIONS = [None, "protan", "deutan", "tritan"]


def vue(hexa: str, vision: str | None) -> Color:
    c = Color(hexa)
    if vision:
        c = c.filter(vision, severity=1.0)
    return c


def delta(i: int, j: int) -> float:
    return min(
        vue(COULEURS[i], v).delta_e(vue(COULEURS[j], v), method="2000") for v in VISIONS
    )


n = len(COULEURS)
matrice = [[0.0 if i == j else round(delta(i, j), 4) for j in range(n)] for i in range(n)]
min_toutes = min(matrice[i][j] for i, j in combinations(range(n), 2))
cycle = min(matrice[i][(i + 1) % n] for i in range(n))
sortie = {"couleurs": COULEURS, "matrice": matrice, "minToutesPaires": min_toutes, "minCycle": cycle}
chemin = Path(__file__).resolve().parent.parent / "src" / "domain" / "palette-matrice.json"
chemin.write_text(json.dumps(sortie, indent=1) + "\n", encoding="utf-8")
print(f"min toutes paires {min_toutes:.2f} ; min voisines du cycle {cycle:.2f}")
