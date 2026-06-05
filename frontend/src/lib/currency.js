// ── Devise : Franc Congolais (CDF / FC) ──────────────────────────────────────
// Taux indicatif : 1 USD ≈ 2 800 FC  (à ajuster selon le cours du marché)
export const USD_TO_CDF = 2800;

/**
 * Convertit un montant USD en CDF (nombre entier).
 */
export function toCDF(usd) {
  if (usd == null || usd === '') return 0;
  return Math.round(parseFloat(usd) * USD_TO_CDF);
}

/**
 * Formate un montant USD en chaîne CDF lisible, ex: "5 600 FC"
 */
export function formatCDF(usd) {
  if (usd == null || usd === '') return '0 FC';
  const amount = Math.round(parseFloat(usd) * USD_TO_CDF);
  return `${amount.toLocaleString('fr-FR')} FC`;
}

/**
 * Format compact pour les petits espaces, ex: "5 600 FC", "224K FC", "1,2M FC"
 */
export function abbreviateCDF(usd) {
  if (usd == null || usd === '') return '0 FC';
  const amount = Math.round(parseFloat(usd) * USD_TO_CDF);
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace('.', ',')}M FC`;
  if (amount >= 10_000)    return `${Math.round(amount / 1_000)}K FC`;
  return `${amount.toLocaleString('fr-FR')} FC`;
}

export default formatCDF;
