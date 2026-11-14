// ═══════════════════════════════════════════════════════════════════
// STOCK RADAR — Devenir des retours
// Ce que devient chaque produit remboursé à un client : revenu vendable chez Amazon,
// invendable chez Amazon, jamais revenu et remboursé par Amazon, reçu chez vous,
// revendu (Vinted, Leboncoin…), mis au rebut. Calcule la perte réelle des retours.
// Chargé après app-cloud.js et app-analyse.js (retours, ventes, products, amazonOps).
// ═══════════════════════════════════════════════════════════════════

let retoursDevenirOk = null;          // null = pas encore vérifié ; false = migration à exécuter
let retoursFiltreDevenir = '';
let rapportRetoursData = null, rapportRetoursEnCours = false;

const DEVENIRS = {
    '':                { lib: 'À traiter',               cls: 'pill-warn',   aide: 'On ne sait pas encore ce qu\'est devenu le produit' },
    stock_amazon:      { lib: 'Revenu en stock Amazon',  cls: 'pill-ok',     aide: 'Amazon l\'a remis en vente : seule la commission est perdue' },
    invendable_amazon: { lib: 'Invendable chez Amazon',  cls: 'pill-danger', aide: 'Abîmé ou défectueux, gardé par Amazon : à faire revenir ou à détruire' },
    rembourse_amazon:  { lib: 'Remboursé par Amazon',    cls: 'pill-info',   aide: 'Jamais revenu : Amazon vous l\'a payé (remboursement FBA)' },
    recu:              { lib: 'Reçu chez nous',          cls: 'pill-neutre', aide: 'Il est chez vous : à revendre ou à jeter' },
    revendu:           { lib: 'Revendu',                 cls: 'pill-ok',     aide: 'Revendu sur Vinted, Leboncoin ou ailleurs' },
    rebut:             { lib: 'Au rebut',                cls: 'pill-danger', aide: 'Jeté ou détruit : perte totale' },
};
const CANAUX_REVENTE = ['Vinted', 'Leboncoin', 'Amazon (reconditionné)', 'Autre'];

function devenirDe(r) { return r && DEVENIRS[r.devenir || ''] ? (r.devenir || '') : ''; }
function pillDevenir(r) {
    const d = devenirDe(r), x = DEVENIRS[d];
    const detail = d === 'revendu' && r.canal_revente ? ' · ' + r.canal_revente : '';
    return `<span class="pill ${x.cls}" title="${escapeHtml(x.aide)}">${x.lib}${escapeHtml(detail)}</span>`;
}
// Perte réelle d'un retour : ce qu'Amazon a repris sur le compte, moins ce qu'on a récupéré
function perteReelle(r) { return (Number(r.total) || 0) + (Number(r.valeur_recuperee) || 0); }

// Coût d'achat d'un retour : celui de la vente d'origine, sinon celui de la fiche produit
function coutRetour(r) {
    const q = Math.abs(r.quantite || 1);
    const v = r.vente_id ? ventes.find(x => x.id === r.vente_id) : null;
    if (v && v.prix_achat_unitaire > 0) return +(v.prix_achat_unitaire * q).toFixed(2);
    const p = r.produit_id ? products.find(x => x.id === r.produit_id) : null;
    return p && p.prix_achat > 0 ? +(p.prix_achat * q).toFixed(2) : 0;
}

// Les colonnes « devenir » existent-elles ? (migration-retours-devenir.sql)
async function verifierDevenirRetours() {
    if (retoursDevenirOk !== null) return retoursDevenirOk;
    if (retours.length) { retoursDevenirOk = Object.prototype.hasOwnProperty.call(retours[0], 'devenir'); return retoursDevenirOk; }
    const { error } = await sb.from('retours').select('devenir').limit(1);
    retoursDevenirOk = !error;
    return retoursDevenirOk;
}

// Chiffres du devenir sur une liste de retours
function bilanDevenir(list) {
    const parDevenir = {};
    Object.keys(DEVENIRS).forEach(k => { parDevenir[k] = { n: 0, unites: 0, rembourse: 0, recupere: 0 }; });
    list.forEach(r => {
        const x = parDevenir[devenirDe(r)];
        x.n++; x.unites += Math.abs(r.quantite || 0); x.rembourse += Number(r.total) || 0; x.recupere += Number(r.valeur_recuperee) || 0;
    });
    const rembourse = list.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const recupere = list.reduce((s, r) => s + (Number(r.valeur_recuperee) || 0), 0);
    return { parDevenir, rembourse, recupere, perte: rembourse + recupere };
}

