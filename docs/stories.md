# Stories V1

Référence : `docs/spec.md`. Chaque story livre ses tests. Lint, types et tests ciblés sont verts avant la revue.

## Epic 1 — Socle et domaine

- **1.1 Socle du dépôt** : Vite + TS strict + singlefile, ESLint, Vitest, Playwright, CI trois OS, contrôle de taille (N3), CSP (N1), workflow Pages et workflow de release, `CLAUDE.md` à jour. *Fini quand* : une page vide construite en un fichier passe la CI et ne fait aucune requête en `file://`.
- **1.2 Domaine état et tirage** : modèle participants / cadeaux / historique, normalisation F1 à F3, tirage F5 et F6 (générateur injectable), persistance F14 tolérante aux pannes, schéma JSON F15. *Fini quand* : tests §7 verts, dont le χ².
- **1.3 Domaine couleurs** : palette, attribution avec contrainte de voisinage, choix du texte, validateur de la spec §5. *Fini quand* : test N de 2 à 200 vert.

## Epic 2 — La roue utilisable

- **2.1 ★ Roue canvas et rotation** : rendu pré-calculé, séparateurs sombres, libellés adaptatifs, bandeau F10, animation F6 à F8, `prefers-reduced-motion`, performance N7. *Fini quand* : l'angle d'arrêt est vérifié à 2, 3, 10, 200 noms et le rendu reste fluide à 100 noms.
- **2.2 Panneau de configuration et mise en page** : saisie, collage, couleurs F1 à F4, verrouillage pendant la rotation, mise en page N4, thèmes. *Fini quand* : parcours saisie puis lancement vert sur 320 et 1920 px.
- **2.3 Annonce et historique** : annonce F9, `aria-live`, cadeaux F11 et F12, historique et annulation F13, option de retrait F19. *Fini quand* : parcours complet avec et sans cadeaux vert.

- **2.4 Relief de la roue** : F20, rendu relief pré-calculé et bascule 2D / 3D mémorisée dans le panneau. *Fini quand* : l'arrêt reste exact dans les deux rendus, les contrastes des libellés sont tenus et le rendu reste fluide à 100 noms.

## Epic 3 — Ambiance et échange

- **3.1 Import / export** : interface de F15, avis de stockage F14. *Fini quand* : aller-retour exact, fichiers invalides refusés sans perte d'état, nom hostile (`<img onerror>`) rendu en texte.
- **3.2 Son et confettis** : F16 et F17, coupure mémorisée, désactivation en mouvement réduit.
- **3.3 Mode projection** : F18 avec repli CSS, à 1920 et 3840 px.

## Epic 4 — Livraison

- **4.1 Recette automatisée** : matrice §9, axe-core, absence de réseau, `file://` et stockage bloqué.
- **4.2 Distribution** : README français pour novices, lignes de commande réelles, QR code, activation de Pages, tag `v1.0.0` avec `roue.html` et notes, topic `status-deployed` si le projet est exposé.

## Revue

### Passe 1 (2026-10-31, SHA revu 20d792b)

Story 1.1. Base à jour (main 93ff8bd), pas de rebase. Mutation : sans la méta CSP, `check:size` et le E2E CSP échouent.

- Important, medium, second avis, corrigé : CSP non testée. Contrôle dans `check:size` (présence, directives, avant le premier script, donc aussi avant release et Pages) et E2E sur l'événement `securitypolicyviolation`.
- Important, medium, second avis, corrigé : garde externe trop étroit. Il refuse aussi références relatives, `//`, `url()` et API réseau. Le E2E signale aussi un fichier voisin demandé en `file:`, jusque-là filtré.
- Important, medium, orchestrateur, corrigé : CI lancée deux fois par commit de PR (18 jobs). `push` limité à `main`.
- Nit, low, second avis, corrigé : CSP sans `base-uri` ni `form-action`, directives qui n'héritent pas de `default-src`.
- Nit, low, second avis, corrigé : release sans lint, tests ni contrôle tag = version. Ajoutés ; le E2E reste à la CI de `main`.
- Nit, low, second avis, corrigé : `cancel-in-progress` à `false` sur Pages, pour ne pas couper un déploiement en cours.
- Nit, low, second avis, corrigé : `.claude/worktrees/` absent de `.gitignore` ; `.claude/` ignoré par ESLint.
- Nit, low, revue, corrigé : `permissions: contents: read` ajouté à la CI.
- Nit, low, second avis, rejeté : N1 testé au chargement seulement. Il n'y a pas d'autre parcours à ce stade, la story 4.1 les couvre.
