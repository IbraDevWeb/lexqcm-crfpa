# LexQCM CRFPA — Next.js V2

Cette branche transforme le prototype statique en application Next.js multi-utilisateur.

## Stack

- Next.js 16.2.11 (App Router)
- React 19.2.7
- Supabase Auth + PostgreSQL + Row Level Security
- PWA / Service Worker
- Vercel

## 1. Créer le projet Supabase

1. Créer un projet sur Supabase.
2. Ouvrir **SQL Editor**.
3. Copier/coller puis exécuter `supabase/schema.sql`.
4. Dans **Authentication > URL Configuration** :
   - Site URL local : `http://localhost:3000`
   - Ajouter l'URL Vercel dans les Redirect URLs : `https://TON-SITE.vercel.app/**`
5. Dans le panneau **Connect**, récupérer :
   - Project URL
   - Publishable key

## 2. Variables d'environnement

Créer `.env.local` en local :

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Ne jamais mettre de Secret Key Supabase dans une variable `NEXT_PUBLIC_*`.

## 3. Développement local

```bash
npm install
npm run dev
```

Le script `scripts/import-legacy.mjs` est exécuté automatiquement avant `dev` et `build`. Il parcourt le dossier `data/` de la V1 et génère :

- `public/generated/questions.json`
- `public/generated/cases.json`
- `public/generated/meta.json`

Ainsi la banque historique reste la source de contenu pendant la migration Next.js.

## 4. Déployer sur Vercel

1. Importer `IbraDevWeb/lexqcm-crfpa` dans Vercel.
2. **Framework Preset** : Next.js.
3. **Root Directory** : laisser vide (racine du dépôt).
4. Dans **Git > Production Branch**, sélectionner `next-v2` tant que la migration n'est pas fusionnée dans `main`.
5. Ajouter dans **Settings > Environment Variables** :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://TON-SITE.vercel.app`
6. Déployer.

## 5. Fonctionnalités déjà codées

- inscription par e-mail ;
- connexion / déconnexion ;
- confirmation e-mail ;
- mot de passe oublié ;
- routes protégées côté serveur ;
- profil personnel ;
- progression QCM synchronisée dans Supabase ;
- répétition espacée ;
- favoris ;
- historique des sessions ;
- statistiques par compte ;
- export/import JSON de la progression ;
- fonctionnement local hors connexion puis resynchronisation ;
- PWA installable ;
- import automatique de la banque de questions V1 ;
- RLS : chaque utilisateur ne peut lire/modifier que ses propres données.

## Sécurité

Toutes les tables personnelles utilisent Supabase RLS. La clé publique Supabase peut être utilisée côté navigateur parce qu'elle ne contourne pas ces règles. Ne jamais exposer une clé secrète/service-role dans le frontend.

## Avant mise en production définitive

Tester la branche `next-v2` sur un domaine Preview Vercel. Une fois validée, elle pourra être fusionnée dans `main` et GitHub Pages pourra être désactivé au profit du domaine Vercel.
