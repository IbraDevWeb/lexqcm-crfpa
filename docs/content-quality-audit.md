# Socle éditorial de la banque QCM

Date de remise à zéro : 28 juillet 2026.
Dernière extension : droit social 2026.

## Base actuelle

La banque QCM a été entièrement reconstruite. Elle contient exclusivement :

- **120 questions de procédure civile** ;
- **120 questions de droit des obligations** ;
- **120 questions de droit social** ;
- **360 questions actives au total** ;
- **0 ancienne question legacy** ;
- **0 question en attente de réécriture dans la banque active**.

Les lots de procédure civile et d’obligations sont construits à partir des corrigés Pré-Barreau 2026 transmis. Le lot de droit social est construit à partir de huit corrigés Pré-Barreau 2026 et de quatre corrigés Objectif Barreau 2026.

Les anciens QCM provenant des fascicules, drills et générateurs précédents ne sont plus lus, fusionnés, comptés ou publiés.

## Contenu du socle procédure civile

Le lot couvre notamment :

- le droit et la qualité à agir ;
- les demandes reconventionnelles et interventions ;
- les actions exercées par les associations ;
- la compétence d’attribution et territoriale ;
- les moyens de défense et les nullités ;
- la signification, la représentation et la mise en état ;
- l’appel, les référés, l’expertise et les modes amiables.

## Contenu du socle droit des obligations

Le lot couvre notamment :

- la preuve des actes juridiques, du paiement et du prêt ;
- la preuve électronique, les copies et le commencement de preuve par écrit ;
- l’offre, l’acceptation, les promesses et le pacte de préférence ;
- les conditions, les pourparlers et la confidentialité ;
- l’erreur, le dol, la violence, l’insanité d’esprit et l’abus de dépendance ;
- le contenu licite, la contrepartie illusoire, la lésion et les clauses réputées non écrites ;
- la nullité, les restitutions et la caducité des ensembles contractuels ;
- l’inexécution, l’exécution forcée, la résolution et la responsabilité contractuelle ;
- le porte-fort, la solidarité, la cession de créance et la subrogation ;
- la responsabilité du fait d’autrui, des choses, des produits défectueux et des accidents de la circulation.

## Contenu du socle droit social

Le lot couvre notamment :

- la qualification et l’exécution du contrat de travail ;
- les périodes d’essai et probatoires, les objectifs et l’insuffisance professionnelle ;
- la discipline, la vie personnelle, la preuve et les enquêtes internes ;
- les ruptures conventionnelles, clauses de non-concurrence et licenciements ;
- l’inaptitude, le reclassement, les licenciements économiques et la grossesse ;
- le harcèlement, l’obligation de sécurité, le télétravail et le temps de travail ;
- les accidents du travail, la faute inexcusable et le régime social des indemnités ;
- les élections professionnelles et l’articulation des CSE ;
- la représentativité, les droits syndicaux et la négociation collective ;
- la mobilité, la neutralité religieuse, l’égalité de traitement et les accords collectifs.

Chaque question conserve une référence précise au corrigé et à la page utilisée.

## Règles de contrôle

À chaque développement et déploiement, le build vérifie automatiquement que :

1. la banque contient exactement **360 questions** ;
2. le lot `PC26-CORR-` contient exactement 120 questions de `Procédure civile` ;
3. le lot `OB26-CORR-` contient exactement 120 questions de `Droit des obligations` ;
4. le lot `DS26-CORR-` contient exactement 120 questions de `Droit social` ;
5. aucun identifiant n’est dupliqué ;
6. aucune question n’est rejetée par le filtre éditorial ;
7. aucune source QCM legacy n’est importée ;
8. les dossiers progressifs restent conservés séparément.

Les futures matières seront ajoutées sous la forme de nouveaux lots éditoriaux indépendants, soumis aux mêmes contrôles avant publication.
