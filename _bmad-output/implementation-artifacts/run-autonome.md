# Run autonome — Roue du hasard, suite (V1.0 à V1.3)

Spécification : `docs/spec.md`, `docs/v1.1-chat-slm.md`, `docs/v1.2-supports.md`. Stories : `docs/stories.md`. Statut : `_bmad-output/implementation-artifacts/sprint-status.yaml`. Run V1 terminé : `archive/run-autonome-v1.md`.

## Périmètre

| Périmètre | Epics | Note |
|---|---|---|
| Dans le run | Epics 4 à 7 | Release V1.0 (4.2), chat local V1.1 (5), voix (6), supports et projection V1.2 (7) |

Au plus 2 stories en développement à la fois

## Sprint 3 — Release V1.0 et base du chat

| Vague | Stories en parallèle | Après |
|---|---|---|
| V0 | 4.2 (humaine) · 5.1 ★ | |
| V1 | 5.2 · 5.4 | 5.2 ← 5.1 ; 5.4 ← 5.1 |
| V2 | 5.3 | 5.3 ← 5.2 |

## Sprint 4 — Chat utilisable

| Vague | Stories en parallèle | Après |
|---|---|---|
| V3 | 5.5 ★ · 5.6 | 5.5 ← 5.3 ; 5.5 ← 5.4 ; 5.6 ← 5.1 |
| V3b | 5.10 (mixte) | 5.10 ← 5.6 |
| V4 | 5.7 | 5.7 ← 5.5 ; 5.7 ← 5.6 |
| V5 | 5.8 (mixte) | 5.8 ← 5.7 ; 5.8 ← 5.10 |
| V6 | 5.9 (humaine) | 5.9 ← 5.8 |

## Sprint 5 — Supports et projection (V1.2)

| Vague | Stories en parallèle | Après |
|---|---|---|
| V7 | 7.2 | 7.2 ← 4.2 |
| V8 | 7.1 | 7.1 ← 5.5 |
| V9 | 7.3 (humaine) | 7.3 ← 7.1 ; 7.3 ← 7.2 |

## Sprint 6 — Voix (V1.3)

| Vague | Stories en parallèle | Après |
|---|---|---|
| V10 | 6.1 (mixte) | 6.1 ← 5.4 |
| V11 | 6.2 | 6.2 ← 6.1 ; 6.2 ← 5.5 |
| V12 | 6.3 | 6.3 ← 6.2 |
| V13 | 6.4 (humaine) | 6.4 ← 6.3 |

Le sprint 5 avance pendant les attentes du sprint 4 (GPU, recette) ; l'ordre des vagues n'est pas un ordre strict entre sprints.

## Règles

- Enchaînement par story : `dev-story` (Sonnet), `second-avis` (Haiku), correction des seuls constats medium et high réels par le même agent, fusion quand la CI de branche est verte. `reviewer` (Opus) seulement sur défaut sérieux. Opus pour le développement de 7.1 (plein écran, repli iPhone) et en reprise après deux échecs Sonnet.
- Vérification Chrome de l'orchestrateur sur la page réelle pour les stories d'interface (5.5, 5.7, 7.1, 6.2).
- **GPU indisponible (Anaël, 2026-11-04) : bancs SLM en cours.** Aucun appel d'inférence à Ollama, aucun programme sur la carte graphique, jusqu'à ce qu'Anaël écrive dans cette session que le GPU est disponible. Une étape qui en a besoin passe en `attente humaine`, avec une notification, et le run avance sur le reste. Téléchargements de petits modèles permis (pas d'inférence).
- Pendant les bancs : pas de suite E2E ni de suite complète en local (elles faussent les mesures de vitesse) ; lint, types et tests unitaires ciblés seulement, la CI de branche sert de suite complète.
- Modèles de décision (Anaël, 2026-11-04) : installer de petits modèles pour tester l'étage 2 ; « petit » = tient avec le SLM retenu dans les 8 Go de la RTX 3050 de ce poste, soit environ 4 Go au plus.
- Contrat partagé fixé par 5.1, à ne pas changer sans décision : tout le code du chat dans `src/chat/` ; types `Decision` (même forme que `attendu` du corpus), `EtatChat`, `Etage` dans `src/chat/types.ts` ; cascade dans `src/chat/cascade.ts`, où chaque étage s'ajoute par une ligne d'enregistrement ; textes du chat dans `src/chat/textes.ts`. `src/main.ts` n'importe jamais `src/chat/` : seule l'édition chat (`src/main-chat.ts`, 5.4) le fait.
- `roue.html` inchangé dans sa promesse N1 : CSP stricte, aucun code du chat (contrôlé par `check:size`). L'édition chat est servie sur `http://localhost:5200` (`npm run chat`), `OLLAMA_ORIGINS=http://localhost:5200`, jamais `null`.
- Le modèle ne désigne jamais le gagnant ; noms = données ; confirmation calculée par l'application, pas par le modèle.
- Corpus : règles écrites sur le lot `dev` seulement, mesures sur `test`.
- Releases : `v1.0.0` après la recette d'Anaël (4.2), `v1.1.0` chat écrit (5.9), `v1.2.0` supports et projection (7.3), `v1.3.0` voix (6.4). Topic `status-*` et `portfolio.json` mis à jour à chaque release.
- État du run hors des PR de story (PR `chore/etat-run-*`). `git worktree prune` avant chaque lancement.
- Arrêts pour Anaël : recette V1.0 avant le tag ; GPU disponible (5.8, 5.10, 6.1) ; recette du chat (5.9) ; enregistrements audio (6.4) ; recette téléphone et projecteur (7.3) ; seuil de déploiement du chat.

## Journal

- 2026-11-04 05:30 · run · décision · Anaël valide le plan : édition chat servie sur localhost, voix dans le run, portfolio dès maintenant ; étage 2 dans le run avec petits modèles de décision à installer ·
- 2026-11-04 05:30 · run · décision · GPU indisponible (bancs SLM d'Anaël) jusqu'à son signal ; pas de suite locale lourde pendant les bancs ·
- 2026-11-04 05:30 · run · décision · le run V1 notait « hors ai-portfolio » : Anaël l'y ajoute ·
