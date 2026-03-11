# Audit de conformité Built for Shopify — ShopPulseAi

> **Objectif** : S'assurer que l'app respecte tous les critères **App Store Shopify** (prérequis) et **Built for Shopify** avant de poursuivre le déploiement Railway et la configuration Shopify Partners.

---

## Résumé exécutif

| Statut | Description |
|--------|-------------|
| ✅ | Conforme — pas d'action requise |
| ⚠️ | À vérifier manuellement ou à améliorer |
| ❌ | Non conforme — correction nécessaire |

---

## 1. PRÉREQUIS BUILT FOR SHOPIFY

### 1.1 Exigences App Store (obligatoires pour BFS)

| Exigence | Statut | Détails |
|----------|--------|---------|
| 1.1.1 Session tokens | ✅ | `unstable_newEmbeddedAuthStrategy: true` dans shopify.server.ts — compatible mode incognito / sans cookies tiers |
| 1.1.2 Checkout Shopify | ✅ | Pas de bypass checkout |
| 1.2.1 Billing API | ✅ | Utilise `appSubscriptionCreate` GraphQL (plans.server.ts) |
| 1.2.3 Changement de plan | ✅ | Page billing permet upgrade/downgrade sans réinstaller |
| 2.2.2 Expérience embedded | ✅ | App embedded, UI dans l'admin |
| 2.2.3 App Bridge dernière version | ✅ | `@shopify/app-bridge-react` ^4.1.2 + `shopify-app-remix` gère app-bridge.js |
| 2.2.4 GraphQL Admin API | ✅ | 100% GraphQL (aucun `admin.rest`) — conforme Avril 2025 |
| 2.3.1 Installation depuis Shopify | ⚠️ | Route `/auth/login` demande le domaine manuellement — **utilisée uniquement en dev** ; en production l'OAuth est déclenché par Shopify |
| 2.3.2 Auth immédiate après install | ✅ | `authenticate.admin(request)` sur toutes les routes app |
| 3.1.1 TLS/HTTPS | ✅ | Railway fournit HTTPS |
| 3.2 Scopes | ✅ | `read_products, read_orders, read_themes, read_content, read_discounts, read_price_rules` — justifiés |

### 1.2 Utilité marchand (critères BFS — après lancement)

| Critère | Statut | Détails |
|---------|--------|---------|
| 50 installs nettes (boutiques payantes) | ⏳ | À atteindre après lancement |
| 5 avis minimum | ⏳ | À atteindre après lancement |
| Note minimale | ⏳ | À maintenir après lancement |

---

## 2. FONCTIONNALITÉ & SÉCURITÉ

| Exigence | Statut | Détails |
|----------|--------|---------|
| Webhooks GDPR | ✅ | `customers/data_request`, `customers/redact`, `shop/redact` + `app/uninstalled` |
| Purge à la désinstallation | ✅ | Suppression sessions + `isActive: false` + `uninstalledAt` |
| Session storage sécurisé | ✅ | Prisma + PostgreSQL |
| Pas de scripts externes non approuvés | ✅ | Polaris, CDN Shopify (fonts), App Bridge uniquement |
| Pas de Google Fonts | ✅ | `cdn.shopify.com` pour Inter |
| Pas de `dangerouslySetInnerHTML` (contenu utilisateur) | ✅ | `AiInsightsRenderer` pour le markdown IA ; `report.$slug` utilise `dangerouslySetInnerHTML` pour **CSS statique** uniquement (pas de risque XSS) |
| Rate limiting API publiques | ✅ | `/report/:slug` et `/api/analysis/:id` limités |
| Pages légales | ✅ | `/privacy` et `/support` |

---

## 3. INTÉGRATION & DESIGN (Built for Shopify)

| Exigence | Statut | Détails |
|----------|--------|---------|
| 3.1.1 Embedded dans l'admin | ✅ | `embedded: true`, AppProvider `isEmbeddedApp` |
| 3.1.2 Workflows dans Shopify | ✅ | Analyse, rapports, billing — tout dans l'admin |
| 3.1.3 Sign up fluide | ✅ | OAuth Shopify, pas de formulaire supplémentaire en prod |
| 4.1.1 UX cohérente | ✅ | Polaris 13, Cards, boutons standards |
| 4.1.2 Mobile-friendly | ✅ | Polaris responsive |
| 4.1.4 Nav menu App Bridge | ✅ | `ui-nav-menu` (équivalent s-app-nav) avec Link rel="home" |

---

## 4. PERFORMANCE (Built for Shopify)

| Métrique | Cible 75e percentile | Statut |
|----------|----------------------|--------|
| LCP | ≤ 2,5 s | ⚠️ À mesurer après mise en production (min. 100 appels / 28 j) |
| CLS | ≤ 0,1 | ⚠️ À mesurer |
| INP | ≤ 200 ms | ⚠️ À mesurer |

> **Note** : L’utilisation de la dernière version d’App Bridge permet à Shopify de collecter les Web Vitals. Les seuils sont évalués après 28 jours de trafic.

---

## 5. POINTS D’ATTENTION

### 5.1 Route login (`auth.login`)

La route `/auth/login` demande la saisie manuelle du domaine. En production, l’installation passe par l’App Store → OAuth → redirection vers l’app. Cette route sert surtout au développement. Vérifier que le flux OAuth ne renvoie pas les marchands vers cette page de login manuel.

### 5.2 `dangerouslySetInnerHTML` dans `report.$slug.tsx`

- Utilisation limitée à du **CSS statique** (pas de contenu utilisateur).
- Risque XSS négligeable.
- Si vous voulez éviter tout signalement par les revues, vous pouvez déplacer le CSS dans un fichier `.css` importé.

### 5.3 SEO Optimizer et Asset API

L’app SEO Optimizer peut lire les fichiers de thème (analyse meta, H1/H2, etc.). Les apps SEO sont explicitement autorisées à **lire** via l’Asset API ; l’écriture est limitée aux cas prévus par Shopify.

### 5.4 Configuration avant soumission

- Remplacer `YOUR_CLIENT_ID` et `your-app-url` dans `shopify.app.toml` par les vraies valeurs.
- Configurer `privacy_policy` et `support_url` dans le Dashboard Partners.
- Ajouter une icône d’app identique entre Dev Dashboard et App Store listing.

---

## 6. CHECKLIST FINALE AVANT SOUMISSION

- [ ] Déploiement Railway opérationnel
- [ ] Variables d’environnement configurées (DATABASE_URL, clés Shopify, etc.)
- [ ] `shopify.app.toml` mis à jour avec Client ID et URL réelles
- [ ] URLs de redirection OAuth configurées dans Partners
- [ ] Webhooks enregistrés (App Store + GDPR)
- [ ] Icône d’app uploadée (Dev Dashboard = App Store)
- [ ] Politique de confidentialité accessible sur `/privacy`
- [ ] Page support accessible sur `/support`
- [ ] Tests manuels : installation, OAuth, analyse, billing, désinstallation
- [ ] Fiche App Store : screenshots, description, vidéo (optionnel)

---

## Conclusion

**L’app est structurellement conforme** aux exigences App Store et Built for Shopify du point de vue technique. Les éléments marqués ⚠️ concernent surtout des vérifications post-lancement (performance, flux OAuth en production) et des réglages de configuration.

Vous pouvez poursuivre avec les étapes Railway et Shopify Partners en suivant le `DEPLOY.md`, puis compléter les tests et la configuration de la fiche App Store avant la soumission.
