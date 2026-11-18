/* KOKIYOL Ayisyen — logique du site (front-end)
 * Les prix affichés viennent de config.js ; le serveur les recalculera de son côté.
 * ÉTAPE 1 (actuelle) : la commande est enregistrée sur l'appareil + envoyée sur WhatsApp.
 * ÉTAPE 2/3 (après accord) : submitOrder() appellera l'API (base de données + Stripe).
 */
(function () {
  "use strict";

  var CFG = window.KOK_CONFIG;
  var P = window.KOK_PRICING;
  var D = window.KOK_I18N;
  var WA = CFG.business.whatsapp;
  var $ = function (id) { return document.getElementById(id); };
  var money = P.formatMoney;

  /* ---------- Stockage local (protégé si indisponible) ---------- */
  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null");
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
  }

  /* ---------- Langue : ?lang= > choix mémorisé > langue du navigateur ---------- */
  function detectLang() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q && D[q]) return q;
    var saved = store("klang");
    if (saved && D[saved]) return saved;
    var langs = navigator.languages || [navigator.language || ""];
    for (var i = 0; i < langs.length; i++) {
      var l = String(langs[i]).toLowerCase();
      if (/^(ht|cpf)/.test(l)) return "ht";
      if (/^fr/.test(l)) return "fr";
      if (/^en/.test(l)) return "en";
    }
    return "ht";
  }
  var LG = detectLang();

  function t(key, vars) {
    var s = D[LG][key];
    if (s === undefined) s = D.en[key];
    if (s === undefined) return key;
    if (vars && typeof s === "string") {
      s = s.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] !== undefined ? vars[k] : ""; });
    }
    return s;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function announce(msg) { $("live").textContent = ""; setTimeout(function () { $("live").textContent = msg; }, 30); }

  var PROD = {};
  CFG.products.forEach(function (p) { PROD[p.id] = p; });
  function pname(id, lang) { return (lang ? D[lang] : D[LG])["p_" + id]; }
  function pieces(n, lang) {
    var d = lang ? D[lang] : D[LG];
    return n === 1 ? d.pc1 : d.pcN.replace("{n}", n);
  }

  /* ---------- Panier (mémorisé sur l'appareil) ---------- */
  var MAXQ = CFG.shipping.maxQuantityPerProduct;
  var cart = {};
  (function loadCart() {
    var c = store("kokcart") || {};
    Object.keys(c).forEach(function (id) {
      var q = parseInt(c[id], 10);
      if (PROD[id] && q > 0) cart[id] = Math.min(q, MAXQ);
    });
  })();
  function cartItems() {
    return Object.keys(cart).filter(function (id) { return cart[id] > 0; })
      .map(function (id) { return { id: id, qty: cart[id] }; });
  }
  function cartCount() { return cartItems().reduce(function (s, i) { return s + i.qty; }, 0); }
  function setQty(id, q) {
    if (!PROD[id]) return;
    q = Math.max(0, Math.min(MAXQ, q));
    if (q) cart[id] = q; else delete cart[id];
    store("kokcart", cart);
    renderAll();
  }
  function mode() {
    var r = document.querySelector('input[name="mode"]:checked');
    return r ? r.value : "delivery";
  }
  function totals(m) { return P.computeTotals(CFG, cartItems(), m || mode()); }

  /* ---------- Produits ---------- */
  function renderProducts() {
    var fee = money(P.toCents(CFG.shipping.flatFee));
    $("pk").innerHTML = CFG.products.map(function (p) {
      var name = pname(p.id);
      var q = cart[p.id] || 0;
      var ship = p.freeShipping
        ? '<div class="ship free">✓ ' + esc(t("freeShipNote")) + "</div>"
        : '<div class="ship">' + esc(t("plusShip", { fee: fee })) + "</div>";
      return '<article class="card" aria-labelledby="h-' + p.id + '">' +
        (p.freeShipping ? '<span class="badge">' + esc(t("freeBadge")) + "</span>" : "") +
        '<picture><source srcset="img/' + p.image + '.webp" type="image/webp">' +
        '<img class="pi" src="img/' + p.image + '.jpg" alt="" loading="lazy" decoding="async" width="300" height="170"></picture>' +
        '<h3 id="h-' + p.id + '">' + esc(name) + "</h3>" +
        '<div class="note">' + esc(pieces(p.pieces)) + (p.bags ? " · " + esc(t("bags", { b: p.bags })) : "") + "</div>" +
        '<div class="price">' + money(P.toCents(p.price)) + "</div>" + ship +
        '<div class="q">' +
        '<button type="button" class="qb" data-act="dec" data-id="' + p.id + '" aria-label="' + esc(t("dec", { p: name })) + '">−</button>' +
        '<b aria-label="' + esc(t("qty", { p: name })) + '">' + q + "</b>" +
        '<button type="button" class="qb" data-act="inc" data-id="' + p.id + '" aria-label="' + esc(t("inc", { p: name })) + '">+</button>' +
        '<button type="button" class="btn add" data-act="add" data-id="' + p.id + '">' + esc(t("add")) + "</button>" +
        "</div></article>";
    }).join("");
    $("shNote").textContent = t("shNote", { fee: fee });
  }

  /* ---------- Récapitulatif (sous-total / livraison / taxe / total) ---------- */
  function summaryHTML(r) {
    var shipTxt;
    if (r.pickup) shipTxt = t("shipPickup") + " — " + money(0);
    else if (r.freeShipping) shipTxt = t("shipFree");
    else shipTxt = money(r.shippingCents);
    var h = '<div class="row"><span>' + esc(t("sub")) + "</span><span>" + money(r.subtotalCents) + "</span></div>" +
      '<div class="row"><span>' + esc(t("ship")) + "</span><span" + (r.freeShipping || r.pickup ? ' class="okmsg"' : "") + ">" + esc(shipTxt) + "</span></div>";
    if (CFG.tax.mode === "rate" && r.taxCents) h += '<div class="row"><span>' + esc(t("tax")) + "</span><span>" + money(r.taxCents) + "</span></div>";
    if (r.taxPending) h += '<div class="row"><span>' + esc(t("tax")) + '</span><span class="note">' + esc(t("taxAtCheckout")) + "</span></div>";
    h += '<div class="row total"><b>' + esc(t("tot")) + "</b><b>" + money(r.totalCents) + "</b></div>";
    return h;
  }

  function renderCart() {
    var r = totals();
    var items = cartItems();
    $("items").innerHTML = items.length ? items.map(function (i) {
      var p = PROD[i.id], name = pname(i.id);
      return '<div class="ci"><div><div class="nm">' + esc(name) + '</div><div class="note">' + esc(pieces(p.pieces)) +
        " · " + money(P.toCents(p.price)) + "</div></div><div><b>" + money(P.toCents(p.price) * i.qty) + "</b></div>" +
        '<div class="ctl"><button type="button" data-act="dec" data-id="' + i.id + '" aria-label="' + esc(t("dec", { p: name })) + '">−</button>' +
        '<span aria-label="' + esc(t("qty", { p: name })) + '">' + i.qty + "</span>" +
        '<button type="button" data-act="inc" data-id="' + i.id + '" aria-label="' + esc(t("inc", { p: name })) + '"' + (i.qty >= MAXQ ? " disabled" : "") + ">+</button></div>" +
        '<div><button type="button" class="rm" data-act="rm" data-id="' + i.id + '" aria-label="' + esc(t("remove", { p: name })) + '">✕</button></div></div>';
    }).join("") : '<p class="note">' + esc(t("empty")) + "</p>";
    // Étape 1 : estimation avec le mode choisi (livraison par défaut)
    $("sum1").innerHTML = items.length ? summaryHTML(r) : "";
    $("free1").textContent = r.freeShipping ? t("freeApplied") : "";
    $("sum3").innerHTML = items.length ? summaryHTML(r) : "";
    var c = cartCount();
    $("cn").textContent = c;
    $("hcn").textContent = c;
    $("ct2").textContent = money(r.totalCents && items.length ? r.totalCents : 0);
  }

  /* ---------- Paiement ---------- */
  function renderPayOptions() {
    var sel = $("pay"), cur = sel.value, pickup = mode() === "pickup";
    var opts = ['<option value="">' + esc(t("stPick")) + "</option>"];
    opts.push('<option value="card"' + (CFG.payments.card.enabled ? "" : " disabled") + ">" +
      esc(t("card")) + (CFG.payments.card.enabled ? "" : " " + esc(t("cardSoon"))) + "</option>");
    CFG.payments.manual.forEach(function (m) {
      if (m.pickupOnly && !pickup) return;
      opts.push('<option value="' + m.id + '">' + esc(m.id === "cash" ? t("pcash") : m.label) + "</option>");
    });
    sel.innerHTML = opts.join("");
    if (cur && sel.querySelector('option[value="' + cur + '"]:not([disabled])')) sel.value = cur;
    renderPayInfo();
  }
  function renderPayInfo() {
    var v = $("pay").value, el = $("payinfo");
    el.classList.remove("todo");
    if (!v) { el.textContent = ""; return; }
    if (v === "card") { el.textContent = t("cardNote"); return; }
    var m = CFG.payments.manual.filter(function (x) { return x.id === v; })[0];
    if (!m) { el.textContent = ""; return; }
    if (m.id === "cash") { el.textContent = t("pc") + " " + t("manualNote"); return; }
    var amt = money(totals().totalCents);
    if (!m.handle) {
      // TODO visible tant que le numéro/identifiant n'est pas renseigné dans config.js
      el.textContent = "⚠ TODO — " + t("piTodo", { m: m.label });
      el.classList.add("todo");
    } else {
      el.textContent = t("pi", { m: m.label, amt: amt, h: m.handle }) + " " + t("manualNote");
    }
  }

  /* ---------- États américains ---------- */
  var US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
  function renderStates() {
    var sel = $("stt"), cur = sel.value;
    sel.innerHTML = '<option value="">' + esc(t("stPick")) + "</option>" +
      US_STATES.map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("");
    sel.value = cur;
  }

  /* ---------- Validation (le serveur revalidera tout) ---------- */
  function fieldErr(id, bad) { $(id).setAttribute("aria-invalid", bad ? "true" : "false"); return bad; }
  function validateStep2() {
    var name = $("nm").value.trim(), phone = $("ph").value.trim(), email = $("em").value.trim();
    var digits = phone.replace(/\D/g, "");
    var checks = [
      ["nm", name.length < 2, "eName"],
      ["ph", digits.length < 10 || digits.length > 15, "ePhone"],
      ["em", !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), "eEmail"],
    ];
    if (mode() === "delivery") {
      checks.push(["ad", $("ad").value.trim().length < 4, "eAddr"]);
      checks.push(["ct", $("ct").value.trim().length < 2, "eCity"]);
      checks.push(["stt", US_STATES.indexOf($("stt").value) < 0, "eState"]);
      checks.push(["zp", !/^\d{5}(-\d{4})?$/.test($("zp").value.trim()), "eZip"]);
    } else {
      ["ad", "ct", "stt", "zp"].forEach(function (id) { fieldErr(id, false); });
    }
    var first = null;
    checks.forEach(function (c) { if (fieldErr(c[0], c[1]) && !first) first = c; });
    if (first) { $("err2").textContent = t(first[2]); $(first[0]).focus(); return false; }
    $("err2").textContent = "";
    return true;
  }

  /* ---------- Tiroir : étapes, ouverture, focus ---------- */
  var lastFocus = null, curStep = 1;
  function stp(n) {
    curStep = n;
    ["s1", "s2", "s3"].forEach(function (s, i) { $(s).classList.toggle("hide", i + 1 !== n); });
    document.querySelectorAll("#stw li").forEach(function (li, i) {
      li.classList.toggle("on", i < n);
      if (i + 1 === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    $("stw").classList.remove("hide");
    $("done").classList.add("hide");
    $("cp").scrollTop = 0;
    if (n === 3) renderPayOptions();
    var f = $("s" + n).querySelector("input,select,button");
    if (f) f.focus();
  }
  function openCart() {
    lastFocus = document.activeElement;
    $("ov").classList.remove("hide");
    $("cp").classList.remove("hide");
    document.body.style.overflow = "hidden";
    $("main").setAttribute("inert", "");
    stp(1);
    $("cx").focus();
  }
  function closeCart() {
    $("ov").classList.add("hide");
    $("cp").classList.add("hide");
    document.body.style.overflow = "";
    $("main").removeAttribute("inert");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener("keydown", function (e) {
    if ($("cp").classList.contains("hide")) return;
    if (e.key === "Escape") { closeCart(); return; }
    if (e.key === "Tab") { // piège de focus dans le tiroir
      var f = Array.prototype.filter.call(
        $("cp").querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex='0']"),
        function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  /* ---------- Commande ---------- */
  function orderNumber() {
    var n;
    try { n = crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000; }
    catch (e) { n = Math.floor(1000 + Math.random() * 9000); }
    return CFG.business.orderPrefix + n;
  }

  function waText(o) {
    // Message WhatsApp rédigé en créole pour l'entreprise
    var L = "ht";
    var lines = o.items.map(function (i) { return i.qty + " × " + pname(i.id, L) + " (" + pieces(PROD[i.id].pieces, L) + ")"; });
    var ship = o.fulfillment === "pickup" ? "Retrè (pa gen frè)" : (o.freeShipping ? "Gratis" : money(o.shippingCents));
    var pay = o.payment === "cash" ? D.ht.pcash : (o.payment === "card" ? "Kat (Stripe)" : o.paymentLabel);
    return "Bonjou KOKIYOL! Nouvo kòmand " + o.id + "\n" + lines.join("\n") +
      "\nSou-total: " + money(o.subtotalCents) + "\nLivrezon: " + ship + "\nTotal: " + money(o.totalCents) +
      "\nNon: " + o.name + "\nTel: " + o.phone + "\nImèl: " + o.email +
      "\n" + (o.fulfillment === "pickup" ? "M ap vin chèche l" : "Adrès: " + o.address) +
      "\nPeman: " + pay + "\nNòt: " + (o.notes || "-");
  }

  /**
   * ÉTAPE 1 : enregistrement local + WhatsApp.
   * TODO (étape 2/3) : remplacer par fetch("/api/orders") ou fetch("/api/create-checkout-session").
   */
  function submitOrder(payload) {
    var r = totals(payload.fulfillment);
    if (!r.ok) return Promise.reject(new Error(r.errors[0]));
    var m = CFG.payments.manual.filter(function (x) { return x.id === payload.payment; })[0];
    var o = {
      id: orderNumber(), createdAt: new Date().toISOString(),
      items: r.lines.map(function (l) { return { id: l.id, qty: l.qty }; }),
      subtotalCents: r.subtotalCents, shippingCents: r.shippingCents, taxCents: r.taxCents,
      totalCents: r.totalCents, freeShipping: r.freeShipping,
      name: payload.name, phone: payload.phone, email: payload.email,
      fulfillment: payload.fulfillment, address: payload.address, notes: payload.notes,
      payment: payload.payment, paymentLabel: m ? m.label : payload.payment,
      status: "pending_payment", step: 0,
    };
    var all = store("kok") || [];
    all.push(o);
    store("kok", all.slice(-20));
    return Promise.resolve(o);
  }

  var lastOrder = null;
  function showDone(o) {
    lastOrder = o;
    ["s1", "s2", "s3", "stw"].forEach(function (i) { $(i).classList.add("hide"); });
    var d = $("done");
    d.classList.remove("hide");
    d.innerHTML = '<h3 style="margin:0;color:var(--gd)">' + esc(t("ok")) + "</h3>" +
      "<p>" + esc(t("c1")) + " <b>" + esc(o.id) + "</b> " + esc(t("c2")) + "</p>" +
      summaryHTML({ subtotalCents: o.subtotalCents, shippingCents: o.shippingCents, taxCents: o.taxCents, totalCents: o.totalCents,
        freeShipping: o.freeShipping, pickup: o.fulfillment === "pickup", taxPending: false }) +
      '<p><b>' + esc(t("c3")) + "</b> " + esc(t("c4")) + "</p>" +
      '<a class="btn" style="width:100%" href="https://wa.me/' + WA + "?text=" + encodeURIComponent(waText(o)) + '" target="_blank" rel="noopener">' + esc(t("wa")) + "</a>" +
      '<button type="button" class="btn o" style="width:100%;margin-top:8px" id="doneClose">' + esc(t("cl")) + "</button>" +
      '<p class="thanks" style="color:var(--gd)">' + esc(t("thanks")) + "</p>";
    $("doneClose").onclick = closeCart;
    d.focus();
  }

  /* ---------- Suivi de commande ---------- */
  var STATUS_STEP = { pending_payment: 0, paid: 1, preparing: 2, shipped: 3, ready: 3, delivered: 4 };
  function trackHTML(o) {
    var stepIdx = STATUS_STEP[o.status] != null ? STATUS_STEP[o.status] : o.step || 0;
    var lines = o.items.map(function (i) { return esc(i.qty + " × " + pname(i.id) + " (" + pieces(PROD[i.id] ? PROD[i.id].pieces : 0) + ")"); });
    var extra = o.status === "pending_payment" ? " · <b>" + esc(t("sPending")) + "</b>" : "";
    return "<p><b>" + esc(o.id) + "</b> · " + esc(new Date(o.createdAt).toLocaleString(LG)) + extra + "<br>" + lines.join("<br>") +
      "<br>" + esc(t("tot")) + ": " + money(o.totalCents) + "</p>" +
      '<ol class="tl">' + t("s").map(function (s, i) {
        return '<li class="' + (i <= stepIdx ? "on" : "") + '"' + (i === stepIdx ? ' aria-current="step"' : "") + ">" + esc(s) + "</li>";
      }).join("") + "</ol>" + waStatusBtn(o.id);
  }
  function waStatusBtn(code) {
    return '<a class="btn o" href="https://wa.me/' + WA + "?text=" + encodeURIComponent("Bonjou, ki estati kòmand " + code + "?") + '" target="_blank" rel="noopener">' + esc(t("st")) + "</a>";
  }
  function lookup() {
    var code = $("code").value.trim().toUpperCase(), ph = $("tph").value.replace(/\D/g, "");
    $("terr").textContent = "";
    if (!/^KOK-\d{4,6}$/.test(code) || ph.length < 10) { $("terr").textContent = t("eTrack"); $("res").innerHTML = ""; return; }
    // TODO (étape 2) : appeler GET /api/orders/track (avec limitation de tentatives côté serveur)
    var o = (store("kok") || []).filter(function (x) { return x && Array.isArray(x.items) && x.id === code && String(x.phone).replace(/\D/g, "") === ph; })[0];
    $("res").innerHTML = o ? trackHTML(o)
      : '<p class="note">' + esc(t("nf")) + "</p><p class=\"note\">" + esc(t("trackLocal")) + "</p>" + waStatusBtn(code);
  }

  /* ---------- Traductions de la page ---------- */
  function applyLang() {
    document.documentElement.lang = LG;
    document.title = t("title");
    document.querySelectorAll("[data-t]").forEach(function (e) {
      e.innerHTML = t(e.dataset.t, { y: new Date().getFullYear() });
    });
    document.querySelectorAll("[data-ta]").forEach(function (e) { e.setAttribute("aria-label", t(e.dataset.ta)); });
    document.querySelectorAll("[data-p]").forEach(function (e) { e.placeholder = t(e.dataset.p); });
    document.querySelectorAll("#lg button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.l === LG ? "true" : "false"); });
    var pickupAddr = CFG.business.pickupAddress;
    $("pickupInfo").textContent = t("pickupInfo") + (pickupAddr ? " " + t("pickupAt", { a: pickupAddr }) : "");
    $("fpay").innerHTML = [t("card")].concat(CFG.payments.manual.map(function (m) { return m.id === "cash" ? t("pcash") : m.label; }))
      .map(function (s) { return "<span>" + esc(s) + "</span>"; }).join("");
    renderStates();
    renderAll();
    if (curStep === 3) renderPayOptions();
    if (lastOrder && !$("done").classList.contains("hide")) showDone(lastOrder);
    if ($("res").innerHTML) lookup();
    renderSlidesA11y();
  }
  function renderAll() { renderProducts(); renderCart(); renderPayInfo(); }

  /* ---------- Données structurées (SEO) générées depuis config.js ---------- */
  function jsonLd() {
    var base = location.protocol === "file:" ? "" : location.origin + "/";
    var data = [{
      "@context": "https://schema.org", "@type": "LocalBusiness",
      name: CFG.business.brandFull, alternateName: "Kokiyòl Ayisyen",
      description: D.en.desc, slogan: CFG.business.slogan,
      telephone: CFG.business.phoneE164, image: base + "img/logo.jpg", logo: base + "img/logo.jpg", url: base,
      parentOrganization: { "@type": "Organization", name: CFG.business.soldBy },
    }].concat(CFG.products.map(function (p) {
      return {
        "@context": "https://schema.org", "@type": "Product",
        name: "KOKIYOL Ayisyen – " + D.en["p_" + p.id] + " (" + pieces(p.pieces, "en") + ")",
        image: base + "img/" + p.image + ".jpg", description: D.en.desc,
        brand: { "@type": "Brand", name: CFG.business.brand },
        offers: { "@type": "Offer", priceCurrency: "USD", price: p.price.toFixed(2), availability: "https://schema.org/InStock", url: base + "#pwodwi",
          shippingDetails: { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", currency: "USD", value: p.freeShipping ? "0.00" : CFG.shipping.flatFee.toFixed(2) },
            shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" } } },
      };
    }));
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  /* ---------- Diaporama (illustrations d'origine conservées) ---------- */
  var SV = function (s) { return "data:image/svg+xml," + encodeURIComponent(s); };
  var dn = function (x, y, r, o) {
    o = o === undefined ? 1 : o;
    return '<g opacity="' + o + '" transform="translate(' + x + " " + y + ')"><circle r="' + r + '" fill="url(#g)"/><circle r="' + r * .3 + '" fill="#2a1608"/>' +
      Array.from({ length: 30 }, function (_, i) { var a = i * 2.4, d = r * (.4 + (i * 37 % 50) / 50 * .55); return '<circle cx="' + (Math.cos(a) * d).toFixed(1) + '" cy="' + (Math.sin(a) * d).toFixed(1) + '" r="2.4" fill="#fff" opacity=".85"/>'; }).join("") + "</g>";
  };
  var sp = Array.from({ length: 44 }, function (_, i) { return '<circle cx="' + (i * 137 % 1200) + '" cy="' + (i * 71 % 600) + '" r="' + (1.5 + i % 3) + '" fill="#ffd84a" opacity=".5"/>'; }).join("");
  var svg = function (c1, c2, inner) {
    return SV('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient><radialGradient id="g" cx=".4" cy=".35"><stop offset="0" stop-color="#f6b04a"/><stop offset="1" stop-color="#b8620f"/></radialGradient></defs><rect width="1200" height="600" fill="url(#b)"/>' + sp + inner + "</svg>");
  };
  var bn = '<path d="M450 70 Q440 210 590 240 Q490 190 490 60Z" fill="#ffd84a" stroke="#b58900" stroke-width="3"/>';
  var fl = '<g transform="translate(730 90)">' + [0, 72, 144, 216, 288].map(function (a) { return '<ellipse cy="-26" rx="14" ry="30" fill="#fff6c2" stroke="#d4b84a" stroke-width="2" transform="rotate(' + a + ')"/>'; }).join("") + '<circle r="9" fill="#f0c040"/></g>';
  var SL = [
    svg("#3b1a08", "#9a4a0a", dn(190, 200, 95, .4) + dn(1010, 200, 95, .4) + dn(600, 120, 85) + dn(505, 180, 62) + dn(695, 180, 62)),
    svg("#0f5132", "#c9a227", bn + '<g transform="translate(40 10)">' + bn + '</g><ellipse cx="660" cy="190" rx="42" ry="54" fill="#fff8e6" stroke="#d9c9a0" stroke-width="3"/><circle cx="660" cy="200" r="20" fill="#f5a800"/>' + fl + '<rect x="545" y="215" width="150" height="16" rx="8" fill="#8a4b1d" transform="rotate(-8 620 223)"/>'),
    svg("#0d0d0d", "#8a5a00", dn(190, 200, 95, .35) + dn(1010, 200, 95, .35) + dn(600, 190, 55) + '<rect x="515" y="30" width="170" height="220" rx="10" fill="#fff" opacity=".28" stroke="#fff" stroke-width="2"/><path d="M515 52h170" stroke="#fff" stroke-width="2" stroke-dasharray="4 4"/><circle cx="600" cy="110" r="32" fill="#111" stroke="#ddd" stroke-width="2"/><text x="600" y="108" font-size="13" font-style="italic" fill="#fff" text-anchor="middle" font-family="Georgia,serif">hand</text><text x="600" y="124" font-size="13" font-style="italic" fill="#fff" text-anchor="middle" font-family="Georgia,serif">made</text>'),
    svg("#00209f", "#d21034", dn(190, 200, 95, .35) + dn(1010, 200, 95, .35) + '<path d="M600 240C480 160 470 50 540 50C575 50 595 75 600 90C605 75 625 50 660 50C730 50 720 160 600 240Z" fill="#fff" opacity=".95"/>' + dn(600, 135, 48)),
  ];
  var si = 0, tm = null;
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("st").innerHTML = SL.map(function (s) { return '<div class="sl" role="group" aria-roledescription="slide"><img class="bg" src="' + s + '" alt=""><img class="fg" src="' + s + '" alt=""></div>'; }).join("");
  $("dt").innerHTML = SL.map(function (_, i) { return '<button type="button" data-i="' + i + '"></button>'; }).join("");
  function renderSlidesA11y() {
    document.querySelectorAll("#dt button").forEach(function (b, i) { b.setAttribute("aria-label", t("slide", { n: i + 1 })); });
  }
  function autoplay() { clearInterval(tm); if (!reduceMotion) tm = setInterval(function () { go(si + 1); }, 4500); }
  function go(n) {
    si = (n + SL.length) % SL.length;
    document.querySelectorAll(".sl").forEach(function (e, i) { e.classList.toggle("on", i === si); e.setAttribute("aria-hidden", i === si ? "false" : "true"); });
    document.querySelectorAll("#dt button").forEach(function (e, i) { e.setAttribute("aria-current", i === si ? "true" : "false"); });
    autoplay();
  }
  document.querySelectorAll("#dt button").forEach(function (e) { e.onclick = function () { go(+e.dataset.i); }; });
  $("pv").onclick = function () { go(si - 1); };
  $("nx").onclick = function () { go(si + 1); };
  var tx = 0;
  $("sw").addEventListener("touchstart", function (e) { tx = e.touches[0].clientX; }, { passive: true });
  $("sw").addEventListener("touchend", function (e) { var d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 40) go(si + (d < 0 ? 1 : -1)); });
  $("sw").onmouseenter = function () { clearInterval(tm); };
  $("sw").onmouseleave = autoplay;
  $("sw").addEventListener("focusin", function () { clearInterval(tm); });

  /* ---------- Événements ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var id = b.dataset.id, q = cart[id] || 0;
    if (b.dataset.act === "inc") { if (q >= MAXQ) announce(t("eQty")); setQty(id, q + 1); }
    else if (b.dataset.act === "dec") setQty(id, q - 1);
    else if (b.dataset.act === "rm") setQty(id, 0);
    else if (b.dataset.act === "add") { setQty(id, q + 1); announce(t("added", { p: pname(id) })); openCart(); }
    var again = document.querySelector('[data-act="' + b.dataset.act + '"][data-id="' + id + '"]');
    if (again && !again.disabled && document.activeElement === document.body) again.focus();
  });
  document.querySelectorAll(".js-open-cart").forEach(function (b) { b.onclick = openCart; });
  $("ov").onclick = closeCart;
  $("cx").onclick = closeCart;
  document.querySelectorAll("#lg button").forEach(function (b) {
    b.onclick = function () { LG = b.dataset.l; store("klang", LG); applyLang(); };
  });

  $("b1").onclick = function () {
    if (!cartItems().length) { $("err1").textContent = t("e1"); return; }
    $("err1").textContent = "";
    stp(2);
  };
  document.querySelectorAll('input[name="mode"]').forEach(function (r) {
    r.onchange = function () {
      var pickup = mode() === "pickup";
      $("addr").classList.toggle("hide", pickup);
      $("pickupInfo").classList.toggle("hide", !pickup);
      renderCart();
      renderPayOptions();
    };
  });
  if (!CFG.shipping.pickupEnabled) $("pickupOpt").classList.add("hide");
  $("b2a").onclick = function () { stp(1); };
  $("s2").onsubmit = function (e) { e.preventDefault(); if (validateStep2()) stp(3); };
  $("pay").onchange = renderPayInfo;
  $("b3a").onclick = function () { stp(2); };

  var busy = false;
  $("s3").onsubmit = function (e) {
    e.preventDefault();
    if (busy) return;
    var err = $("err3"); err.textContent = "";
    var pay = $("pay").value, pickup = mode() === "pickup";
    if (!cartItems().length) { err.textContent = t("e1"); return; }
    if (!validateStep2()) { stp(2); return; }
    if (!pay) { err.textContent = t("ePay"); $("pay").focus(); return; }
    if (pay === "cash" && !pickup) { err.textContent = t("eCash"); return; }
    if (!$("terms").checked) { err.textContent = t("eTerms"); $("terms").focus(); return; }
    busy = true; $("go").disabled = true;
    submitOrder({
      name: $("nm").value.trim(), phone: $("ph").value.trim(), email: $("em").value.trim(),
      fulfillment: pickup ? "pickup" : "delivery",
      address: pickup ? "" : $("ad").value.trim() + ", " + $("ct").value.trim() + ", " + $("stt").value + " " + $("zp").value.trim(),
      notes: $("nt").value.trim(), payment: pay, lang: LG,
    }).then(function (o) {
      cart = {}; store("kokcart", cart); renderAll();
      $("code").value = o.id; $("tph").value = o.phone;
      showDone(o);
    }).catch(function () { err.textContent = t("eGeneric"); })
      .then(function () { busy = false; $("go").disabled = false; });
  };
  $("trackForm").onsubmit = function (e) { e.preventDefault(); lookup(); };

  // Pré-remplir le suivi avec la dernière commande faite sur cet appareil
  var mine = store("kok");
  if (mine && mine.length) { $("code").value = mine[mine.length - 1].id; }

  applyLang();
  go(0);
  jsonLd();
})();
