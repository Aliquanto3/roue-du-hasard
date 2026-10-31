"""Génère docs/qr-telephone.svg (QR code de la page GitHub Pages).

Usage : uv run --no-project --with segno==1.6.6 python scripts/generer-qr.py
"""

from pathlib import Path

import segno

ADRESSE = "https://aliquanto3.github.io/roue-du-hasard/"
SORTIE = Path(__file__).resolve().parent.parent / "docs" / "qr-telephone.svg"

qr = segno.make(ADRESSE, error="h")
# Noir sur blanc, marge de 4 modules : lisible aussi en thème sombre.
qr.save(str(SORTIE), kind="svg", scale=8, border=4, dark="#000000", light="#ffffff", xmldecl=False)
print(f"{SORTIE} ecrit pour {ADRESSE}")
