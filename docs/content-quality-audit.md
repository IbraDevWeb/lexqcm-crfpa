# Audit éditorial de la banque QCM

Date de l’audit : 28 juillet 2026.

## Résultat

- Banque source analysée : **2 349 questions**.
- Questions conservées dans l’entraînement : **1 658 questions**.
- Questions retirées et placées en revue éditoriale : **691 questions**, soit **29,4 %** de la banque source.
- Dossiers progressifs conservés : **42**, dont **40 corrigés** et **2 sujets sans corrigé**.

Les 691 questions retirées correspondent au même défaut éditorial principal : elles demandent de retrouver un numéro d’article ou une référence documentaire, souvent avec des choix composés uniquement de numéros d’articles. Elles ne sont plus proposées dans les séries rapides, les entraînements sur mesure, les révisions adaptatives ou les examens blancs.

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
- `public/generated/quality-report.json` : bilan agrégé par catégorie et matière.

Aucune question juridique nouvelle n’est générée automatiquement pour remplacer ces éléments : une réécriture doit rester fondée sur le cours ou le corrigé source afin de ne pas inventer une règle, une exception ou un distracteur juridiquement ambigu.
