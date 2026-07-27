# LexQCM CRFPA — Next.js V2

Cette branche transforme le prototype statique en application Next.js multi-utilisateur, prévue pour Vercel + Supabase.

## État validé

Le CI GitHub vérifie l'installation, l'import de la banque V1, TypeScript et le build Next.js. La migration détecte actuellement :

- 2 349 QCM/QRM actifs ;
- 42 dossiers importés ;
- 40 dossiers corrigés ;
- 2 sujets en attente de corrigé.

## Stack

- Next.js 16.2.11 (App Router)
- React 19.2.7
- Supabase Auth + PostgreSQL + Row Level Security
- PWA / Service Worker
- Vercel

## 1. Créer le projet Supabase

1. Créer un projet sur Supabase.
2. Ouvrir **SQL Editor**.
3. Copier/coller puis exécuter `supabase/schema.sql` une fois.
4. Dans **Authentication > URL Configuration** :
   - pour les tests locaux, autoriser `http://localhost:3000/**` ;
   - après le premier déploiement Vercel, ajouter `https://TON-SITE.vercel.app/**` aux Redirect URLs ;
   - mettre l'URL Vercel définitive comme Site URL lorsque l'application devient la version principale.
5. Dans le panneau **Connect**, récupérer :
   - Project URL ;
   - Publishable key.

## 2. Variables d'environnement

Créer `.env.local` en local :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Ne jamais mettre de Secret Key ou de clé `service_role` Supabase dans une variable `NEXT_PUBLIC_*`.

## 3. Développement local

```bash
npm install
npm run dev
```

Le script `scripts/import-legacy-v2.mjs` est exécuté automatiquement avant `dev` et `build`. Il compare les banques présentes dans `data/` et dans l'ancien `index.html`, conserve la version la plus complète et génère :

- `public/generated/questions.json`
- `public/generated/cases.json`
- `public/generated/meta.json`

Ainsi, les 2 349 questions et les 42 dossiers de la V1 restent la source de contenu pendant la migration Next.js.

## 4. Déployer sur Vercel

1. Sur Vercel, **Add New > Project** puis importer `IbraDevWeb/lexqcm-crfpa`.
2. **Framework Preset** : Next.js.
3. **Root Directory** : laisser vide, l'application Next.js est à la racine de `next-v2`.
4. Pour conserver GitHub Pages intact pendant les tests : configurer `next-v2` comme branche de production Vercel, ou laisser `main` en production et utiliser `next-v2` comme Preview jusqu'à validation.
5. Ajouter dans **Settings > Environment Variables** :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://TON-SITE.vercel.app`
6. Déployer.
7. Une fois l'URL Vercel connue, la reporter dans les Redirect URLs de Supabase Auth.
8. Tester création de compte, confirmation e-mail, connexion, série QCM, dossier progressif, déconnexion et reconnexion sur un autre appareil.

## 5. Fonctionnalités déjà codées

- inscription par e-mail ;
- connexion / déconnexion ;
- confirmation e-mail ;
- mot de passe oublié et changement de mot de passe ;
- routes protégées côté serveur ;
- profil personnel ;
- progression QCM synchronisée dans Supabase ;
- répétition espacée ;
- favoris ;
- historique des sessions ;
- statistiques personnelles ;
- export/import JSON de la progression ;
- mode hors connexion avec resynchronisation ;
- PWA installable ;
- dossiers progressifs ;
- import automatique et contrôlé de toute la banque V1 ;
- RLS : chaque utilisateur ne peut lire/modifier que ses propres données.

## Sécurité

Toutes les tables personnelles utilisent Supabase RLS. La clé **Publishable** est conçue pour être utilisée par le client lorsqu'elle est associée à des politiques RLS correctes. Ne jamais exposer une Secret Key ou une clé `service_role` dans le frontend.

## Avant mise en production définitive

La branche `main` continue de servir le site GitHub Pages actuel. La migration est volontairement isolée dans `next-v2` et dans la Pull Request #1. Tester d'abord un déploiement Vercel de cette branche. Après validation, la PR pourra être fusionnée et le domaine principal déplacé vers Vercel.
