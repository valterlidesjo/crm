# Plan: Produktkategorier för bättre Google Ads

**Mål:** Lägga till en kategoristruktur som (1) sätts på produkterna i Shopify, (2) flödar igenom till Google Merchant Center / Google Ads, och (3) synkas in i CRM:ets databasstruktur så att befintliga produkter migreras.

**Vald modell:** Shopify `product_type` är sanningskälla. CRM får ett nytt `productType`-fält som syncas in från Shopify. (Plan godkänns först — koden implementeras i ett separat steg.)

---

## 1. Varför `product_type` (och inte bara kollektioner)

Bilden visar Shopify-**kollektioner** (`/collections/runda-speglar`, `/collections/rektangulara-speglar`, `anti-fog`). De är bra för butiksnavigation, men de driver inte Google Shopping-flödet. Google läser i stället två produktattribut:

- **`product_type`** — *din egen* fritt valda hierarki, t.ex. `Speglar > Runda speglar`. Påverkar inte direkt vad Google tror produkten är, men är det fält du segmenterar dina Shopping-/Performance Max-kampanjer på (asset groups, listing groups, budstyrning). Detta är det viktigaste fältet att få rätt och konsekvent.
- **`google_product_category`** — Googles *fasta* taxonomi. För speglar är rätt värde **`Home & Garden > Decor > Mirrors` (id `595`)**. Det styr policy, jämförelser och relevans.

Kollektionerna kan finnas kvar parallellt för navigation, men kategoriseringen för Google bör hänga på `product_type`. En extra fördel: när `product_type` är satt blir det trivialt att auto-mappa till rätt `google_product_category` med en regel i Merchant Center.

GTIN finns redan på artiklarna (`gtin`-fältet används i CDON-syncen), vilket är ett stort plus — det är ofta det som saknas och blockerar flöden.

### Föreslagen kategoriträd (utgå från bilden)

```
Speglar > Runda speglar
Speglar > Rektangulära speglar
Speglar > Anti-fog speglar      (alternativt: en tag/feature "anti-fog" + bredare typ)
Speglar > LED-speglar           (om relevant – bilden nämner LED genomgående)
```

Notera: "anti-fog" i bilden föreslogs som *filter/feature* snarare än egen kollektion. Rekommendation: lägg anti-fog som en **tag** (custom label / feature), och låt `product_type` beskriva *formen* (rund/rektangulär). Då kan en spegel vara både "rektangulär" och "anti-fog" utan att kategoriträdet spräcks. Custom labels i Google Ads kan sedan byggas på taggar.

---

## 2. Steg i Shopify (manuellt, källan)

Detta görs per butik (en per kompis). För varje produkt:

1. Sätt **Product type** (Produkttyp) till din hierarki, t.ex. `Speglar > Runda speglar`. Detta blir `product_type` i flödet.
2. Sätt **Category** (Shopifys standardkategori, den nya taxonomin) till *Mirrors* — Shopify mappar då automatiskt till Google `595` i de flesta flödesappar.
3. Lägg ev. egenskaper som **tags**: `anti-fog`, `led`, `dimbar`, storlek osv. (används som custom labels).
4. Behåll kollektionerna (runda-speglar m.fl.) för navigation — de skadar inte flödet.

Tips: gör detta konsekvent och stavningsidentiskt (mellanslag runt `>`), eftersom CRM kommer parsa strängen rakt av.

---

## 3. Steg i Google Merchant Center / Google Ads

1. Säkerställ att flödet (Shopify ↔ Google-kanalen eller en feed-app) skickar med `product_type` och `google_product_category`.
2. Lägg en feed-regel: om `google_product_category` saknas → sätt `595` (Mirrors) som default. (CDON-syncen använder redan en default-kategori `1586` "Badrumsspeglar" — samma princip.)
3. I Performance Max / Shopping: bygg **asset groups / listing groups på `product_type`** så varje kategori kan få egen budget och bilder.
4. Lägg custom labels från taggar (`anti-fog`, `led`) för budstyrning på egenskap.

---

## 4. Ändringar i CRM-databasen

### 4.1 Schema — `packages/shared/src/schemas/product.ts`

Lägg till två valfria fält på `Product`:

```ts
  // ─── Kategorisering (källa: Shopify product_type) ───
  /** Shopify product_type, rå hierarkisträng, t.ex. "Speglar > Runda speglar". */
  productType: Schema.optional(Schema.String),
  /** Googles taxonomi-id, t.ex. "595" (Home & Garden > Decor > Mirrors). */
  googleProductCategory: Schema.optional(Schema.String),
```