// Pour le bloc « Résultat » de l'accueil : ce qu'on récupère sur les retours de la période,
// hors remboursements FBA (déjà comptés dans leur propre ligne).
function recupereRetoursPeriode(debut, fin) {
    return retours.filter(r => { const d = String(r.date_retour || ''); return (!debut || d >= debut) && (!fin || d <= fin); })
        .filter(r => r.devenir === 'stock_amazon' || r.devenir === 'revendu')
        .reduce((s, r) => s + (Number(r.valeur_recuperee) || 0), 0);
}

function setRetoursDevenir(v) { retoursFiltreDevenir = v; retoursPage = 1; displayRetours(); }

// En-tête de la page Retours : pastilles du devenir + bilan de la perte réelle
function majDevenirRetours(listeFiltree) {
    const zone = document.getElementById('retours-devenir');
    const bilanZone = document.getElementById('retours-bilan');
    if (!zone) return;
    if (retoursDevenirOk === false) {
        zone.innerHTML = '';
        if (bilanZone) bilanZone.innerHTML = '<div class="retours-aide" style="display:block;">Pour suivre ce que deviennent les retours (revenu chez Amazon, reçu, revendu, rebut), exécutez <strong>migration-retours-devenir.sql</strong> dans le SQL Editor de Supabase, puis rechargez la page.</div>';
        return;
    }
    const b = bilanDevenir(listeFiltree);
    const P = b.parDevenir;
    zone.innerHTML = pastillesHtml([
        ['', 'Tous', listeFiltree.length],
        ['a_traiter', 'À traiter', P[''].n],
        ['stock_amazon', 'Revenus en stock Amazon', P.stock_amazon.n],
        ['invendable_amazon', 'Invendables chez Amazon', P.invendable_amazon.n],
        ['rembourse_amazon', 'Remboursés par Amazon', P.rembourse_amazon.n],
        ['recu', 'Reçus chez nous', P.recu.n],
        ['revendu', 'Revendus', P.revendu.n],
        ['rebut', 'Au rebut', P.rebut.n],
    ].filter(([v, , n]) => v === '' || v === 'a_traiter' || n > 0), retoursFiltreDevenir, 'setRetoursDevenir');
    if (bilanZone) {
        const pctTraite = listeFiltree.length ? Math.round((1 - P[''].n / listeFiltree.length) * 100) : 0;
        bilanZone.innerHTML = `<div class="retours-bilan">
            <div><span>Repris par Amazon</span><strong class="neg">${fmtEur(b.rembourse)}</strong></div>
            <div><span>Récupéré</span><strong class="pos">+${fmtEur(b.recupere)}</strong><small>stock revenu chez Amazon, reventes, remboursements FBA</small></div>
            <div><span>Perte réelle</span><strong class="${b.perte < 0 ? 'neg' : 'pos'}">${fmtEur(b.perte)}</strong></div>
            <div><span>Devenir connu</span><strong>${pctTraite} %</strong><small>${P[''].n} retour(s) à traiter</small></div>
        </div>`;
    }
}

function filtrerParDevenir(list) {
    if (!retoursFiltreDevenir) return list;
    if (retoursFiltreDevenir === 'a_traiter') return list.filter(r => devenirDe(r) === '');
    return list.filter(r => devenirDe(r) === retoursFiltreDevenir);
}

