# Audit éditorial de la banque QCM

Date de l’audit initial : 28 juillet 2026.
Dernière extension contrôlée : corrigés de procédure civile 2026.

## Résultat actuel

- Banque source analysée : **2 469 questions**.
- Questions conservées dans l’entraînement : **1 778 questions**.
- Questions retirées et placées en revue éditoriale : **691 questions**.
- Nouvelles questions de procédure civile issues des corrigés 2026 : **120**, toutes admises par le contrôle éditorial.
- Dossiers progressifs conservés : **42**, dont **40 corrigés** et **2 sujets sans corrigé**.

Les 691 questions retirées correspondent au même défaut éditorial principal : elles demandent de retrouver un numéro d’article ou une référence documentaire, souvent avec des choix composés uniquement de numéros d’articles. Elles ne sont plus proposées dans les séries rapides, les entraînements sur mesure, les révisions adaptatives ou les examens blancs.

## Lot procédure civile — corrigés 2026

Les 120 nouvelles questions sont directement dérivées de douze corrigés Pré-Barreau 2026 : quatre épreuves estivales, quatre épreuves pré-estivales et quatre épreuves supplémentaires.

Le lot comprend :

- **107 QCM** à réponse unique ;
- **13 QRM** à réponses multiples ;
- **5 questions de niveau 1**, **73 de niveau 2** et **42 de niveau 3**.

Les questions portent prioritairement sur la qualification et l’application : droit d’agir, demandes incidentes, associations, compétence, moyens de défense, nullités, signification, mise en état, appel, mesure d’instruction in futurum, référés, expertise, modes amiables, postulation et procédures d’exécution.

Chaque question conserve une référence précise au corrigé et à la page utilisée. Le build vérifie que les **120 questions** sont présentes et qu’aucune n’est écartée par le filtre éditorial.

## Répartition des 691 questions retirées

| Matière | Questions en revue |
|---|---:|
| Procédure civile | 288 |
| Droit des contrats | 231 |
| Droit social | 63 |
| Responsabilité civile | 60 |
| Preuves | 25 |
| Procédures civiles d’exécution | 24 |

## Politique éditoriale appliquée

Sont retirées de l’entraînement :

- les questions demandant un numéro d’article, un alinéa, une page ou un emplacement dans le plan ;
- les questions demandant de réciter un mot ou une formulation exacte ;
- les exercices de comptage ou de repérage sans conséquence juridique.

Sont conservées :

- les conditions d’application d’une règle ;
- les effets juridiques, sanctions et exceptions ;
- la qualification de faits ;
- les distinctions entre régimes ;
- les délais, seuils et chiffres lorsqu’ils produisent une conséquence juridique ;
- les mini-cas et questions d’application.

## Traçabilité

Les questions retirées ne sont pas détruites. Le build génère séparément :

- `public/generated/questions.json` : banque utile publiée ;
- `public/generated/questions-editorial-review.json` : questions à réécrire ;
- `public/generated/quality-report.json` : bilan agrégé par catégorie et matière ;
- `public/generated/meta.json` : compteurs de contrôle, dont le nombre de questions issues des corrigés de procédure civile 2026.

Aucune question juridique nouvelle n’est générée automatiquement sans source. Toute question ajoutée doit rester fondée sur le cours ou le corrigé afin de ne pas inventer une règle, une exception ou un distracteur juridiquement ambigu.
