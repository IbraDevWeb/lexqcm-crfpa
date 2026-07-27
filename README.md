# LexQCM CRFPA — PWA

Cette version transforme LexQCM en Progressive Web App installable et utilisable hors connexion après une première ouverture en ligne.

## Mise en ligne GitHub Pages

Remplace le contenu du dépôt par ces fichiers puis :

```powershell
git add .
git commit -m "Add complete PWA and offline mode"
git push
```

GitHub Pages redéploie automatiquement le site.

## Installation mobile

- **Android / Chrome, Edge, Samsung Internet** : ouvrir le site et utiliser le bouton « Installer » proposé par LexQCM ou le menu du navigateur.
- **iPhone / iPad (Safari)** : Partager → « Sur l’écran d’accueil ».
- Après installation, ouvrir l’app une première fois avec Internet et attendre l’indicateur « Hors-ligne prêt ».

## Fonctionnement hors ligne

Le service worker `sw.js` précharge l’application, le manifeste et les icônes. Comme la banque est embarquée dans `index.html`, les QCM et dossiers restent disponibles sans réseau. La progression continue d’être stockée localement sur l’appareil.
