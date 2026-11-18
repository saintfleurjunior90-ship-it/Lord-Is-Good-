/**
 * Calcul des montants — code PARTAGÉ entre le navigateur (affichage)
 * et le serveur (calcul qui fait foi, avant d'envoyer à Stripe).
 * Tous les montants sont calculés en CENTIMES (entiers) pour éviter les erreurs d'arrondi.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KOK_PRICING = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function toCents(dollars) {
    return Math.round(Number(dollars) * 100);
  }

  /**
   * @param {object} config  CONFIG (config.js)
   * @param {Array<{id:string, qty:number}>} items  identifiants + quantités uniquement
   * @param {"delivery"|"pickup"} fulfillment
   * @returns {{ok:boolean, errors:string[], lines:Array, subtotalCents:number,
   *            shippingCents:number, freeShipping:boolean, taxCents:number, totalCents:number}}
   */
  function computeTotals(config, items, fulfillment) {
    var errors = [];
    var max = config.shipping.maxQuantityPerProduct || 99;
    var byId = {};
    config.products.forEach(function (p) { byId[p.id] = p; });

    var merged = {};
    (Array.isArray(items) ? items : []).forEach(function (it) {
      if (!it || typeof it.id !== "string" || !byId[it.id]) { errors.push("unknown_product"); return; }
      var q = Number(it.qty);
      if (!Number.isInteger(q) || q < 0) { errors.push("bad_quantity"); return; }
      merged[it.id] = (merged[it.id] || 0) + q;
    });

    var lines = [];
    config.products.forEach(function (p) {
      var q = merged[p.id] || 0;
      if (!q) return;
      if (q > max) { errors.push("quantity_too_high"); q = max; }
      var unit = toCents(p.price);
      lines.push({ id: p.id, qty: q, unitCents: unit, totalCents: unit * q, pieces: p.pieces });
    });
    if (!lines.length) errors.push("empty_cart");

    var subtotal = lines.reduce(function (s, l) { return s + l.totalCents; }, 0);

    var isPickup = fulfillment === "pickup";
    if (fulfillment !== "pickup" && fulfillment !== "delivery") errors.push("bad_fulfillment");
    if (isPickup && !config.shipping.pickupEnabled) errors.push("pickup_disabled");

    // TODO (À CONFIRMER) — règle de livraison gratuite : voir config.shipping.
    var hasFreeShipItem = lines.some(function (l) { return byId[l.id].freeShipping; });
    var freeShipping = !!(config.shipping.freeIfAnyFreeShippingProduct && hasFreeShipItem);
    var shipping = 0;
    if (!isPickup && lines.length && !freeShipping) shipping = toCents(config.shipping.flatFee);

    var tax = 0;
    var t = config.tax || { mode: "none" };
    if (t.mode === "rate" && t.rate > 0) {
      tax = Math.round((subtotal + (t.appliesToShipping ? shipping : 0)) * t.rate);
    }
    // mode "stripe_tax" : la taxe est calculée par Stripe au moment du paiement (pas ici).

    return {
      ok: errors.length === 0,
      errors: errors,
      lines: lines,
      subtotalCents: subtotal,
      shippingCents: shipping,
      freeShipping: !isPickup && freeShipping,
      pickup: isPickup,
      taxCents: tax,
      taxPending: t.mode === "stripe_tax",
      totalCents: subtotal + shipping + tax,
    };
  }

  // Format « $6.99 » dans les trois langues (comme le site d'origine, prix en USD).
  function formatMoney(cents) {
    return "$" + (cents / 100).toFixed(2);
  }

  return { computeTotals: computeTotals, toCents: toCents, formatMoney: formatMoney };
});
