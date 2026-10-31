# Roue du hasard

Application web en un seul fichier HTML : une roue désigne qui reçoit un cadeau. Spécification : `docs/spec.md`. Stories : `docs/stories.md`. Run : `_bmad-output/implementation-artifacts/run-autonome.md`.

## Invariants
- Aucune requête réseau ni dépendance d'exécution ; tout tient dans `roue.html` (moins de 200 Ko).
- Tirage par `crypto.getRandomValues`, décidé avant l'animation, jamais `Math.random`.
- Noms rendus en texte seulement, jamais `innerHTML`.
- Fonctionne en `file://`, même sans stockage.

## Commandes
Définies par la story 1.1 : les ajouter ici (lint, types, tests ciblés, E2E, construction).
Contrôle rapide avant chaque rapport : `uv run --no-project python .claude/cost-kit/controle_rapide.py` (ESLint et `tsc --noEmit`).
