# Ciseo — gestion de salon de coiffure

Application Next.js 16 + Supabase PostgreSQL/Auth. Elle comprend une landing page, des comptes salon, les rôles propriétaire/manager/employé, prestations, équipe, horaires, absences, clients, agenda, réservations publiques, encaissements, dépenses et un espace super admin.

## Démarrage

Prérequis : Node.js 20.9+ et un projet Supabase. Ne transmettez jamais votre clé `service_role` à un client ou dans Git.

1. Créer un projet sur [Supabase](https://supabase.com/dashboard). Dans **SQL Editor**, exécuter le contenu de `supabase/migrations/0001_initial_schema.sql` une seule fois, sur une base neuve.
2. Dans **Authentication → URL Configuration**, définir l'URL du site (`http://localhost:7000` localement), puis ajouter `http://localhost:7000/**` aux URL de redirection. Activer l'authentification par e-mail. Pour les invitations d'équipe en production, configurer SMTP.
3. Copier `.env.example` vers `.env.local`, puis renseigner les trois variables Supabase depuis **Project Settings → API Keys** ainsi que `NEXT_PUBLIC_SITE_URL`. Utiliser la clé `service_role` uniquement dans `SUPABASE_SERVICE_ROLE_KEY`.
4. Exécuter :

```bash
npm install
npm run dev
```

5. Aller sur `http://localhost:7000/inscription`, créer son compte, valider l'e-mail si nécessaire, se connecter, puis créer le salon. Ajouter d'abord des prestations, puis un collaborateur en cochant ses prestations. La page `/reservation/<slug>` pourra ensuite proposer des créneaux.

## Super admin

Après la création d'un compte et d'un salon, récupérer l'identifiant du compte dans **Supabase → Authentication → Users**. Dans le SQL Editor :

```sql
insert into public.platform_admins(user_id)
values ('COLLER-ICI-L-UUID-DU-COMPTE');
```

Le menu **Administration** devient accessible. Seul un utilisateur présent dans cette table voit et modifie les statuts d'abonnement. Le statut est informatif dans cette version bêta : aucun prélèvement et aucune coupure automatique n'ont été implémentés.

## Sécurité et données

- Les tables exposées sont protégées par RLS. Les lectures des membres sont isolées par salon, et les données financières ne sont visibles qu'aux propriétaires et managers.
- Les écritures utilisent la clé serveur et revérifient le compte via `auth.getUser()`, le salon et le rôle à chaque action. La clé ne figure ni dans les composants navigateur, ni dans une variable `NEXT_PUBLIC_`.
- La réservation publique passe par `/api/public/bookings`. La fonction PostgreSQL enregistre client, rendez-vous et prestations dans la même transaction. Une contrainte GiST bloque le double booking concurrent.
- Les identifiants de salon sont présents dans les clés étrangères composites des relations sensibles pour empêcher des références croisées entre salons.
- Le service de créneaux n'expose pas les noms de clients ni leur numéro. Les contacts créés par réservation ont leurs consentements marketing à `false`.
- Le contrôle anti-abus comprend validation Zod, honeypot, limite PostgreSQL de 8 tentatives par heure et par empreinte IP/salon et, si configuré, Cloudflare Turnstile. Renseigner simultanément `NEXT_PUBLIC_TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY` pour activer Turnstile.

## Déploiement

Connecter le dépôt à Vercel ou un hébergeur compatible Next.js. Configurer les mêmes variables d'environnement côté hébergeur, en remplaçant `NEXT_PUBLIC_SITE_URL` par le domaine HTTPS public. Mettre à jour les URL autorisées de Supabase Auth. Déployer après avoir appliqué la migration SQL.

## Vérifications

```bash
npm run typecheck
npm run build
npm run test:db
```

`test:db` lance PostgreSQL embarqué, vérifie la migration, la réservation transactionnelle et l'isolation RLS entre deux salons. Son environnement embarqué ne contient pas l'extension `btree_gist`, donc le test ignore uniquement cette contrainte. Vérification complémentaire sur Supabase : créer deux salons, confirmer qu'un membre du salon A ne voit pas le salon B, puis tenter deux réservations simultanées au même horaire et confirmer qu'une seule est enregistrée.

## Périmètre de cette version

L'application est un MVP complet pour exploiter un salon en bêta. Les SMS/e-mails de rappel, les encaissements Stripe, les factures d'abonnement, le stock, la liste d'attente et la suppression/export RGPD automatisés restent des évolutions. Les paiements saisis ici sont des **enregistrements manuels**, pas des paiements carte intégrés. Le solde affiché est une estimation des encaissements moins les dépenses saisies, avant produits, charges et impôts ; ce n'est pas un résultat comptable.

Le fuseau du salon est pris en compte pour l'affichage et la réservation. Les heures locales inexistantes au passage à l'heure d'été sont refusées. Le projet n'inclut ni identifiants Supabase ni données de production : ils doivent être fournis dans `.env.local`.