// ─── Tiroir « Devenir » d'un retour ───
function openDevenirRetour(id) {
    const r = retours.find(x => x.id === id);
    if (!r) return;
    if (retoursDevenirOk === false) return toastWarning('Migration à exécuter', 'Exécutez migration-retours-devenir.sql dans Supabase, puis rechargez la page.');
    const d = devenirDe(r);
    const cout = coutRetour(r);
    const options = Object.entries(DEVENIRS).map(([k, x]) => `<label class="devenir-choix"><input type="radio" name="devenir" value="${k}" ${k === d ? 'checked' : ''} onchange="majFormDevenir()"><span><strong>${x.lib}</strong><small>${escapeHtml(x.aide)}</small></span></label>`).join('');
    document.getElementById('sr-devenir')?.remove();
    const m = document.createElement('div');
    m.id = 'sr-devenir';
    m.className = 'sr-tiroir';
    m.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Devenir du retour" class="sr-tiroir-panneau">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div><div class="tiroir-sur">Retour du ${r.date_retour ? new Date(r.date_retour + 'T12:00:00').toLocaleDateString('fr-FR') : '-'} · ${Math.abs(r.quantite || 1)} u. · ${escapeHtml(paysRetour(r.marketplace))}</div>
            <div class="tiroir-titre">${escapeHtml(r.produit_nom || r.sku || 'Produit non identifié')}</div></div>
            <button type="button" class="ico-btn ico-voir" onclick="document.getElementById('sr-devenir').remove()" aria-label="Fermer">${ICO('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
        </div>
        <div class="achat-codes" style="margin:6px 0 10px;"><span class="code-copiable">${boutonCopier(r.amazon_order_id, 'n° de commande')}<span class="code-lib">Commande</span><span>${escapeHtml(r.amazon_order_id || '-')}</span></span><span class="code-copiable">${boutonCopier(r.sku, 'SKU')}<span class="code-lib">SKU</span><span>${escapeHtml(r.sku || '-')}</span></span></div>
        ${r.disposition || r.raison_retour ? `<p class="sous-prix" style="margin:0 0 10px;">Amazon : ${escapeHtml([libDisposition(r.disposition), libRaison(r.raison_retour)].filter(Boolean).join(' · '))}</p>` : ''}
        <div class="detail-calcul" style="margin-bottom:14px;">
            <div class="detail-ligne"><span>Repris par Amazon<small>remboursement client, net des frais rendus</small></span><span style="color:var(--danger)">${fmtEur(r.total || 0)}</span></div>
            <div class="detail-ligne"><span>Coût d'achat<small>${cout > 0 ? 'de la vente d\'origine ou de la fiche' : 'inconnu'}</small></span><span>${cout > 0 ? fmtEur(cout) : '–'}</span></div>
        </div>
        <fieldset class="devenir-liste"><legend>Qu'est devenu le produit ?</legend>${options}</fieldset>
        <div id="devenir-revente" class="devenir-revente" style="display:none;">
            <label>Revendu sur <select id="devenir-canal" class="search-input">${CANAUX_REVENTE.map(c => `<option ${c === r.canal_revente ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
            <label>Prix encaissé (€) <input type="number" id="devenir-prix" class="search-input" min="0" step="0.01" inputmode="decimal" value="${d === 'revendu' ? (r.valeur_recuperee || '') : ''}"></label>
        </div>
        <div id="devenir-valeur" class="devenir-revente" style="display:none;">
            <label>Valeur récupérée (€) <input type="number" id="devenir-val" class="search-input" min="0" step="0.01" inputmode="decimal" value="${r.valeur_recuperee || 0}"></label>
        </div>
        <label class="devenir-revente" style="display:flex;">Date <input type="date" id="devenir-date" class="search-input" value="${r.date_devenir || dateLocaleISO(new Date())}"></label>
        <label class="devenir-revente" style="display:flex;">Note <input type="text" id="devenir-note" class="search-input" maxlength="300" value="${escapeHtml(r.note_devenir || '')}" placeholder="État, acheteur, n° d'annonce…"></label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:14px;">
            <button type="button" class="scan-button" onclick="enregistrerDevenir(${r.id})">Enregistrer</button>
            <button type="button" class="scan-button export" onclick="document.getElementById('sr-devenir').remove()">Annuler</button>
        </div>
    </div>`;
    m.dataset.cout = cout;
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(m);
    majFormDevenir();
}
function majFormDevenir() {
    const v = document.querySelector('#sr-devenir input[name="devenir"]:checked')?.value || '';
    const rev = document.getElementById('devenir-revente'), val = document.getElementById('devenir-valeur');
    if (rev) rev.style.display = v === 'revendu' ? 'flex' : 'none';
    if (val) {
        val.style.display = (v === 'stock_amazon' || v === 'rembourse_amazon') ? 'flex' : 'none';
        const champ = document.getElementById('devenir-val');
        const cout = +document.getElementById('sr-devenir')?.dataset.cout || 0;
        if (champ && v === 'stock_amazon' && !(+champ.value > 0) && cout > 0) champ.value = cout.toFixed(2);
    }
}
async function enregistrerDevenir(id) {
    const r = retours.find(x => x.id === id);
    if (!r) return;
    const devenir = document.querySelector('#sr-devenir input[name="devenir"]:checked')?.value || '';
    let valeur = 0, canal = '';
    if (devenir === 'revendu') {
        canal = document.getElementById('devenir-canal')?.value || 'Autre';
        valeur = parseFloat(String(document.getElementById('devenir-prix')?.value || '').replace(',', '.'));
        if (!(valeur >= 0)) return toastError('Prix manquant', 'Indiquez le prix encaissé pour la revente (0 si donné).');
    } else if (devenir === 'stock_amazon' || devenir === 'rembourse_amazon') {
        valeur = parseFloat(String(document.getElementById('devenir-val')?.value || '0').replace(',', '.')) || 0;
    }
    const maj = {
        devenir, devenir_source: devenir ? 'manuel' : '', canal_revente: canal,
        valeur_recuperee: +valeur.toFixed(2),
        date_devenir: devenir ? (document.getElementById('devenir-date')?.value || dateLocaleISO(new Date())) : null,
        note_devenir: (document.getElementById('devenir-note')?.value || '').trim(),
    };
    const { error } = await sb.from('retours').update(maj).eq('id', id);
    if (error) return toastError('Enregistrement impossible', error.message);
    Object.assign(r, maj);
    document.getElementById('sr-devenir')?.remove();
    toastSuccess('Retour mis à jour', `${DEVENIRS[devenir].lib}${devenir === 'revendu' ? ' · ' + canal + ' · ' + fmtEur(maj.valeur_recuperee) : ''}`);
    displayRetours();
    updateDashboard();
}

// Action rapide depuis le tableau (Reçu, Rebut) sans ouvrir le tiroir
async function devenirRapide(id, devenir) {
    const r = retours.find(x => x.id === id);
    if (!r) return;
    if (retoursDevenirOk === false) return toastWarning('Migration à exécuter', 'Exécutez migration-retours-devenir.sql dans Supabase, puis rechargez la page.');
    const maj = { devenir, devenir_source: 'manuel', valeur_recuperee: 0, canal_revente: '', date_devenir: dateLocaleISO(new Date()) };
    const { error } = await sb.from('retours').update(maj).eq('id', id);
    if (error) return toastError('Enregistrement impossible', error.message);
    Object.assign(r, maj);
    displayRetours();
    updateDashboard();
    return true;
}

// ─── Libellés du rapport « Retours clients FBA » ───
const DISPOSITIONS = { SELLABLE: 'Vendable', CUSTOMER_DAMAGED: 'Abîmé par le client', DEFECTIVE: 'Défectueux', CARRIER_DAMAGED: 'Abîmé par le transporteur', DISTRIBUTOR_DAMAGED: 'Abîmé en entrepôt', EXPIRED: 'Périmé' };
const RAISONS = { NOT_AS_DESCRIBED: 'Pas conforme à la description', DEFECTIVE: 'Défectueux', UNWANTED_ITEM: 'Plus voulu', NO_REASON_GIVEN: 'Sans motif', ORDERED_WRONG_ITEM: 'Mauvais article commandé', DAMAGED_BY_CARRIER: 'Abîmé par le transporteur', DAMAGED_BY_FC: 'Abîmé par Amazon', QUALITY_UNACCEPTABLE: 'Qualité insuffisante', MISSING_PARTS: 'Pièces manquantes', SWITCHEROO: 'Article échangé par le client', FOUND_BETTER_PRICE: 'Moins cher ailleurs', UNAUTHORIZED_PURCHASE: 'Achat non autorisé', EXTRA_ITEM: 'Article en trop', MISORDERED: 'Erreur de commande', NEVER_ARRIVED: 'Jamais arrivé', APPAREL_TOO_SMALL: 'Trop petit', APPAREL_TOO_LARGE: 'Trop grand', NOT_COMPATIBLE: 'Pas compatible', PART_NOT_COMPATIBLE: 'Pièce pas compatible', UNDELIVERABLE_UNKNOWN: 'Non livrable', EXCESSIVE_INSTALLATION: 'Installation trop complexe' };
function libDisposition(d) { return d ? (DISPOSITIONS[d] || d) : ''; }
function libRaison(d) { return d ? (RAISONS[d] || d.replace(/_/g, ' ').toLowerCase()) : ''; }

// ─── Rapport « Retours clients FBA » (Seller Central > Rapports > Expédié par Amazon) ───
// Colonnes : return-date, order-id, sku, asin, fnsku, product-name, quantity, fulfillment-center-id,
// detailed-disposition, reason, status, license-plate-number, customer-comments
function analyserRapportRetours(texte) {
    const lignes = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lignes.length < 2) return { erreur: 'Le fichier est vide.' };
    const sep = lignes[0].includes('\t') ? '\t' : (lignes[0].includes(';') ? ';' : ',');
    const tete = lignes[0].split(sep).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    const ix = (n) => tete.indexOf(n);
    const c = { date: ix('return-date'), order: ix('order-id'), sku: ix('sku'), asin: ix('asin'), qty: ix('quantity'), disp: ix('detailed-disposition'), raison: ix('reason'), statut: ix('status') };
    if (c.order < 0 || c.sku < 0 || c.disp < 0) return { erreur: 'Ce n\'est pas le rapport « Retours clients FBA » (colonnes order-id, sku, detailed-disposition introuvables).' };
    const out = [];
    for (let i = 1; i < lignes.length; i++) {
        const t = lignes[i].split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
        if (!t[c.order]) continue;
        out.push({ date: String(t[c.date] || '').slice(0, 10), order: t[c.order], sku: t[c.sku], asin: c.asin >= 0 ? t[c.asin] : '', qty: Math.abs(parseInt(t[c.qty], 10) || 1), disp: String(t[c.disp] || '').toUpperCase(), raison: c.raison >= 0 ? t[c.raison] : '', statut: c.statut >= 0 ? t[c.statut] : '' });
    }
    return { lignes: out };
}

// Associe chaque ligne du rapport à un remboursement client (même commande et même SKU),
// sans jamais écraser un devenir saisi à la main.
function rapprocherRapportRetours(lignesRapport) {
    const parCle = new Map();
    retours.forEach(r => {
        const k = String(r.amazon_order_id || '').split('|')[0].trim() + '|' + String(r.sku || '').trim().toUpperCase();
        if (!parCle.has(k)) parCle.set(k, []);
        parCle.get(k).push(r);
    });
    parCle.forEach(l => l.sort((a, b) => String(a.date_retour || '').localeCompare(String(b.date_retour || ''))));
    const pris = new Set(), maj = [];
    let sansRemboursement = 0, manuels = 0, identiques = 0;
    lignesRapport.sort((a, b) => a.date.localeCompare(b.date)).forEach(l => {
        const cands = (parCle.get(l.order + '|' + String(l.sku).toUpperCase()) || []).filter(r => !pris.has(r.id));
        const r = cands[0];
        if (!r) { sansRemboursement++; return; }
        pris.add(r.id);
        if (r.devenir_source === 'manuel' && r.devenir) {
            manuels++;
            // On garde le choix fait à la main, mais on note quand même l'état constaté par Amazon et le motif
            if (r.disposition !== l.disp || r.raison_retour !== l.raison) maj.push([r.id, { disposition: l.disp, raison_retour: l.raison, asin: l.asin || r.asin || '' }]);
            return;
        }
        const devenir = l.disp === 'SELLABLE' ? 'stock_amazon' : 'invendable_amazon';
        const valeur = devenir === 'stock_amazon' ? coutRetour(r) : 0;
        const x = { devenir, devenir_source: 'amazon', disposition: l.disp, raison_retour: l.raison, date_devenir: l.date || null, valeur_recuperee: valeur, asin: l.asin || r.asin || '' };
        if (r.devenir === x.devenir && r.disposition === x.disposition && r.raison_retour === x.raison_retour && Math.abs((Number(r.valeur_recuperee) || 0) - valeur) < 0.005) { identiques++; return; }
        maj.push([r.id, x]);
    });
    return { maj, sansRemboursement, manuels, identiques, total: lignesRapport.length };
}

async function previewRapportRetours(input) {
    const f = input?.files?.[0];
    if (!f) return;
    const texte = await f.text();
    input.value = '';
    await traiterRapportRetours(texte);
}
async function traiterRapportRetours(texte) {
    await verifierDevenirRetours();
    if (retoursDevenirOk === false) return toastWarning('Migration à exécuter', 'Exécutez migration-retours-devenir.sql dans Supabase, puis rechargez la page.');
    const a = analyserRapportRetours(texte);
    if (a.erreur) return toastError('Rapport non reconnu', a.erreur);
    rapportRetoursData = rapprocherRapportRetours(a.lignes);
    majBlocRapportRetours();
}
function majBlocRapportRetours() {
    const bloc = document.getElementById('retours-rapport-bloc');
    if (!bloc) return;
    const d = rapportRetoursData;
    if (!d) { bloc.style.display = 'none'; return; }
    bloc.style.display = 'flex';
    const vend = d.maj.filter(([, x]) => x.devenir === 'stock_amazon').length, inv = d.maj.filter(([, x]) => x.devenir === 'invendable_amazon').length;
    bloc.querySelector('.txt').textContent = `${d.total} retour(s) dans le rapport Amazon : ${d.maj.length} à mettre à jour (${vend} revenu(s) vendable(s), ${inv} invendable(s)${d.maj.length - vend - inv ? ', ' + (d.maj.length - vend - inv) + ' motif(s) ajouté(s)' : ''}) · ${d.identiques} déjà à jour · ${d.manuels} déjà saisi(s) à la main, gardé(s) · ${d.sansRemboursement} sans remboursement enregistré (importez le rapport de transactions récent).`;
    const btn = bloc.querySelector('button');
    btn.style.display = d.maj.length ? '' : 'none';
    btn.textContent = `Mettre à jour ${d.maj.length} retour${d.maj.length > 1 ? 's' : ''}`;
}
async function confirmRapportRetours() {
    if (rapportRetoursEnCours || !rapportRetoursData?.maj.length) return;
    rapportRetoursEnCours = true;
    const btn = document.querySelector('#retours-rapport-bloc button');
    if (btn) btn.disabled = true;
    try {
        const liste = rapportRetoursData.maj;
        let ok = 0, erreurs = 0;
        for (let k = 0; k < liste.length; k += 8) {
            const res = await Promise.all(liste.slice(k, k + 8).map(([id, x]) => sb.from('retours').update(x).eq('id', id)));
            res.forEach((r, j) => { if (r.error) { erreurs++; console.warn('Devenir retours:', r.error.message); } else { ok++; const [id, x] = liste[k + j]; const ret = retours.find(y => y.id === id); if (ret) Object.assign(ret, x); } });
            if (btn) btn.textContent = `Mise à jour… ${Math.min(k + 8, liste.length)} / ${liste.length}`;
        }
        if (erreurs) toastError('Mise à jour incomplète', `${ok} retour(s) mis à jour, ${erreurs} erreur(s).`);
        else toastSuccess('Retours mis à jour', `${ok} retour(s) : devenir lu dans le rapport Amazon.`);
        rapportRetoursData = null;
        majBlocRapportRetours();
        displayRetours();
        updateDashboard();
    } finally {
        rapportRetoursEnCours = false;
        if (btn) btn.disabled = false;
    }
}

// ─── Remboursements FBA « retour client non revenu » → devenir « Remboursé par Amazon » ───
function rapprocherRemboursementsFba() {
    if (typeof amazonOps === 'undefined') return [];
    const ops = amazonOps.filter(o => o.categorie === 'remboursement_fba' && motifRemboursement(o.description) === 'Retour client non revenu' && (Number(o.total) || 0) > 0);
    const dejaLies = new Set(retours.filter(r => r.devenir === 'rembourse_amazon' && r.note_devenir).map(r => r.note_devenir));
    const candidats = retours.filter(r => devenirDe(r) === '' || (r.devenir === 'invendable_amazon' && r.devenir_source !== 'manuel'));
    const pris = new Set(), maj = [];
    ops.sort((a, b) => String(a.date_op || '').localeCompare(String(b.date_op || ''))).forEach(o => {
        const repere = 'Remboursement FBA ' + o.cle;
        if (dejaLies.has(repere)) return;
        const sku = String(o.sku || '').toUpperCase();
        if (!sku) return;
        // Le remboursement arrive après le retour (en général 30 à 60 jours) : on prend le plus ancien retour du même SKU
        const r = candidats.find(r => !pris.has(r.id) && String(r.sku || '').toUpperCase() === sku && String(r.date_retour || '') <= String(o.date_op || '') && String(r.date_retour || '') >= decalerJours(o.date_op, -150));
        if (!r) return;
        pris.add(r.id);
        maj.push([r.id, { devenir: 'rembourse_amazon', devenir_source: 'auto', valeur_recuperee: +(Number(o.total) || 0).toFixed(2), date_devenir: o.date_op || null, note_devenir: repere }]);
    });
    return maj;
}
function decalerJours(iso, n) {
    const d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return '';
    d.setDate(d.getDate() + n);
    return dateLocaleISO(d);
}
async function appliquerRemboursementsFba() {
    await verifierDevenirRetours();
    if (retoursDevenirOk === false) return toastWarning('Migration à exécuter', 'Exécutez migration-retours-devenir.sql dans Supabase, puis rechargez la page.');
    const maj = rapprocherRemboursementsFba();
    if (!maj.length) return toastInfo('Rien à rapprocher', 'Aucun remboursement FBA « retour client » ne correspond à un retour encore à traiter.');
    const total = maj.reduce((s, [, x]) => s + x.valeur_recuperee, 0);
    if (!await srConfirm(`${maj.length} retour(s) n'est (ne sont) jamais revenu(s) et Amazon vous l'a payé : ${fmtEur(total)} au total.\n\nLes marquer « Remboursé par Amazon » ?`, 'Rapprocher les remboursements FBA')) return;
    let ok = 0;
    for (let k = 0; k < maj.length; k += 8) {
        const res = await Promise.all(maj.slice(k, k + 8).map(([id, x]) => sb.from('retours').update(x).eq('id', id)));
        res.forEach((r, j) => { if (!r.error) { ok++; const [id, x] = maj[k + j]; const ret = retours.find(y => y.id === id); if (ret) Object.assign(ret, x); } });
    }
    toastSuccess('Remboursements FBA rapprochés', `${ok} retour(s) marqué(s) « Remboursé par Amazon ».`);
    displayRetours();
    updateDashboard();
}

// ─── Scanner un retour reçu à l'entrepôt ───
function openScanRetour() {
    if (retoursDevenirOk === false) return toastWarning('Migration à exécuter', 'Exécutez migration-retours-devenir.sql dans Supabase, puis rechargez la page.');
    document.getElementById('sr-scan-retour')?.remove();
    const m = document.createElement('div');
    m.id = 'sr-scan-retour';
    m.className = 'sr-tiroir';
    m.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Réceptionner un retour" class="sr-tiroir-panneau">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div><div class="tiroir-sur">Retours</div><div class="tiroir-titre">Réceptionner un retour</div></div>
            <button type="button" class="ico-btn ico-voir" onclick="document.getElementById('sr-scan-retour').remove()" aria-label="Fermer">${ICO('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
        </div>
        <p class="sous-prix" style="margin:6px 0 12px;">Scannez le code-barres du produit (EAN), ou tapez un ASIN, un SKU ou un n° de commande.</p>
        <input type="text" id="scan-retour-code" class="search-input" autocomplete="off" inputmode="search" placeholder="EAN, ASIN, SKU, commande…" onkeydown="if(event.key==='Enter'){event.preventDefault();chercherRetourScan();}">
        <div id="scan-retour-res" style="margin-top:14px;"></div>
    </div>`;
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(m);
    setTimeout(() => document.getElementById('scan-retour-code')?.focus(), 50);
}
function retoursPourCode(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return [];
    const ids = new Set(products.filter(p => [p.ean, p.asin, p.sku].some(x => x && String(x).trim().toUpperCase() === c)).map(p => p.id));
    return retours.filter(r => (r.produit_id && ids.has(r.produit_id)) || String(r.sku || '').toUpperCase() === c || String(r.asin || '').toUpperCase() === c || String(r.amazon_order_id || '').toUpperCase().includes(c));
}
function chercherRetourScan() {
    const champ = document.getElementById('scan-retour-code');
    const zone = document.getElementById('scan-retour-res');
    if (!champ || !zone) return;
    const tous = retoursPourCode(champ.value);
    const enAttente = tous.filter(r => ['', 'invendable_amazon'].includes(devenirDe(r)) || (r.devenir === 'rembourse_amazon'))
        .sort((a, b) => String(b.date_retour || '').localeCompare(String(a.date_retour || '')));
    if (!tous.length) { zone.innerHTML = `<div class="empty-state" style="padding:18px;"><h3>Aucun retour pour « ${escapeHtml(champ.value)} »</h3><p>Le remboursement n'est peut-être pas encore importé (rapport de transactions).</p></div>`; return; }
    if (!enAttente.length) { zone.innerHTML = `<p class="sous-prix">${tous.length} retour(s) pour ce produit, tous déjà traités : ${tous.map(r => DEVENIRS[devenirDe(r)].lib).join(', ')}.</p>`; return; }
    zone.innerHTML = `<p class="sous-prix" style="margin-bottom:8px;">${enAttente.length} retour(s) en attente pour ce produit. Choisissez celui que vous avez dans les mains :</p>` + enAttente.slice(0, 12).map(r => `
        <div class="scan-retour-ligne">
            <div><div class="achat-nom">${escapeHtml(r.produit_nom || r.sku || '-')}</div>
            <div class="sous-prix">${r.date_retour ? new Date(r.date_retour + 'T12:00:00').toLocaleDateString('fr-FR') : '-'} · ${escapeHtml(paysRetour(r.marketplace))} · ${Math.abs(r.quantite || 1)} u. · ${escapeHtml(r.amazon_order_id || '')}</div>
            <div style="margin-top:4px;">${pillDevenir(r)}</div></div>
            <button type="button" class="scan-button" onclick="recevoirRetourScan(${r.id})">Reçu</button>
        </div>`).join('');
}
async function recevoirRetourScan(id) {
    if (!await devenirRapide(id, 'recu')) return;
    toastSuccess('Retour reçu', 'Marqué « Reçu chez nous ». Indiquez plus tard s\'il est revendu ou jeté.');
    const champ = document.getElementById('scan-retour-code');
    if (champ) { champ.value = ''; champ.focus(); }
    const zone = document.getElementById('scan-retour-res');
    if (zone) zone.innerHTML = '';
}

// Le rapport peut aussi arriver depuis la page Seller Central (fenêtre ouverte par Stock Radar)
window.addEventListener('message', (e) => {
    if (!/^https:\/\/sellercentral(-europe)?\.amazon\./.test(e.origin)) return;
    if (e.data && e.data.type === 'SR_RAPPORT_RETOURS' && typeof e.data.texte === 'string') {
        if (typeof switchTab === 'function') switchTab('retours');
        traiterRapportRetours(e.data.texte);
    }
});

// Ligne « À faire » de l'accueil
function lignesAFaireRetours(ligne) {
    try {
        if (retoursDevenirOk === false || !retours.length) return;
        const recus = retours.filter(r => r.devenir === 'recu');
        if (recus.length) ligne(recus.length, 'warn', `Retour${recus.length > 1 ? 's' : ''} reçu${recus.length > 1 ? 's' : ''} à revendre ou jeter`, 'Indiquez s\'ils sont revendus (Vinted, Leboncoin…) ou mis au rebut', 'Voir', "switchTab('retours');setRetoursDevenir('recu')");
        const inv = retours.filter(r => r.devenir === 'invendable_amazon');
        if (inv.length) ligne(inv.length, 'warn', `Retour${inv.length > 1 ? 's' : ''} invendable${inv.length > 1 ? 's' : ''} chez Amazon`, 'À faire revenir (ordre de retrait) ou à faire détruire', 'Voir', "switchTab('retours');setRetoursDevenir('invendable_amazon')");
    } catch (e) { console.warn('À faire (retours):', e); }
}
