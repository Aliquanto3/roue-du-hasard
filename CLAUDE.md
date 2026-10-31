# Roue du hasard

Application web en un seul fichier HTML : une roue désigne qui reçoit un cadeau. Spécification : `docs/spec.md`. Stories : `docs/stories.md`. Run : `_bmad-output/implementation-artifacts/run-autonome.md`.

## Invariants
- Aucune requête réseau ni dépendance d'exécution ; tout tient dans `roue.html` (moins de 200 Ko).
- Tirage par `crypto.getRandomValues`, décidé avant l'animation, jamais `Math.random`.
- Noms rendus en texte seulement, jamais `innerHTML`.
- Fonctionne en `file://`, même sans stockage.

## Commandes
- Lint : `npm run lint` ; types : `npm run typecheck` ; tests unitaires : `npm test` (ciblé : `npx vitest run src/<fichier>.test.ts`).
- Construction : `npm run build` (produit `dist/roue.html`) ; taille et ressources externes : `npm run check:size`.
- E2E sur le fichier construit : `npm run test:e2e -- --project=chromium` (build d'abord ; en local seul chromium est installé).
Contrôle rapide avant chaque rapport : `uv run --no-project python .claude/cost-kit/controle_rapide.py` (ESLint et `tsc --noEmit`).
