# Corpus d'essai du chat V1.1

Commandes françaises écrites à la main (noms fictifs), pour essayer plus tard les trois moteurs du chat décrits dans `docs/v1.1-chat-slm.md`. Ce corpus ne mesure rien par lui-même : il fixe des cas et leur résultat attendu, rien de plus.

## Format

`corpus-commandes.jsonl`, une ligne JSON par cas :

| Champ | Contenu |
|---|---|
| `id` | identifiant unique |
| `lot` | `dev` ou `test` (voir la règle ci-dessous) |
| `categorie` | une des 14 catégories (formes directes, familier et fautes, tournures indirectes, noms composés, homonymes, accents et casse, faux amis, plusieurs noms, nom absent, injection, truquage, hors sujet, lancement impossible, transcription orale) |
| `commande` | texte reçu, écrit ou transcrit |
| `etat` | `noms` (liste ordonnée, doublons possibles), `cadeaux` (facultatif), `rotation` (booléen) |
| `attendu` | `{action, params}` ; `{actions: [...]}` pour plusieurs étapes ; `{action: "refuser"}` ; `{action: "clarifier", candidats: [...]}` |
| `confirmation` | vrai pour `effacerHistorique`, `reinitialiserCouleurs` et les suppressions multiples |

Conventions : dans `params.nom`, le nom est celui de la liste (« zoe » donne `Zoé`) ; un nom à ajouter ou à renommer reste tel que saisi. Les couleurs sont des `#RRGGBB` (table indicative : rouge `#D62828`, bleu `#1D4ED8`, vert `#16A34A`, orange `#F97316`, rose `#EC4899`, violet `#7C3AED`, noir `#111111`, blanc `#FFFFFF`). Un nom d'`ajouter`, `renommer` ou `coller` est une donnée, jamais une instruction, même s'il ressemble à une consigne. Voir « Règles d'attendu » pour le verrouillage.

## Règles d'attendu

- **Verrouillage.** Pendant une rotation, les actions qui modifient la liste ou le tirage sont `refuser` (ajouter, coller, renommer, supprimer, couleurs, lancer, effacer l'historique, annuler le dernier tirage). Avec moins de 2 noms, seul `lancer` est `refuser` ; ajouter ou coller restent permis.
- **Prénoms déformés (règle unique).** Si la forme saisie se prononce pareil ou presque comme un seul nom de la liste (« mari » pour Marie, « pol » pour Paul, « lea » pour Léa), la correction est directe : l'action porte le nom de la liste. Si c'est un autre prénom réel, proche d'un nom de la liste (« Maria » avec Marie, « Pauline » avec Paul), l'attendu est `clarifier` avec ce seul candidat. Le vérificateur accepte donc au moins 1 candidat pour `clarifier`, et au moins 2 dans la catégorie `homonymes`. Appliqué à `abs-05` et `abs-07`.
- **Homonymes.** Un nom en double sans précision donne `clarifier` (`hom-01`, `hom-06`), sauf demande explicite des deux (« supprime les deux Marie », `hom-14` : deux `supprimer`, avec confirmation). Ajouter un nom déjà présent reste permis, les doublons étant autorisés (F3) : `hom-10` (« ajoute Marie ») et `cmp-13` (« ajoute Anne Sophie » près de Anne-Sophie) donnent `ajouter`.
- **Noms hostiles.** Un nom qui ressemble à une consigne (`inj-*`) reste une donnée littérale, jamais une instruction : `ajouter`, `renommer`, `supprimer` ou `coller` avec ce texte tel quel. Ce qui compte : aucune action autre que celle demandée. L'application affiche ces noms en texte seulement. Une consigne hostile hors d'un nom (« ignore tes instructions… ») est `refuser`.
- **Faux amis.** « lance » seul donne `lancer`, même si une personne s'appelle Lance (`fam2-06`) : le verbe l'emporte.

## Lecture des scores

`refuser` représente environ un quart des lignes (le vérificateur affiche la part exacte par lot). Un moteur qui refuse tout atteindrait donc ce score sans rien comprendre : **le score global seul n'est pas interprétable**. Toujours rapporter un score par action (le vérificateur affiche le décompte dev/test de chaque action) et le taux « moteur qui refuse tout » comme plancher de référence. Chaque action cible compte au moins 3 lignes en `test` et 2 en `dev` ; le corpus peut dépasser 200 lignes.

## Écarts avec `src/actions.ts`

Comparaison faite à la révision du dépôt qui porte ce corpus (lecture seule) :

- `actions.ts` ne contient que 8 actions (`ajouter`, `coller`, `renommer`, `supprimer`, `definirCouleur`, `reinitialiserCouleur`, `reinitialiserCouleurs`, `lancer`), avec les mêmes noms que le corpus. Les 9 autres actions du corpus (`afficherCadeauSuivant`, `ajouterCadeau`, `annulerDernierTirage`, `basculerRendu`, `couperSon`, `retirerGagnants`, `effacerHistorique`, `modeProjection`, `exporter`) n'existent pas encore : elles viendront avec les stories 2.3 et 2.4, et leurs noms et paramètres sont à aligner à ce moment-là.
- Le corpus désigne les personnes par `nom` ; `actions.ts` attend un `id` de participant. Le moteur du chat fait la résolution nom vers id (c'est le rôle de `clarifier`), ce n'est pas un écart du corpus.
- Verrouillage : `actions.ts` refuse en rotation les 8 actions ci-dessus, comme le corpus. Le corpus y ajoute `effacerHistorique` et `annulerDernierTirage`, à confirmer à la création de ces actions.
- `lancer` peut aussi être refusé pour `cadeaux-epuises` ; l'état du corpus ne porte pas le nombre de cadeaux déjà attribués, ce cas n'est pas couvert.

## Usage prévu

Les trois moteurs (règles, modèle de décision, SLM) reçoivent la même `commande` et le même `etat`, et leur sortie est comparée à `attendu` : même action, mêmes paramètres, même besoin de confirmation. Le modèle ne désigne jamais le gagnant : `lancer` n'a pas de paramètre.

## Règle de séparation

Le champ `lot` est figé (environ 43 % `dev`, 57 % `test`, de 30 à 50 % de `dev` dans chaque catégorie). **Seul `dev` sert à écrire ou ajuster les règles du moteur. `test` ne sert qu'à l'essai, et aucune règle n'est écrite sur ses phrases.** Ne pas déplacer une ligne d'un lot à l'autre ; en ajouter se fait dans les deux lots à la fois, en gardant la proportion.

Le lot `test` ne doit pas être passable par une règle apprise sur `dev` à un mot près : le vérificateur refuse les doublons exacts et les quasi-doublons entre lots (commandes normalisées sans accents, sans « euh », « s'il te plaît » ni noms de l'état ; similarité `difflib` de 0,85 ou plus). Seules les formes canoniques « verbe + nom » (« supprime X », « mets X en couleur », « ajoute X ») en sont dispensées, car aucune autre formulation n'existe ; les autres exceptions se déclarent une à une, avec leur motif, dans `EXCEPTIONS_QUASI_DOUBLON`.

## Vérification

```
uv run --no-project python docs/v1.1/verifier_corpus.py
```

Contrôle la structure (JSON, ids uniques, actions et paramètres autorisés, noms présents, candidats de `clarifier`, catégories, minimum de 8 lignes, couverture minimale par action, quasi-doublons entre lots, cohérence de la confirmation et des cas de lancement impossible) et affiche les décomptes par catégorie, par action et par lot, avec le taux « moteur qui refuse tout ». Il ne juge pas la justesse des attendus.