(Alternativt en strukturerad `category: { path: string[]; googleId?: string }` — men en rå sträng matchar Shopify 1:1 och är enklast att migrera. Rekommendation: börja med strängen.)

Uppdatera även domändokumentationen i `CONTEXT.md` (Product-stycket) så fälten är beskrivna.

### 4.2 Shopify-sync — hämta `productType`

Två ställen läser Shopify-produkter och måste utökas:

**a) `packages/functions/src/shopify/sync-products.ts`** (full re-sync, GraphQL)
- Lägg `productType` i `PRODUCTS_QUERY` (fältet heter `productType` i Admin GraphQL).
- Lägg `productType` i `ShopifyProductNode`-interfacet.
- Skriv in det i `baseFields`: `...(shopifyProduct.productType && { productType: shopifyProduct.productType })`.

**b) `packages/functions/src/shopify/webhook-topics.ts`** (löpande, `products/create` + `products/update` via REST-payload)
- Lägg `product_type?: string` i `ShopifyProductPayload`.
- Skriv in `...(payload.product_type && { productType: payload.product_type })` i `fields` i `upsertArticlesFromProduct`.

Valfritt: härled `googleProductCategory` automatiskt — om `productType` börjar på "Speglar" → sätt `"595"`. En liten mappningstabell i `packages/shared` kan återanvändas av både sync och migrering.

### 4.3 CRM-UI — `packages/web/src/features/inventory/`
- `edit-product-dialog.tsx` och `add-product-dialog.tsx`: lägg ett "Produkttyp/Kategori"-fält (i18n-nyckel, både `en` och `sv` enligt CLAUDE.md — aldrig hårdkodad text).
- `product-list.tsx`: visa kategorin som kolumn/badge, ev. gruppering.
- Lägg översättningsnycklar i `packages/web/src/i18n/locales/{en,sv}/inventory.json`.

---

## 5. Migrering av befintliga produkter

Mönster: skripten i `scripts/` (t.ex. `sync-skus.mjs`, `migrate-split-variants.mjs`) använder `firebase-admin` mot `/partners/{PARTNER_ID}/products/`, kör **`--dry-run` som standard** och `--live` för skarpt. Nytt skript `scripts/backfill-product-type.mjs` följer samma mönster:

1. **Bästa vägen:** kör en full Shopify-resync (`syncShopifyProducts`) *efter* att `product_type` satts i Shopify och syncen utökats (4.2). Då fylls `productType` i på alla artiklar automatiskt — ingen separat migrering behövs.
2. **Backfill-skript** som fallback / för produkter utan Shopify-koppling:
   - Läs alla produkter, gruppera på `groupTitle`.
   - Mappa till `productType` via en regeltabell (t.ex. titel/handle innehåller "rund" → `Speglar > Runda speglar`; "rektangul" → `Speglar > Rektangulära speglar`; "anti-fog"/"imma" → tagga anti-fog).
   - Sätt `googleProductCategory: "595"` för alla speglar.
   - Logga förslag i dry-run, skriv vid `--live`.
3. Lägg `npm`-script i `package.json` (`"backfill:product-type": "node scripts/backfill-product-type.mjs"`), i linje med befintliga migrate-script.

Obs partner-id: CONTEXT.md säger `valter`, men `sync-cdon.mjs` kör mot `hemdeal-ab`. Bekräfta vilket/vilka partner-id som gäller per butik innan migrering körs.

---

## 6. Ordning att genomföra

1. Schema-fält + CONTEXT-dok (4.1).
2. Utöka sync (4.2) — deploya functions.
3. Sätt `product_type` + Category i Shopify per butik (avsnitt 2).
4. Kör full resync → `productType` fylls i CRM automatiskt.
5. (Vid behov) backfill-skript för icke-Shopify-produkter (avsnitt 5).
6. CRM-UI-fält (4.3).
7. Merchant Center: feed-regler + kampanjsegmentering på `product_type` (avsnitt 3).

---

## 7. Öppna frågor att bekräfta

- Vilka partner-id gäller (en per kompis)? `valter` vs `hemdeal-ab`.
- Ska anti-fog vara egen `product_type` eller en tag/feature? (Rekommendation: tag.)
- Vill du ha `googleProductCategory` lagrat i CRM eller bara satt via Merchant Center-regel? (Rekommendation: lagra det — billigt och gör flödet robust.)
- Säljer butikerna *bara* speglar, eller behövs fler grenar än "Speglar > …"?
