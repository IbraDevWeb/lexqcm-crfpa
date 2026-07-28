# Socle éditorial de la banque QCM

Date de remise à zéro : 28 juillet 2026.

## Base actuelle

La banque QCM a été entièrement remise à zéro. Elle contient désormais exclusivement :

- **120 questions de procédure civile** ;
- **107 QCM** à réponse unique ;
- **13 QRM** à réponses multiples ;
- **0 ancienne question legacy** ;
- **0 question en attente de réécriture dans la banque active**.

Les 120 questions sont directement dérivées de douze corrigés Pré-Barreau 2026 : quatre épreuves estivales, quatre épreuves pré-estivales et quatre épreuves supplémentaires.

Les anciens QCM provenant des fascicules, drills et générateurs précédents ne sont plus lus, fusionnés, comptés ou publiés. Le fichier source principal de l'ancienne banque a été supprimé de la branche `next-v2`.

## Contenu du socle procédure civile

Le lot couvre prioritairement :

- le droit et la qualité à agir ;
- les demandes reconventionnelles et interventions ;
- les actions exercées par les associations ;
- la compétence d'attribution et territoriale ;
- les clauses attributives de compétence ;
- les défenses au fond, exceptions de procédure et fins de non-recevoir ;
- les nullités de forme et de fond ;
- la signification et la représentation ;
- le juge de la mise en état ;
- l'appel et les recours contre les décisions sur la compétence ;
- les mesures d'instruction avant procès ;
- les référés et l'expertise judiciaire ;
- les modes amiables ;
- certaines procédures civiles d'exécution abordées dans les corrigés.

Chaque question conserve une référence précise au corrigé et à la page utilisée.

## Règles de contrôle

À chaque développement et déploiement, le build vérifie automatiquement que :

1. la banque contient exactement **120 questions** ;
2. tous les identifiants commencent par `PC26-CORR-` ;
3. toutes les questions appartiennent à la matière `Procédure civile` ;
4. aucun identifiant n'est dupliqué ;
5. aucune question n'est rejetée par le filtre éditorial ;
6. les métadonnées indiquent explicitement qu'aucune banque QCM legacy n'est importée.

Une future matière sera ajoutée sous la forme d'un nouveau lot éditorial indépendant, construit à partir des cours ou corrigés transmis et soumis aux mêmes contrôles avant publication.
