/**
 * KOKIYOL Ayisyen — CONFIGURATION CENTRALE
 * ==========================================
 * C'est LE fichier à modifier pour changer les prix, la livraison, les moyens
 * de paiement manuels, les coordonnées et la taxe.
 *
 * Ce fichier est PUBLIC (il est envoyé au navigateur pour l'affichage).
 * → N'y mettez JAMAIS de clé secrète (Stripe, mot de passe admin, clé e-mail) :
 *   celles-ci vont uniquement dans le fichier .env côté serveur.
 *
 * Le serveur relit ce même fichier pour RECALCULER tous les prix :
 * les prix envoyés par le navigateur ne sont jamais utilisés.
 *
 * Montants en dollars US (USD). Recherchez « TODO » pour ce qui reste à confirmer.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KOK_CONFIG = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CONFIG = {
    currency: "usd",

    business: {
      brand: "KOKIYOL Ayisyen",
      brandFull: "KOKIYOL Ayisyen – Authentic Haitian Donuts",
      soldBy: "Lord Is Good Donuts",
      sellerMotto: "Sharing Haitian Sweetness, One Bite at a Time.",
      slogan: "A Taste of Haiti in Every Bite!",
      phoneDisplay: "410-829-5267",
      phoneE164: "+14108295267",
      whatsapp: "14108295267", // utilisé pour wa.me/14108295267
      email: "", // TODO : e-mail public de contact (facultatif)
      // TODO : adresse (ou zone) de RETRAIT à communiquer aux clients qui choisissent « retrait ».
      pickupAddress: "",
      orderPrefix: "KOK-",
    },

    /* ---------------- PRODUITS ----------------
     * id      : identifiant technique (ne pas changer une fois en production)
     * price   : prix de l'article en $ (hors livraison)
     * pieces  : nombre de kokiyol
     * bags    : nombre de sachets de 4 (0 = vendu à l'unité)
     * freeShipping : true → la commande entière passe en livraison gratuite (voir shipping)
     * image   : photo affichée sur la fiche produit
     */
    products: [
      { id: "piece", pieces: 1, bags: 0, price: 6.99, freeShipping: false, image: "kokiyol-sachet" },
      { id: "small-box", pieces: 12, bags: 3, price: 19.99, freeShipping: false, image: "kokiyol-boite" },
      { id: "family-box", pieces: 24, bags: 6, price: 39.98, freeShipping: true, image: "kokiyol-boite" },
    ],

    /* ---------------- LIVRAISON ---------------- */
    shipping: {
      // Frais de livraison standard, appliqués UNE SEULE FOIS par commande.
      // TODO (À CONFIRMER) : 6,23 $ est-il facturé une fois par commande (règle actuelle)
      //   ou par article ? Ex. : 2 Petites boîtes = 6,23 $ ou 12,46 $ ?
      //   Et quelle est la « remarque » mentionnée pour la Petite boîte ?
      flatFee: 6.23,
      // TODO (À CONFIRMER) : si le panier contient AU MOINS UNE Boîte familiale,
      //   la livraison est gratuite pour TOUTE la commande (règle actuelle).
      freeIfAnyFreeShippingProduct: true,
      // Retrait sur place = pas de frais de livraison.
      pickupEnabled: true,
      // Pays de livraison acceptés (code ISO). TODO : confirmer (États-Unis seulement ?).
      allowedCountries: ["US"],
      maxQuantityPerProduct: 20, // limite anti-erreur par ligne de panier
    },

    /* ---------------- TAXE DE VENTE ----------------
     * Ne rien inventer : la taxe est DÉSACTIVÉE tant que vous ne l'avez pas confirmée.
     * mode: "none"       → pas de taxe (actuel)
     *       "rate"       → taux fixe ci-dessous (ex. 0.06 pour 6 %)
     *       "stripe_tax" → calcul automatique par Stripe Tax (à activer dans le tableau de bord Stripe)
     * TODO : confirmer avec un comptable les obligations de taxe de vente de votre État.
     */
    tax: { mode: "none", rate: 0, appliesToShipping: false },

    /* ---------------- PAIEMENTS ----------------
     * card : Stripe Checkout (carte, Apple Pay, Google Pay). Activé à l'étape « paiements ».
     * Les moyens manuels créent une commande « En attente de paiement » ;
     * vous la confirmez ensuite depuis la page admin.
     * handle : numéro / identifiant où le client envoie l'argent.
     *          Tant qu'il est vide, le site affiche un avertissement « TODO ».
     */
    payments: {
      card: { enabled: false }, // passera à true quand le backend Stripe sera installé
      manual: [
        { id: "zelle", label: "Zelle", handle: "" /* TODO : e-mail ou téléphone Zelle */ },
        { id: "cashapp", label: "Cash App", handle: "" /* TODO : $cashtag */ },
        { id: "moncash", label: "MonCash", handle: "" /* TODO : numéro MonCash (+509…) */ },
        { id: "natcash", label: "NatCash", handle: "" /* TODO : numéro NatCash (+509…) */ },
        { id: "cash", label: "Cash", handle: null, pickupOnly: true }, // espèces au retrait
      ],
    },

    languages: ["ht", "fr", "en"],
  };

  return CONFIG;
});
