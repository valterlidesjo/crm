// Shared SKU/GTIN mapping for the CDON marketplace.
//
// Single source of truth, imported by:
//   - scripts/sync-cdon.mjs        (pushes articles to CDON)
//   - scripts/sync-skus.mjs        (writes sku/gtin onto CRM article docs)
//
// SKU_MAP matches on (brand keyword in the article/group title) + (normalised
// size). Size normalisation strips "cm"/whitespace and sorts the two dimensions
// ascending, so "80x60", "60x80" and "60 x 80 cm" all match the same row.

export const SKU_MAP = [
  { brand: 'Franklin', size: '50x70',   sku: '100-10-10', gtin: '07350184770002', weightKg: 4.8 },
  { brand: 'Franklin', size: '60x80',   sku: '100-10-11', gtin: '07350184770019', weightKg: 7.1 },
  { brand: 'Luigi',    size: '40x40',   sku: '100-10-12', gtin: '07350184770026', weightKg: 1.0 },
  { brand: 'Luigi',    size: '60x60',   sku: '100-10-13', gtin: '07350184770033', weightKg: 4.0 },
  { brand: 'Luigi',    size: '80x80',   sku: '100-10-14', gtin: '07350184770040', weightKg: 8.2 },
  { brand: 'Luigi',    size: '100x100', sku: '100-10-15', gtin: '07350184770057', weightKg: 13.7 },
  { brand: 'Dante',    size: '60x60',   sku: '100-10-16', gtin: '07350184770064', weightKg: 4.0 },
  { brand: 'Dante',    size: '80x80',   sku: '100-10-17', gtin: '07350184770071', weightKg: 8.2 },
  { brand: 'Halo',     size: '50x70',   sku: '100-10-18', gtin: '07350184770088', weightKg: 4.8 },
  { brand: 'Halo',     size: '60x80',   sku: '100-10-19', gtin: '07350184770095', weightKg: 7.1 },
  { brand: 'Carmen',   size: '60x150',  sku: '100-10-20', gtin: '07350184770101', weightKg: 9.3 },
  { brand: 'Carmen',   size: '50x120',  sku: '100-10-21', gtin: '07350184770118', weightKg: 14.7 },
];

export function normalizeSize(s) {
  if (!s) return '';
  const cleaned = String(s).toLowerCase().replace(/cm/g, '').replace(/\s+/g, '');
  const parts = cleaned.split('x').map((n) => parseInt(n, 10)).filter((n) => !isNaN(n));
  if (parts.length !== 2) return cleaned;
  parts.sort((a, b) => a - b);
  return `${parts[0]}x${parts[1]}`;
}

export function lookupSkuGtin(brandTitle, variantSize) {
  const pt = (brandTitle || '').toLowerCase();
  const vs = normalizeSize(variantSize);
  return SKU_MAP.find(
    (m) => pt.includes(m.brand.toLowerCase()) && normalizeSize(m.size) === vs,
  );
}
