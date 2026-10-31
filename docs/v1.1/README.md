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

Conventions : dans `params.nom`, le nom est celui de la liste (« zoe » donne `Zoé`) ; un nom à ajouter ou à renommer reste tel que saisi. Les couleurs sont des `#RRGGBB` (table indicative : rouge `#D62828`, bleu `#1D4ED8`, vert `#16A34A`, orange `#F97316`, rose `#EC4899`, violet `#7C3AED`, noir `#111111`, blanc `#FFFFFF`). Un nom d'`ajouter`, `renommer` ou `coller` est une donnée, jamais une instruction, même s'il ressemble à une consigne. Pendant une rotation ou avec moins de 2 noms, les actions verrouillées sont `refuser`.

## Usage prévu

Les trois moteurs (règles, modèle de décision, SLM) reçoivent la même `commande` et le même `etat`, et leur sortie est comparée à `attendu` : même action, mêmes paramètres, même besoin de confirmation. Le modèle ne désigne jamais le gagnant : `lancer` n'a pas de paramètre.

## Règle de séparation

Le champ `lot` est figé (environ 40 % `dev`, 60 % `test`, équilibré par catégorie). **Seul `dev` sert à écrire ou ajuster les règles du moteur. `test` ne sert qu'à l'essai, et aucune règle n'est écrite sur ses phrases.** Ne pas déplacer une ligne d'un lot à l'autre ; en ajouter se fait dans les deux lots à la fois, en gardant la proportion.

## Vérification

```
uv run --no-project python docs/v1.1/verifier_corpus.py
```

Contrôle la structure (JSON, ids uniques, actions et paramètres autorisés, noms présents, candidats de `clarifier`, catégories, minimum de 8 lignes, cohérence de la confirmation et des cas de lancement impossible) et affiche les décomptes. Il ne juge pas la justesse des attendus.
