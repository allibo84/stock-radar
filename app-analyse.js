// ═════════════════════════════════════════════
// STOCK RADAR - app-analyse.js
// Réassort, meilleurs produits, remboursements FBA, envois FBA, frais Amazon hors ventes,
// pays des ventes, détail du bénéfice d'une vente, tendances de l'accueil.
// Chargé après app-cloud.js, dont il réutilise les données (products, ventes, retours, achats…).
// ═════════════════════════════════════════════

let amazonOps = [], envoisFba = [];
let opsTableAbsente = false, envoisTableAbsente = false, ventesMarketplaceOk = false;
let opsImportData = null, opsImportEnCours = false;

// ───────── Chargement ─────────
async function chargerTableOptionnelle(table, colTri) {
    const uid = getUserFilter();
    const lignes = [];
    for (let debut = 0; ; debut += 1000) {
        let q = sb.from(table).select('*').order(colTri, { ascending: false }).order('id', { ascending: true }).range(debut, debut + 999);
        if (uid) q = q.eq('user_id', uid);
        const { data, error } = await q;
        if (error) return { absente: true, lignes: [], erreur: error.message };
        lignes.push(...(data || []));
        if (!data || data.length < 1000) break;
    }
    return { absente: false, lignes };
}
async function loadAmazonOps() {
    const r = await chargerTableOptionnelle('amazon_operations', 'date_op');
    opsTableAbsente = r.absente; amazonOps = r.lignes;
    rafraichirPageActive();
}
async function loadEnvoisFba() {
    const r = await chargerTableOptionnelle('envois_fba', 'date_maj');
    envoisTableAbsente = r.absente; envoisFba = r.lignes;
    rafraichirPageActive();
}
async function detecterMarketplaceVentes() {
    const { error } = await sb.from('ventes').select('marketplace').limit(1);
    ventesMarketplaceOk = !error;
}
async function loadAnalyse() {
    await Promise.all([loadAmazonOps(), loadEnvoisFba(), detecterMarketplaceVentes()]);
    if (typeof updateDashboard === 'function') updateDashboard();
}
function rafraichirPageActive() {
    const actif = document.querySelector('.tab-content.active')?.id;
    const pages = { reassort: displayReassort, classement: displayClassement, 'remboursements-fba': displayRemboursementsFba, 'envois-fba': displayEnvoisFba, fournitures: displayChargesAmazon };
    if (pages[actif]) pages[actif]();
}

// ───────── Outils communs ─────────
const isoJour = (d) => dateLocaleISO(d);
function ilYA(jours) { return isoJour(new Date(Date.now() - jours * 86400000)); }
function cleProduit(p) {
    if (!p) return '';
    const asin = String(p.asin || '').trim().toUpperCase();
    return asin ? 'A:' + asin : 'E:' + String(p.ean || '').trim();
}
function pct(x) { return (isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') : '–') + ' %'; }
function telechargerCsv(lignes, nom) {
    const csv = lignes.map(l => l.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\n');
    downloadCSV('﻿' + csv, nom);
}
function paginer(liste, page, parPage, nomFn) {
    const total = Math.max(1, Math.ceil(liste.length / parPage));
    const p = Math.min(Math.max(1, page), total);
    const debut = (p - 1) * parPage;
    const barre = liste.length > parPage ? `<div class="pagination-bar"><div class="pagination-info">${debut + 1}–${Math.min(debut + parPage, liste.length)} sur ${liste.length}</div><div class="pagination-controls">
        <button class="page-btn" onclick="${nomFn}(1)" ${p === 1 ? 'disabled' : ''} aria-label="Première page">«</button>
        <button class="page-btn" onclick="${nomFn}(${p - 1})" ${p === 1 ? 'disabled' : ''} aria-label="Page précédente">‹</button>
        <span class="page-btn" style="cursor:default;border:none;">${p} / ${total}</span>
        <button class="page-btn" onclick="${nomFn}(${p + 1})" ${p === total ? 'disabled' : ''} aria-label="Page suivante">›</button>
        <button class="page-btn" onclick="${nomFn}(${total})" ${p === total ? 'disabled' : ''} aria-label="Dernière page">»</button></div></div>` : '';
    return { tranche: liste.slice(debut, debut + parPage), page: p, barre };
}
function pastillesHtml(defs, actif, fn) {
    return defs.map(([v, lib, n]) => `<button type="button" class="pastille" aria-pressed="${v === actif}" onclick="${fn}('${v}')">${lib}${n === undefined ? '' : ' · ' + n}</button>`).join('');
}

// Pays d'une vente ou d'une opération : « amazon.fr », « Amazon.de », « amazon.com.be »…
const PAYS_MARKETPLACE = { 'fr': 'FR', 'de': 'DE', 'it': 'IT', 'es': 'ES', 'nl': 'NL', 'com.be': 'BE', 'be': 'BE', 'ie': 'IE', 'co.uk': 'UK', 'pl': 'PL', 'se': 'SE', 'com': 'US', 'com.tr': 'TR', 'ae': 'AE', 'sa': 'SA' };
function paysDeMarketplace(m) {
    const t = String(m || '').trim().toLowerCase();
    if (!t) return '';
    const s = t.replace(/^.*amazon\./, '');
    return PAYS_MARKETPLACE[s] || '';
}
function badgePays(m) {
    const c = paysDeMarketplace(m);
    return c ? `<span class="pill pill-neutre pays-pill" title="${escapeHtml(m)}">${c}</span>` : '';
}
function badgeSansCout(titre) {
    return `<span class="pill pill-danger" title="${escapeHtml(titre || 'Bénéfice faux : le prix d\'achat est inconnu')}">Sans prix d'achat</span>`;
}

// ───────── Liens rapides (point 10) ─────────
const ICO = (d) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICO_AMAZON = ICO('<path d="M3 15c5 3.5 13 3.5 18 0M17 17l3-1-1 3"/><path d="M8 11.5c0-2 1.6-3 3.5-3S15 9.4 15 11v3.5M15 12c-2 0-6 .2-6 2.3 0 1 .8 1.7 2 1.7 2 0 4-1.4 4-4"/>');
const ICO_KEEPA = ICO('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>');
function openAmazon(asin) {
    if (!asin) return toastError('ASIN manquant', 'Aucun ASIN pour ce produit.');
    window.open('https://www.amazon.fr/dp/' + encodeURIComponent(asin), '_blank', 'noopener');
}
function openKeepa(asin) {
    if (!asin) return toastError('ASIN manquant', 'Aucun ASIN pour ce produit.');
    window.open('https://keepa.com/#!product/4-' + encodeURIComponent(asin), '_blank', 'noopener');
}
function liensProduit(asin, petit) {
    if (!asin) return '';
    const a = escapeHtml(String(asin).toUpperCase());
    const c = petit ? ' ico-petit' : '';
    return `<button type="button" class="ico-btn ico-amz${c}" onclick="event.stopPropagation();openAmazon('${a}')" title="Voir la page Amazon" aria-label="Voir la page Amazon">${ICO_AMAZON}</button>`
        + `<button type="button" class="ico-btn ico-keepa${c}" onclick="event.stopPropagation();openKeepa('${a}')" title="Voir l'historique Keepa" aria-label="Voir l'historique Keepa">${ICO_KEEPA}</button>`;
}

// ───────── Index produits / ventes / achats par référence ─────────
function indexReferences() {
    const parId = new Map(products.map(p => [p.id, p]));
    const groupes = new Map();
    const groupe = (cle, p) => {
        if (!groupes.has(cle)) groupes.set(cle, { cle, nom: p?.nom || '', ean: p?.ean || '', asin: String(p?.asin || '').toUpperCase(), produits: [], fba: 0, fbm: 0, entrepot: 0, stock: 0, prixAchat: 0 });
        return groupes.get(cle);
    };
    products.forEach(p => {
        const g = groupe(cleProduit(p), p);
        g.produits.push(p);
        if (!g.asin && p.asin) g.asin = String(p.asin).toUpperCase();
        if (!g.ean && p.ean) g.ean = p.ean;
        if (!p.vendu && !p.invendable) {
            g.fba += p.qte_fba || 0; g.fbm += p.qte_fbm || 0; g.entrepot += p.qte_entrepot || 0; g.stock += p.quantite || 0;
            if ((p.prix_achat || 0) > 0) g.prixAchat = p.prix_achat;
        } else if (!g.prixAchat && (p.prix_achat || 0) > 0) g.prixAchat = p.prix_achat;
    });
    const cleVente = (v) => {
        const p = v.produit_id ? parId.get(v.produit_id) : null;
        return p ? cleProduit(p) : (v.produit_ean ? 'E:' + v.produit_ean : '');
    };
    return { parId, groupes, cleVente };
}

// ═══════ 1. RÉASSORT ═══════
let reassortFiltre = 'a_racheter', reassortPage = 1, reassortCleFiltres = null;
let reassortCouverture = 45;
try { const n = parseInt(localStorage.getItem('reassortCouverture')); if (n > 0) reassortCouverture = n; } catch (e) {}
function setReassortFiltre(v) { reassortFiltre = v; reassortPage = 1; displayReassort(); }
function setReassortCouverture(v) { reassortCouverture = parseInt(v) || 45; try { localStorage.setItem('reassortCouverture', reassortCouverture); } catch (e) {} displayReassort(); }
function reassortGoPage(p) { reassortPage = p; displayReassort(); }

function calculerReassort() {
    const { groupes, cleVente } = indexReferences();
    const d7 = ilYA(7), d14 = ilYA(14), d30 = ilYA(30), d90 = ilYA(90);
    const st = new Map();
    const get = (cle) => { if (!st.has(cle)) st.set(cle, { v7: 0, v14: 0, v30: 0, v90: 0, r90: 0, derniere: '', enCommande: 0, dernierAchat: null }); return st.get(cle); };
    ventes.forEach(v => {
        const cle = cleVente(v); if (!cle) return;
        const d = String(v.date_vente || '').slice(0, 10), q = v.quantite || 1, s = get(cle);
        if (d > s.derniere) s.derniere = d;
        if (d >= d90) s.v90 += q;
        if (d >= d30) s.v30 += q;
        if (d >= d14) s.v14 += q;
        if (d >= d7) s.v7 += q;
    });
    const parIdP = new Map(products.map(p => [p.id, p]));
    retours.forEach(r => {
        if (!r.produit_id || String(r.date_retour || '') < d90) return;
        const p = parIdP.get(r.produit_id); if (!p) return;
        get(cleProduit(p)).r90 += Math.abs(r.quantite || 1);
    });
    // Achats : ce qui est déjà commandé et pas encore reçu, et le dernier prix payé
    const cleAchat = (a) => a.asin ? 'A:' + String(a.asin).trim().toUpperCase() : 'E:' + String(a.ean || '').trim();
    achats.forEach(a => {
        const cles = [cleAchat(a)];
        if (a.asin && a.ean) cles.push('E:' + String(a.ean).trim());
        cles.forEach(cle => {
            if (!groupes.has(cle) && !st.has(cle)) return;
            const s = get(cle);
            if (!a.recu) s.enCommande += achatReste(a);
            if (!s.dernierAchat || String(a.date_achat || '') > String(s.dernierAchat.date_achat || '')) s.dernierAchat = a;
        });
    });
    const lignes = [];
    groupes.forEach((g, cle) => {
        const s = st.get(cle) || { v7: 0, v14: 0, v30: 0, v90: 0, r90: 0, derniere: '', enCommande: 0, dernierAchat: null };
        if (g.stock <= 0 && s.v90 <= 0) return;
        const vitesse = s.v30 > 0 ? s.v30 / 30 : s.v90 / 90;            // unités par jour
        const jours = vitesse > 0 ? g.stock / vitesse : Infinity;
        const ecoulement = (s.v30 + g.stock) > 0 ? s.v30 / (s.v30 + g.stock) : 0;
        let statut = 'ok';
        if (g.stock <= 0 && vitesse > 0) statut = 'rupture';
        else if (vitesse > 0 && jours < reassortCouverture) statut = 'a_racheter';
        else if (g.stock > 0 && s.v90 === 0) statut = 'dormant';
        const suggestion = vitesse > 0 ? Math.max(0, Math.ceil(vitesse * reassortCouverture - g.stock - s.enCommande)) : 0;
        lignes.push({ ...g, ...s, vitesse, jours, ecoulement, statut, suggestion });
    });
    return lignes;
}

function displayReassort() {
    const c = document.getElementById('reassort-container');
    if (!c) return;
    const toutes = calculerReassort();
    const n = (s) => toutes.filter(l => l.statut === s).length;
    const p = document.getElementById('reassort-pastilles');
    if (p) p.innerHTML = pastillesHtml([['a_racheter', 'À racheter', n('a_racheter') + n('rupture')], ['rupture', 'En rupture', n('rupture')], ['dormant', 'Sans vente depuis 90 j', n('dormant')], ['ok', 'Stock suffisant', n('ok')], ['tous', 'Tout', toutes.length]], reassortFiltre, 'setReassortFiltre');
    const sel = document.getElementById('reassort-couverture');
    if (sel && String(sel.value) !== String(reassortCouverture)) sel.value = String(reassortCouverture);

    const q = (document.getElementById('reassort-search')?.value || '').trim().toLowerCase();
    let liste = toutes;
    if (reassortFiltre === 'a_racheter') liste = liste.filter(l => l.statut === 'a_racheter' || l.statut === 'rupture');
    else if (reassortFiltre !== 'tous') liste = liste.filter(l => l.statut === reassortFiltre);
    if (q) liste = liste.filter(l => (l.nom || '').toLowerCase().includes(q) || (l.ean || '').includes(q) || (l.asin || '').toLowerCase().includes(q));
    const tri = document.getElementById('reassort-tri')?.value || 'urgence';
    const tris = {
        urgence: (a, b) => (a.jours - b.jours) || (b.v30 - a.v30),
        v30: (a, b) => b.v30 - a.v30,
        stock: (a, b) => b.stock - a.stock,
        derniere: (a, b) => String(b.derniere).localeCompare(String(a.derniere)),
        suggestion: (a, b) => b.suggestion - a.suggestion,
    };
    liste.sort(tris[tri] || tris.urgence);
    const cle = [reassortFiltre, q, tri, reassortCouverture].join('|');
    if (cle !== reassortCleFiltres) { reassortCleFiltres = cle; reassortPage = 1; }

    const resume = document.getElementById('reassort-resume');
    const derniereVente = ventes.filter(v => String(v.canal || '').startsWith('Amazon')).reduce((m, v) => String(v.date_vente || '') > m ? String(v.date_vente) : m, '');
    if (resume) resume.innerHTML = `${n('a_racheter') + n('rupture')} référence(s) à racheter pour tenir ${reassortCouverture} jours · ${n('dormant')} sans vente depuis 90 jours`
        + (derniereVente && derniereVente < ilYA(3) ? ` · <span style="color:var(--danger);">dernière vente Amazon enregistrée le ${new Date(derniereVente + 'T12:00:00').toLocaleDateString('fr-FR')} : importez les ventes récentes pour des chiffres justes</span>` : '');

    if (!liste.length) { c.innerHTML = '<div class="empty-state"><h3>Rien dans ce filtre</h3></div>'; return; }
    const { tranche, page, barre } = paginer(liste, reassortPage, 50, 'reassortGoPage');
    reassortPage = page;
    const pillStatut = { a_racheter: '<span class="pill pill-warn">À racheter</span>', rupture: '<span class="pill pill-danger">Rupture</span>', dormant: '<span class="pill pill-neutre">Dormant</span>', ok: '<span class="pill pill-ok">OK</span>' };
    let h = `<div class="products-table"><table class="achats-table"><thead><tr><th>Produit</th><th class="num">Stock</th><th class="num">7 j</th><th class="num">14 j</th><th class="num">30 j</th><th class="num">90 j</th><th class="num" title="Unités remboursées aux clients sur 90 jours">Remb.</th><th class="num" title="Ventes 30 j ÷ (ventes 30 j + stock)">Écoul.</th><th class="num">Jours de stock</th><th>Statut</th><th class="num" title="Pour tenir ${reassortCouverture} jours, déduction faite du stock et des achats non reçus">À commander</th><th>Liens</th></tr></thead><tbody>`;
    tranche.forEach(l => {
        const da = l.dernierAchat;
        const jours = l.jours === Infinity ? '–' : (l.jours < 1 ? '< 1' : Math.round(l.jours));
        h += `<tr style="cursor:default;">
            <td class="c-prod"><div class="achat-nom">${escapeHtml(l.nom || '-')}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(l.ean, 'EAN')}<span class="code-lib">EAN</span><span>${escapeHtml(l.ean || '-')}</span></span><span class="code-copiable">${boutonCopier(l.asin, 'ASIN')}<span class="code-lib">ASIN</span><span>${escapeHtml(l.asin || '-')}</span></span></div>
                <div class="sous-prix">${l.derniere ? 'Dernière vente le ' + new Date(l.derniere + 'T12:00:00').toLocaleDateString('fr-FR') : 'Aucune vente enregistrée'}${da ? ` · dernier achat ${(da.prix_ttc || 0).toFixed(2)} € TTC chez ${escapeHtml(da.fournisseur_nom || '?')}` : ''}${l.prixAchat > 0 ? '' : ' · ' + badgeSansCout()}</div></td>
            <td class="num" data-l="Stock"><strong>${l.stock}</strong><div class="sous-prix">${l.fba ? 'FBA ' + l.fba + ' ' : ''}${l.fbm ? 'FBM ' + l.fbm + ' ' : ''}${l.entrepot ? 'Ent. ' + l.entrepot : ''}</div></td>
            <td class="num" data-l="7 j">${l.v7}</td><td class="num" data-l="14 j">${l.v14}</td><td class="num" data-l="30 j"><strong>${l.v30}</strong></td><td class="num" data-l="90 j">${l.v90}</td>
            <td class="num" data-l="Remb.">${l.r90 || '–'}</td>
            <td class="num" data-l="Écoul.">${Math.round(l.ecoulement * 100)} %</td>
            <td class="num" data-l="Jours">${jours}</td>
            <td>${pillStatut[l.statut]}</td>
            <td class="num" data-l="À commander"><strong>${l.suggestion || '–'}</strong>${l.enCommande ? `<div class="sous-prix">${l.enCommande} déjà en commande</div>` : ''}</td>
            <td class="c-actions"><div class="achat-actions">${liensProduit(l.asin, true)}</div></td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>' + barre;
}
function exportReassort() {
    const l = calculerReassort();
    if (!l.length) return toastError('Aucune donnée', 'Rien à exporter.');
    telechargerCsv([['Produit', 'EAN', 'ASIN', 'Stock', 'FBA', 'FBM', 'Entrepôt', 'Vendu 7 j', 'Vendu 14 j', 'Vendu 30 j', 'Vendu 90 j', 'Remboursés 90 j', 'Écoulement 30 j %', 'Jours de stock', 'Statut', 'En commande', 'À commander', 'Dernière vente', 'Dernier prix TTC', 'Dernier fournisseur'],
        ...l.map(x => [x.nom, x.ean, x.asin, x.stock, x.fba, x.fbm, x.entrepot, x.v7, x.v14, x.v30, x.v90, x.r90, Math.round(x.ecoulement * 100), x.jours === Infinity ? '' : Math.round(x.jours), x.statut, x.enCommande, x.suggestion, x.derniere, x.dernierAchat ? x.dernierAchat.prix_ttc : '', x.dernierAchat ? x.dernierAchat.fournisseur_nom : ''])],
        `reassort-${isoJour(new Date())}.csv`);
}

// ═══════ 2. MEILLEURS PRODUITS ═══════
let classementPeriode = '90', classementCritere = 'benefice', classementOrdre = 'meilleurs', classementPage = 1, classementCle = null;
function setClassementPeriode(v) { classementPeriode = v; displayClassement(); }
function setClassementCritere(v) { classementCritere = v; displayClassement(); }
function setClassementOrdre(v) { classementOrdre = v; displayClassement(); }
function classementGoPage(p) { classementPage = p; displayClassement(); }
function debutPeriode(code) {
    if (code === 'tout') return '';
    if (code === 'annee') return new Date().getFullYear() + '-01-01';
    if (code === 'mois') return isoJour(new Date()).slice(0, 8) + '01';
    return ilYA(Number(code));
}
function displayClassement() {
    const c = document.getElementById('classement-container');
    if (!c) return;
    const debut = debutPeriode(classementPeriode);
    const { parId, cleVente } = indexReferences();
    const g = new Map();
    ventes.forEach(v => {
        if (debut && String(v.date_vente || '').slice(0, 10) < debut) return;
        const cle = cleVente(v); if (!cle) return;
        const p = v.produit_id ? parId.get(v.produit_id) : null;
        if (!g.has(cle)) g.set(cle, { cle, nom: p?.nom || v.produit_nom || '', ean: p?.ean || v.produit_ean || '', asin: String(p?.asin || '').toUpperCase(), unites: 0, ca: 0, cout: 0, frais: 0, benefice: 0, sansCout: 0, retours: 0, ventesIds: new Set() });
        const x = g.get(cle), q = v.quantite || 1;
        x.unites += q; x.ca += v.prix_total || 0; x.frais += v.frais || 0; x.benefice += v.benefice || 0;
        x.cout += (v.prix_achat_unitaire || 0) * q;
        if (!(v.prix_achat_unitaire > 0)) x.sansCout += q;
        x.ventesIds.add(v.id);
    });
    retours.forEach(r => {
        if (debut && String(r.date_retour || '') < debut) return;
        const p = r.produit_id ? parId.get(r.produit_id) : null; if (!p) return;
        const x = g.get(cleProduit(p)); if (x) x.retours += Math.abs(r.quantite || 1);
    });
    let liste = [...g.values()].map(x => ({ ...x, marge: x.ca > 0 ? x.benefice / x.ca : NaN, roi: x.cout > 0 ? x.benefice / x.cout : NaN, tauxRetour: x.unites > 0 ? x.retours / x.unites : 0 }));
    const ratio = classementCritere === 'roi' || classementCritere === 'marge';
    if (ratio) liste = liste.filter(x => x.unites >= 2 && x.cout > 0 && isFinite(x[classementCritere]));
    const val = (x) => ({ benefice: x.benefice, roi: x.roi, marge: x.marge, unites: x.unites, ca: x.ca })[classementCritere];
    liste.sort((a, b) => classementOrdre === 'meilleurs' ? val(b) - val(a) : val(a) - val(b));
    const q = (document.getElementById('classement-search')?.value || '').trim().toLowerCase();
    const rang = new Map(liste.map((x, i) => [x.cle, i + 1]));
    if (q) liste = liste.filter(x => (x.nom || '').toLowerCase().includes(q) || (x.ean || '').includes(q) || (x.asin || '').toLowerCase().includes(q));
    const cle = [classementPeriode, classementCritere, classementOrdre, q].join('|');
    if (cle !== classementCle) { classementCle = cle; classementPage = 1; }

    const set = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
    set('classement-periode', pastillesHtml([['mois', 'Ce mois-ci'], ['30', '30 jours'], ['90', '90 jours'], ['annee', 'Cette année'], ['tout', 'Depuis le début']], classementPeriode, 'setClassementPeriode'));
    set('classement-critere', pastillesHtml([['benefice', 'Bénéfice'], ['roi', 'ROI'], ['marge', 'Marge'], ['unites', 'Unités'], ['ca', "Chiffre d'affaires"]], classementCritere, 'setClassementCritere')
        + '<span class="pastilles-sep">Ordre :</span>' + pastillesHtml([['meilleurs', 'Meilleurs'], ['pires', 'Pires']], classementOrdre, 'setClassementOrdre'));
    const totB = [...g.values()].reduce((s, x) => s + x.benefice, 0);
    set('classement-resume', `${g.size} produits vendus sur la période · ${fmtEur(totB)} de bénéfice` + (ratio ? ' · ROI et marge : produits vendus au moins 2 fois, prix d\'achat connu' : ''));

    if (!liste.length) { c.innerHTML = '<div class="empty-state"><h3>Aucune vente sur cette période</h3></div>'; return; }
    const { tranche, page, barre } = paginer(liste, classementPage, 25, 'classementGoPage');
    classementPage = page;
    const fort = (k) => classementCritere === k ? ' style="color:var(--text-1);"' : '';
    let h = `<div class="products-table"><table class="achats-table"><thead><tr><th class="num">Rang</th><th>Produit</th><th class="num"${fort('unites')}>Unités</th><th class="num"${fort('ca')}>CA</th><th class="num"${fort('benefice')}>Bénéfice</th><th class="num"${fort('marge')}>Marge</th><th class="num"${fort('roi')}>ROI</th><th class="num">Retours</th><th>Liens</th></tr></thead><tbody>`;
    tranche.forEach(x => {
        const couleur = x.benefice >= 0 ? 'var(--success)' : 'var(--danger)';
        h += `<tr style="cursor:default;">
            <td class="num" data-l="Rang"><strong>${rang.get(x.cle)}</strong></td>
            <td class="c-prod"><div class="achat-nom">${escapeHtml(x.nom || '-')}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(x.ean, 'EAN')}<span class="code-lib">EAN</span><span>${escapeHtml(x.ean || '-')}</span></span><span class="code-copiable">${boutonCopier(x.asin, 'ASIN')}<span class="code-lib">ASIN</span><span>${escapeHtml(x.asin || '-')}</span></span></div>${x.sansCout ? '<div style="margin-top:4px;">' + badgeSansCout(x.sansCout + ' unité(s) vendue(s) sans prix d\'achat : bénéfice surestimé') + '</div>' : ''}</td>
            <td class="num" data-l="Unités">${x.unites}</td>
            <td class="num" data-l="CA">${fmtEur(x.ca)}</td>
            <td class="num" data-l="Bénéfice" style="color:${couleur};"><strong>${x.benefice >= 0 ? '+' : ''}${fmtEur(x.benefice)}</strong></td>
            <td class="num" data-l="Marge">${pct(x.marge)}</td>
            <td class="num" data-l="ROI">${pct(x.roi)}</td>
            <td class="num" data-l="Retours">${x.retours ? x.retours + ' (' + Math.round(x.tauxRetour * 100) + ' %)' : '–'}</td>
            <td class="c-actions"><div class="achat-actions">${liensProduit(x.asin, true)}</div></td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>' + barre;
}

// ═══════ 5. OPÉRATIONS AMAZON HORS VENTES (remboursements FBA, frais…) ═══════
// Virements d'Amazon vers votre banque (et leurs corrections) : ce ne sont pas des frais
const RE_TRANSFERT = /^(transf|übertrag|trasferiment|overboeking|overdracht|przelew|överföring)/i;
function categoriserOperation(type, desc) {
    const t = String(type || ''), d = String(desc || '');
    if (RE_TRANSFERT.test(t) || /compte se terminant|account ending|auf das konto|auszahlung|sul conto|bonifico|a la cuenta|cuenta que termina|rekening eindigend/i.test(d)) return 'transfert';
    if (/rembours\w*\s+(de\s+)?stock|reimburse|erstattung.*(lager|versand durch amazon)|rimborso.*(inventario|magazzino|logistica)|reembolso.*(inventario|log[ií]stica)|vergoeding.*voorraad/i.test(d)) return 'remboursement_fba';
    if (/transport entrant|inbound transport|inbound placement|eingangsversand|eingehende|frachtkosten|transport zum amazon|trasporto in entrata|trasporto verso|transporte de entrada|transporte a amazon|inkomend transport|placement/i.test(d)) return 'transport';
    if (/stockage|storage|lagergeb|lagerung|stoccaggio|almacenamiento|opslag/i.test(d)) return 'stockage';
    if (/inscription|subscription|abonnement|abbonamento|suscripci/i.test(d)) return 'abonnement';
    if (/[ée]tiquette|label|etikett|etichetta|etiqueta|postage/i.test(d) || /services d'exp|shipping services/i.test(t)) return 'expedition';
    if (/[ée]co-contribution|\bREP\b|\bEPR\b|entsorgung|raee/i.test(d)) return 'eco';
    return 'autre';
}
const LIB_CATEGORIE = { remboursement_fba: 'Remboursements FBA', transport: 'Transport entrant', stockage: 'Stockage FBA', abonnement: 'Abonnement Amazon', expedition: "Étiquettes d'expédition", eco: 'Éco-contribution (REP)', autre: 'Autres frais (retours de stock, corrections…)' };

// Appelé par l'aperçu du rapport de transactions : garde les lignes qui ne sont ni une commande ni un remboursement client
function preparerOperationsAmazon(all, hIdx, col) {
    const cType = col.type, cDesc = col.desc, cTotal = col.total, cDate = col.date, cSku = col.sku, cQty = col.qty, cMarket = col.market, cOrder = col.order, cVers = col.versement;
    const skuVersProduit = new Map();
    retours.forEach(r => { if (r.sku && r.produit_id) skuVersProduit.set(String(r.sku).toUpperCase(), r.produit_id); });
    products.forEach(p => { if (p.ean) skuVersProduit.set(String(p.ean).toUpperCase(), skuVersProduit.get(String(p.ean).toUpperCase()) || p.id); if (p.asin) skuVersProduit.set(String(p.asin).toUpperCase(), skuVersProduit.get(String(p.asin).toUpperCase()) || p.id); });
    const parId = new Map(products.map(p => [p.id, p]));
    const deja = new Set(amazonOps.map(o => o.cle));
    const vues = new Set();
    const lignes = [];
    for (let i = hIdx + 1; i < all.length; i++) {
        const r = all[i];
        if (!r || r.length < 10) continue;
        const type = String(r[cType] || '').trim();
        if (!type) continue;
        const tl = type.toLowerCase();
        if (tl.includes('commande') || tl === 'order' || tl.includes('remboursement') || tl.includes('refund')) continue;
        const desc = cDesc > -1 ? String(r[cDesc] || '').trim() : '';
        const categorie = categoriserOperation(type, desc);
        if (categorie === 'transfert') continue;
        const total = parseMontantFR(cTotal > -1 ? r[cTotal] : 0);
        if (!total) continue;
        const sku = cSku > -1 ? String(r[cSku] || '').trim() : '';
        const brutDate = cDate > -1 ? r[cDate] : '';
        const cle = [brutDate, type, desc, sku, cOrder > -1 ? r[cOrder] : '', cVers > -1 ? r[cVers] : '', total.toFixed(2)].join('|');
        if (vues.has(cle)) continue;
        vues.add(cle);
        const pid = sku ? (skuVersProduit.get(sku.toUpperCase()) || null) : null;
        lignes.push({
            cle, nouveau: !deja.has(cle), date_op: parseDateTransaction(brutDate), type, categorie, description: desc, sku,
            produit_id: pid, produit_nom: pid ? (parId.get(pid)?.nom || '') : '',
            quantite: Math.abs(cQty > -1 ? (parseInt(r[cQty]) || 0) : 0),
            marketplace: cMarket > -1 ? String(r[cMarket] || '').trim() : '', total: parseFloat(total.toFixed(2)),
        });
    }
    opsImportData = lignes;
    majBlocOpsImport();
}
function majBlocOpsImport() {
    const bloc = document.getElementById('ops-import-bloc'), texte = document.getElementById('ops-import-texte'), btn = document.getElementById('ops-save-btn');
    if (!bloc) return;
    const tous = opsImportData || [], nv = tous.filter(x => x.nouveau);
    bloc.style.display = tous.length ? 'flex' : 'none';
    if (!tous.length) return;
    const rfba = nv.filter(x => x.categorie === 'remboursement_fba'), frais = nv.filter(x => x.categorie !== 'remboursement_fba');
    texte.textContent = opsTableAbsente
        ? `${tous.length} opération(s) Amazon hors ventes dans ce rapport (remboursements FBA, frais de stockage, transport…). Pour les enregistrer, exécutez d'abord migration-amazon-v2.sql dans Supabase puis rechargez la page.`
        : nv.length
            ? `${rfba.length} remboursement(s) FBA (${fmtEur(rfba.reduce((s, x) => s + x.total, 0))}) et ${frais.length} frais Amazon hors ventes (${fmtEur(frais.reduce((s, x) => s + x.total, 0))}) à enregistrer · ${tous.length - nv.length} déjà enregistré(s).`
            : `Les ${tous.length} opérations Amazon hors ventes de ce rapport sont déjà enregistrées.`;
    btn.style.display = (nv.length && !opsTableAbsente) ? '' : 'none';
    btn.textContent = `Enregistrer ${nv.length} opération${nv.length > 1 ? 's' : ''}`;
}
async function confirmOpsImport() {
    if (opsImportEnCours) return;
    const nv = (opsImportData || []).filter(x => x.nouveau);
    if (!nv.length) return;
    opsImportEnCours = true;
    const btn = document.getElementById('ops-save-btn');
    if (btn) btn.disabled = true;
    try {
        const uid = getEffectiveUserId();
        let ok = 0, erreur = null;
        for (let i = 0; i < nv.length; i += 200) {
            const lot = nv.slice(i, i + 200).map(({ nouveau, ...x }) => ({ ...x, user_id: uid }));
            const { error } = await sb.from('amazon_operations').upsert(lot, { onConflict: 'user_id,cle', ignoreDuplicates: true });
            if (error) { erreur = error.message; break; }
            ok += lot.length;
        }
        if (erreur) toastError('Enregistrement incomplet', `${ok} enregistrée(s), puis : ${erreur}`);
        else toastSuccess('Opérations enregistrées', `${ok} opération(s) Amazon ajoutée(s) : voir Ventes › Remboursements FBA et Achats › Fournitures & frais.`);
        await loadAmazonOps();
        const cles = new Set(amazonOps.map(o => o.cle));
        (opsImportData || []).forEach(x => { x.nouveau = !cles.has(x.cle); });
        majBlocOpsImport();
        updateDashboard();
    } finally {
        opsImportEnCours = false;
        if (btn) btn.disabled = false;
    }
}

// Page « Remboursements FBA »
let rfbaPeriode = 'annee', rfbaMotif = '', rfbaPage = 1;
function setRfbaPeriode(v) { rfbaPeriode = v; rfbaPage = 1; displayRemboursementsFba(); }
function setRfbaMotif(v) { rfbaMotif = v; rfbaPage = 1; displayRemboursementsFba(); }
function rfbaGoPage(p) { rfbaPage = p; displayRemboursementsFba(); }
function motifRemboursement(desc) {
    const d = String(desc || '');
    if (/entrant|inbound|eingang|entrata|entrada|inkomend/i.test(d)) return /endommag|damag|besch|danneg|da[ñn]ad|beschadig/i.test(d) ? 'Abîmé à la réception' : 'Perdu à la réception';
    if (/retour client|customer return|kundenr|reso cliente|devoluci|klantretour/i.test(d)) return 'Retour client non revenu';
    if (/endommag|damag|besch|danneg|da[ñn]ad|beschadig/i.test(d)) return 'Abîmé en entrepôt';
    if (/perdu|lost|verloren|smarrit|perdid/i.test(d)) return 'Perdu en entrepôt';
    return 'Autre';
}
function displayRemboursementsFba() {
    const c = document.getElementById('rfba-container');
    if (!c) return;
    const aide = document.getElementById('rfba-aide');
    if (aide) aide.style.display = opsTableAbsente ? '' : 'none';
    const debut = debutPeriode(rfbaPeriode);
    const tous = amazonOps.filter(o => o.categorie === 'remboursement_fba' && (!debut || String(o.date_op || '') >= debut));
    const motifs = {};
    tous.forEach(o => { const m = motifRemboursement(o.description); motifs[m] = motifs[m] || { n: 0, total: 0 }; motifs[m].n++; motifs[m].total += Number(o.total) || 0; });
    const set = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
    set('rfba-periode', pastillesHtml([['mois', 'Ce mois-ci'], ['30', '30 jours'], ['90', '90 jours'], ['annee', 'Cette année'], ['tout', 'Depuis le début']], rfbaPeriode, 'setRfbaPeriode'));
    set('rfba-motifs', pastillesHtml([['', 'Tous', tous.length], ...Object.entries(motifs).sort((a, b) => b[1].total - a[1].total).map(([m, x]) => [m, m, x.n])], rfbaMotif, 'setRfbaMotif'));
    const total = tous.reduce((s, o) => s + (Number(o.total) || 0), 0);
    set('rfba-resume', `${fmtEur(total)} versés par Amazon pour ${tous.reduce((s, o) => s + (o.quantite || 0), 0)} unité(s) · ` + Object.entries(motifs).sort((a, b) => b[1].total - a[1].total).map(([m, x]) => `${m} ${fmtEur(x.total)}`).join(' · '));
    let liste = rfbaMotif ? tous.filter(o => motifRemboursement(o.description) === rfbaMotif) : tous;
    if (!liste.length) { c.innerHTML = `<div class="empty-state"><h3>Aucun remboursement FBA</h3><p>${opsTableAbsente ? 'Exécutez migration-amazon-v2.sql dans Supabase.' : 'Ils arrivent avec le rapport de transactions (extension, bouton « Frais »), puis « Enregistrer les opérations » dans Import Amazon.'}</p></div>`; return; }
    const { tranche, page, barre } = paginer(liste, rfbaPage, 50, 'rfbaGoPage');
    rfbaPage = page;
    const parId = new Map(products.map(p => [p.id, p]));
    let h = '<div class="products-table"><table class="achats-table"><thead><tr><th>Date</th><th>Produit</th><th>Motif</th><th class="num">Qté</th><th class="num">Montant</th><th>Pays</th></tr></thead><tbody>';
    tranche.forEach(o => {
        const p = o.produit_id ? parId.get(o.produit_id) : null;
        const m = Number(o.total) || 0;
        h += `<tr style="cursor:default;">
            <td style="white-space:nowrap;">${o.date_op ? new Date(o.date_op + 'T12:00:00').toLocaleDateString('fr-FR') : '-'}</td>
            <td class="c-prod"><div class="achat-nom">${escapeHtml(p?.nom || o.produit_nom || 'Produit non identifié')}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(o.sku, 'SKU')}<span class="code-lib">SKU</span><span>${escapeHtml(o.sku || '-')}</span></span>${p?.asin ? `<span class="code-copiable">${boutonCopier(p.asin, 'ASIN')}<span class="code-lib">ASIN</span><span>${escapeHtml(p.asin)}</span></span>` : ''}</div></td>
            <td><span class="pill ${m < 0 ? 'pill-danger' : 'pill-ok'}">${m < 0 ? 'Repris par Amazon' : escapeHtml(motifRemboursement(o.description))}</span><div class="sous-prix">${escapeHtml(o.description || '')}</div></td>
            <td class="num" data-l="Qté">${o.quantite || '–'}</td>
            <td class="num" data-l="Montant" style="color:${m >= 0 ? 'var(--success)' : 'var(--danger)'};"><strong>${m >= 0 ? '+' : ''}${fmtEur(m)}</strong></td>
            <td>${badgePays(o.marketplace)}</td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>' + barre;
}

// ═══════ 9. CHARGES : frais Amazon hors ventes + abonnements ═══════
function coutMensuelAbonnement(f) {
    const m = (f.prix_ttc || 0) * (f.quantite || 1);
    return f.recurrent === 'mensuel' ? m : f.recurrent === 'annuel' ? m / 12 : 0;
}
// Fournitures et abonnements imputés sur [debut, fin] (dates ISO ; debut vide = depuis le début)
function chargesInternesPeriode(debut, fin) {
    const finD = new Date((fin || isoJour(new Date())) + 'T12:00:00');
    let ponctuel = 0, abonnements = 0;
    fournitures.forEach(f => {
        const d = String(f.date_achat || '').slice(0, 10);
        if (!f.recurrent) {
            if (d && (!debut || d >= debut) && (!fin || d <= fin)) ponctuel += (f.prix_ttc || 0) * (f.quantite || 1);
            return;
        }
        const depart = new Date(((debut && debut > d) ? debut : d || debut || isoJour(new Date())) + 'T12:00:00');
        const jours = Math.max(0, (finD - depart) / 86400000);
        abonnements += coutMensuelAbonnement(f) * jours / 30.44;
    });
    return { ponctuel, abonnements };
}
function displayChargesAmazon() {
    const c = document.getElementById('charges-amazon');
    if (!c) return;
    const abos = fournitures.filter(f => f.recurrent);
    const parMois = abos.reduce((s, f) => s + coutMensuelAbonnement(f), 0);
    const colonnes = [['30 jours', ilYA(30)], ['Cette année', new Date().getFullYear() + '-01-01'], ['Depuis le début', '']];
    const cats = ['transport', 'stockage', 'abonnement', 'expedition', 'eco', 'autre'];
    const somme = (cat, debut) => amazonOps.filter(o => o.categorie === cat && (!debut || String(o.date_op || '') >= debut)).reduce((s, o) => s + (Number(o.total) || 0), 0);
    let h = `<div class="charges-grille"><div class="charges-bloc"><h3>Abonnements</h3>`;
    h += abos.length
        ? `<div class="resume-ligne" style="margin-bottom:8px;"><strong>${fmtEur(parMois)}</strong> par mois · ${fmtEur(parMois * 12)} par an</div><table class="charges-table"><tbody>${abos.map(f => `<tr><td>${escapeHtml(f.nom)}</td><td class="num">${fmtEur(coutMensuelAbonnement(f))} / mois</td><td class="sous-prix">${f.recurrent === 'annuel' ? 'annuel' : 'mensuel'}</td></tr>`).join('')}</tbody></table>`
        : `<p class="resume-ligne">Aucun abonnement. Ajoutez SellerAmp, Taxually, Keepa… avec « Ajouter » et le champ <strong>Récurrent</strong> sur « Mensuel » ou « Annuel ». L'abonnement vendeur Amazon est déjà compté à droite, ne le saisissez pas.</p>`;
    h += `</div><div class="charges-bloc"><h3>Frais Amazon hors ventes</h3>`;
    if (opsTableAbsente) h += '<p class="resume-ligne">Exécutez migration-amazon-v2.sql dans Supabase pour les enregistrer.</p>';
    else if (!amazonOps.length) h += '<p class="resume-ligne">Ils arrivent avec le rapport de transactions Amazon (Import Amazon, « Enregistrer les opérations »).</p>';
    else {
        h += `<table class="charges-table"><thead><tr><th></th>${colonnes.map(x => `<th class="num">${x[0]}</th>`).join('')}</tr></thead><tbody>`;
        cats.forEach(cat => {
            const v = colonnes.map(x => somme(cat, x[1]));
            if (v.every(x => !x)) return;
            h += `<tr><td>${LIB_CATEGORIE[cat]}</td>${v.map(x => `<td class="num" style="color:${x < 0 ? 'var(--danger)' : 'var(--success)'};">${fmtEur(x)}</td>`).join('')}</tr>`;
        });
        const tot = colonnes.map(x => cats.reduce((s, cat) => s + somme(cat, x[1]), 0));
        h += `<tr class="charges-total"><td>Total</td>${tot.map(x => `<td class="num">${fmtEur(x)}</td>`).join('')}</tr></tbody></table>`;
    }
    c.innerHTML = h + '</div></div>';
}

// ═══════ 6. ENVOIS FBA ═══════
let envoisFiltre = 'ecart', envoisPage = 1;
function setEnvoisFiltre(v) { envoisFiltre = v; envoisPage = 1; displayEnvoisFba(); }
function envoisGoPage(p) { envoisPage = p; displayEnvoisFba(); }
const STATUT_ENVOI = { WORKING: 'En préparation', READY_TO_SHIP: 'Prêt à expédier', SHIPPED: 'Expédié', IN_TRANSIT: 'En transit', DELIVERED: 'Livré', CHECKED_IN: 'Arrivé', RECEIVING: 'En réception', CLOSED: 'Clôturé', CANCELLED: 'Annulé', DELETED: 'Supprimé', ERROR: 'Erreur' };
function ecartEnvoi(e) { return Math.max(0, (e.qte_envoyee || 0) - (e.qte_recue || 0)); }
function displayEnvoisFba() {
    const c = document.getElementById('envois-container');
    if (!c) return;
    const aide = document.getElementById('envois-aide-migration');
    if (aide) aide.style.display = envoisTableAbsente ? '' : 'none';
    const actifs = envoisFba.filter(e => !['CANCELLED', 'DELETED'].includes(e.statut));
    const clotures = actifs.filter(e => e.statut === 'CLOSED');
    const avecEcart = actifs.filter(e => ecartEnvoi(e) > 0 && ['CLOSED', 'RECEIVING', 'CHECKED_IN', 'DELIVERED'].includes(e.statut));
    const aTraiter = avecEcart.filter(e => e.statut === 'CLOSED' && !e.traite);
    const set = (id, html) => { const x = document.getElementById(id); if (x) x.innerHTML = html; };
    set('envois-pastilles', pastillesHtml([['ecart', 'Écart à vérifier', aTraiter.length], ['reception', 'En réception', actifs.filter(e => ['RECEIVING', 'CHECKED_IN', 'DELIVERED'].includes(e.statut)).length], ['tous_ecarts', 'Tous les écarts', avecEcart.length], ['tous', 'Tous', actifs.length]], envoisFiltre, 'setEnvoisFiltre'));
    const manq = clotures.reduce((s, e) => s + ecartEnvoi(e), 0);
    const maj = envoisFba.reduce((m, e) => String(e.updated_at || e.created_at || '') > m ? String(e.updated_at || e.created_at) : m, '');
    set('envois-resume', actifs.length
        ? `${actifs.length} envois · ${actifs.reduce((s, e) => s + (e.qte_envoyee || 0), 0)} unités envoyées, ${actifs.reduce((s, e) => s + (e.qte_recue || 0), 0)} reçues · <strong style="color:${manq ? 'var(--danger)' : 'var(--success)'};">${manq} unité(s) manquante(s) sur les envois clôturés</strong>`
        : 'Aucun envoi enregistré. Cliquez sur « Récupérer les envois FBA » dans l\'extension Stock Radar.');
    let liste = envoisFiltre === 'ecart' ? aTraiter : envoisFiltre === 'tous_ecarts' ? avecEcart : envoisFiltre === 'reception' ? actifs.filter(e => ['RECEIVING', 'CHECKED_IN', 'DELIVERED'].includes(e.statut)) : actifs;
    if (!liste.length) { c.innerHTML = `<div class="empty-state"><h3>${envoisFiltre === 'ecart' && actifs.length ? 'Aucun écart à vérifier' : 'Aucun envoi dans ce filtre'}</h3></div>`; return; }
    const { tranche, page, barre } = paginer(liste, envoisPage, 50, 'envoisGoPage');
    envoisPage = page;
    let h = '<div class="products-table"><table class="achats-table"><thead><tr><th>Envoi</th><th>Statut</th><th>Créé</th><th>Mis à jour</th><th class="num">SKU</th><th class="num">Envoyés</th><th class="num">Reçus</th><th class="num">Écart</th><th>Vérifié</th></tr></thead><tbody>';
    tranche.forEach(e => {
        const ec = ecartEnvoi(e);
        const pill = e.statut === 'CLOSED' ? 'pill-ok' : ['RECEIVING', 'CHECKED_IN', 'DELIVERED'].includes(e.statut) ? 'pill-info' : 'pill-neutre';
        h += `<tr style="cursor:default;">
            <td class="c-prod"><div class="achat-nom">${escapeHtml(e.nom || e.shipment_id)}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(e.shipment_id, 'n° d\'envoi')}<span>${escapeHtml(e.shipment_id)}</span></span>${e.destination ? `<span class="code-lib">vers ${escapeHtml(e.destination)}</span>` : ''}</div></td>
            <td><span class="pill ${pill}">${escapeHtml(STATUT_ENVOI[e.statut] || e.statut || '-')}</span></td>
            <td style="white-space:nowrap;" data-l="Créé">${e.date_creation ? new Date(e.date_creation).toLocaleDateString('fr-FR') : '-'}</td>
            <td style="white-space:nowrap;" data-l="Mis à jour">${e.date_maj ? new Date(e.date_maj).toLocaleDateString('fr-FR') : '-'}</td>
            <td class="num" data-l="SKU">${e.nb_sku || '–'}</td>
            <td class="num" data-l="Envoyés">${e.qte_envoyee || 0}</td>
            <td class="num" data-l="Reçus">${e.qte_recue || 0}</td>
            <td class="num" data-l="Écart">${ec ? `<span class="pill ${e.statut === 'CLOSED' ? 'pill-danger' : 'pill-warn'}">−${ec}</span>` : '–'}</td>
            <td class="c-statut">${ec ? `<label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" ${e.traite ? 'checked' : ''} onchange="toggleEnvoiTraite(${e.id}, this.checked)"> ${e.traite ? 'Oui' : 'Non'}</label>` : ''}</td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>' + barre;
}
async function toggleEnvoiTraite(id, val) {
    const { error } = await sb.from('envois_fba').update({ traite: !!val }).eq('id', id);
    if (error) return toastError('Erreur', error.message);
    const e = envoisFba.find(x => x.id === id); if (e) e.traite = !!val;
    displayEnvoisFba();
    updateDashboard();
}
// Fichier déposé par l'extension : liste JSON des envois lus dans Seller Central
function importerEnvoisFba(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            if (envoisTableAbsente) { toastError('Table manquante', 'Exécutez migration-amazon-v2.sql dans Supabase puis rechargez la page.'); return; }
            const data = JSON.parse(ev.target.result);
            const liste = Array.isArray(data) ? data : (data.envois || []);
            if (!liste.length) return toastInfo('Aucun envoi', 'Le fichier ne contient aucun envoi.');
            const uid = getEffectiveUserId();
            const lignes = liste.filter(s => s.shipmentId).map(s => ({
                user_id: uid, shipment_id: s.shipmentId, nom: s.shipmentName || '', statut: s.shipmentStatus || '',
                destination: s.destinationFC || '', pays: s.fcAddress || '', nb_sku: s.mskus || 0,
                qte_envoyee: s.shippedQuantity || 0, qte_recue: s.receivedQuantity || 0,
                date_creation: s.createdDate ? new Date(s.createdDate).toISOString() : null,
                date_maj: s.lastUpdatedDate ? new Date(s.lastUpdatedDate).toISOString() : null,
            }));
            let ok = 0;
            for (let i = 0; i < lignes.length; i += 200) {
                const { error } = await sb.from('envois_fba').upsert(lignes.slice(i, i + 200), { onConflict: 'user_id,shipment_id' });
                if (error) { toastError('Enregistrement incomplet', error.message); break; }
                ok += Math.min(200, lignes.length - i);
            }
            await loadEnvoisFba();
            toastSuccess('Envois FBA à jour', `${ok} envoi(s) lus dans Seller Central.`);
            switchTab('envois-fba');
            updateDashboard();
        } catch (e) { toastError('Fichier illisible', e.message); }
        finally { input.value = ''; }
    };
    reader.readAsText(file, 'UTF-8');
}

// ═══════ 8. DÉTAIL DU BÉNÉFICE D'UNE VENTE ═══════
function openVenteDetail(id) {
    const v = ventes.find(x => x.id === id);
    if (!v) return;
    const p = v.produit_id ? products.find(x => x.id === v.produit_id) : null;
    const q = v.quantite || 1, ca = v.prix_total || 0, cout = (v.prix_achat_unitaire || 0) * q, frais = v.frais || 0;
    const benef = v.benefice != null ? v.benefice : ca - cout - frais;
    const fraisReels = String(v.notes || '').includes('frais réels');
    const remb = retours.filter(r => r.vente_id === v.id);
    const totalRemb = remb.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const oid = String(v.amazon_order_id || '').split('|')[0];
    const asin = p?.asin || '';
    const ligne = (lib, val, fortement, couleur, detail) => `<div class="detail-ligne${fortement ? ' fort' : ''}"><span>${lib}${detail ? `<small>${detail}</small>` : ''}</span><span style="${couleur ? 'color:' + couleur : ''}">${val}</span></div>`;
    document.getElementById('sr-vente-detail')?.remove();
    const m = document.createElement('div');
    m.id = 'sr-vente-detail';
    m.className = 'sr-tiroir';
    m.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Détail de la vente" class="sr-tiroir-panneau">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div><div class="tiroir-sur">Vente du ${v.date_vente ? new Date(v.date_vente + 'T12:00:00').toLocaleDateString('fr-FR') : '-'}</div>
            <div class="tiroir-titre">${escapeHtml(v.produit_nom || p?.nom || '-')}</div></div>
            <button type="button" class="ico-btn ico-voir" onclick="document.getElementById('sr-vente-detail').remove()" aria-label="Fermer">${ICO('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
        </div>
        <div class="achat-codes" style="margin:6px 0 10px;"><span class="code-copiable">${boutonCopier(v.produit_ean, 'EAN')}<span class="code-lib">EAN</span><span>${escapeHtml(v.produit_ean || '-')}</span></span>${asin ? `<span class="code-copiable">${boutonCopier(asin, 'ASIN')}<span class="code-lib">ASIN</span><span>${escapeHtml(asin)}</span></span>` : ''}${oid ? `<span class="code-copiable">${boutonCopier(oid, 'n° de commande')}<span class="code-lib">Commande</span><span>${escapeHtml(oid)}</span></span>` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;"><span class="pill ${String(v.canal || '').startsWith('Amazon') ? 'pill-info' : 'pill-neutre'}">${escapeHtml(v.canal || 'Autre')}</span>${badgePays(v.marketplace)}${!(v.prix_achat_unitaire > 0) ? badgeSansCout() : ''}</div>
        <div class="detail-calcul">
            ${ligne('Prix de vente', fmtEur(ca), false, '', `${q} × ${fmtEur(v.prix_unitaire || ca / q)} (TTC, payé par le client)`)}
            ${ligne('− Coût d\'achat', '−' + fmtEur(cout), false, '', v.prix_achat_unitaire > 0 ? `${q} × ${fmtEur(v.prix_achat_unitaire)}` : 'prix d\'achat inconnu')}
            ${ligne('− Frais Amazon', '−' + fmtEur(frais), false, '', fraisReels ? 'frais réels du rapport de transactions' : (String(v.canal || '').startsWith('Amazon') ? 'estimation : importez le rapport de transactions pour les frais réels' : 'frais saisis'))}
            ${ligne('= Bénéfice', (benef >= 0 ? '+' : '') + fmtEur(benef), true, benef >= 0 ? 'var(--success)' : 'var(--danger)')}
            ${ligne('Marge', pct(ca > 0 ? benef / ca : NaN))}
            ${ligne('ROI', pct(cout > 0 ? benef / cout : NaN))}
            ${String(v.canal || '').startsWith('Amazon') ? ligne('Versé par Amazon (approx.)', fmtEur(ca - frais), false, '', 'prix de vente moins les frais Amazon') : ''}
            ${remb.length ? ligne('Remboursement client', fmtEur(totalRemb), false, 'var(--danger)', remb.map(r => (r.date_retour ? new Date(r.date_retour + 'T12:00:00').toLocaleDateString('fr-FR') : '') + ' · ' + (r.quantite || 1) + ' u.').join(' ; ')) + ligne('= Résultat après remboursement', fmtEur(benef + totalRemb), true, (benef + totalRemb) >= 0 ? 'var(--success)' : 'var(--danger)') : ''}
        </div>
        <p class="sous-prix" style="margin-top:10px;">La TVA n'est pas déduite dans Stock Radar : prix de vente et prix d'achat sont comptés TTC.</p>
        ${v.notes ? `<p class="sous-prix">${escapeHtml(v.notes)}</p>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:14px;">
            ${asin ? `<button type="button" class="scan-button export" onclick="openAmazon('${escapeHtml(asin)}')">Page Amazon</button><button type="button" class="scan-button export" onclick="openKeepa('${escapeHtml(asin)}')">Keepa</button>` : ''}
            ${p ? `<button type="button" class="scan-button" onclick="document.getElementById('sr-vente-detail').remove();openProductModal(${p.id})">Fiche produit</button>` : ''}
        </div>
    </div>`;
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(m);
}

// ═══════ 4. TENDANCES DE L'ACCUEIL ═══════
// Période précédente de même durée : 30 j → les 30 j d'avant ; année → même période l'an dernier.
function bornesPeriode(code) {
    const aujourdhui = new Date();
    if (code === 'tout') return null;
    if (code === 'mois') {
        // Du 1er du mois à aujourd'hui, comparé au même nombre de jours du mois précédent
        const a = aujourdhui.getFullYear(), m = aujourdhui.getMonth(), j = aujourdhui.getDate();
        const finPrec = new Date(a, m - 1, Math.min(j, new Date(a, m, 0).getDate()));
        return { debut: isoJour(new Date(a, m, 1)), fin: isoJour(aujourdhui), debutPrec: isoJour(new Date(a, m - 1, 1)), finPrec: isoJour(finPrec) };
    }
    if (code === 'annee') {
        const a = aujourdhui.getFullYear();
        const mmjj = isoJour(aujourdhui).slice(5);
        return { debut: a + '-01-01', fin: isoJour(aujourdhui), debutPrec: (a - 1) + '-01-01', finPrec: (a - 1) + '-' + mmjj };
    }
    const n = Number(code);
    return { debut: ilYA(n), fin: isoJour(aujourdhui), debutPrec: ilYA(2 * n), finPrec: ilYA(n + 1) };
}
function chiffresVentes(debut, fin) {
    const vs = ventes.filter(v => { const d = String(v.date_vente || '').slice(0, 10); return (!debut || d >= debut) && (!fin || d <= fin); });
    const rs = retours.filter(r => { const d = String(r.date_retour || ''); return (!debut || d >= debut) && (!fin || d <= fin); });
    const chif = vs.filter(v => v.prix_achat_unitaire > 0 && v.prix_total > 0);
    const caC = chif.reduce((s, v) => s + (v.prix_total || 0), 0);
    const coutC = chif.reduce((s, v) => s + (v.prix_achat_unitaire || 0) * (v.quantite || 1), 0);
    const netC = chif.reduce((s, v) => s + (v.prix_total || 0) - (v.prix_achat_unitaire || 0) * (v.quantite || 1) - (v.frais || 0), 0);
    return {
        ca: vs.reduce((s, v) => s + (v.prix_total || 0), 0), benefice: vs.reduce((s, v) => s + (v.benefice || 0), 0),
        nb: vs.length, unites: vs.reduce((s, v) => s + (v.quantite || 0), 0), retours: rs.reduce((s, r) => s + (r.quantite || 0), 0),
        remb: rs.reduce((s, r) => s + (Number(r.total) || 0), 0),
        marge: caC > 0 ? netC / caC : NaN, roi: coutC > 0 ? netC / coutC : NaN, sansCout: vs.filter(v => !(v.prix_achat_unitaire > 0)).length,
    };
}
function afficherTendance(idValeur, actuel, precedent, mode, inverse) {
    const e = document.getElementById(idValeur);
    if (!e) return;
    const carte = e.closest('.stat-card');
    if (!carte) return;
    carte.querySelector('.tendance')?.remove();
    if (precedent == null || !isFinite(actuel) || !isFinite(precedent)) return;
    let texte, hausse;
    if (mode === 'points') { const d = (actuel - precedent) * 100; if (Math.abs(d) < 0.05) return; hausse = d > 0; texte = (hausse ? '▲ +' : '▼ ') + d.toFixed(1).replace('.', ',') + ' pt'; }
    else { if (!precedent) return; const d = (actuel - precedent) / Math.abs(precedent) * 100; if (Math.abs(d) < 0.5) return; hausse = d > 0; texte = (hausse ? '▲ +' : '▼ ') + Math.round(d) + ' %'; }
    const bon = inverse ? !hausse : hausse;
    const t = document.createElement('div');
    t.className = 'tendance ' + (bon ? 'bon' : 'mauvais');
    t.textContent = texte;
    const compare = document.createElement('small');
    compare.textContent = dashPeriode === 'annee' ? 'vs même période l\'an dernier' : dashPeriode === 'mois' ? 'vs même période le mois dernier' : `vs les ${dashPeriode} jours précédents`;
    t.appendChild(compare);
    (carte.querySelector('.kpi-sous') || carte.lastElementChild).before(t);
}
// Appelé à la fin de updateDashboard()
function majTendancesEtResultat() {
    const b = bornesPeriode(dashPeriode);
    const actu = b ? chiffresVentes(b.debut, b.fin) : chiffresVentes('', '');
    const prec = b ? chiffresVentes(b.debutPrec, b.finPrec) : null;
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('dash-roi', pct(actu.roi));
    const T = (id, k, mode, inv) => afficherTendance(id, actu[k], prec ? prec[k] : null, mode, inv);
    T('dash-ca-realise', 'ca'); T('dash-benefice', 'benefice'); T('dash-marge-moyenne', 'marge', 'points'); T('dash-roi', 'roi', 'points');
    el('dash-ca-sous', `${actu.nb.toLocaleString('fr-FR')} ventes · ${actu.unites.toLocaleString('fr-FR')} unités`);
    el('dash-benef-sous', `${actu.retours} unité(s) remboursée(s) aux clients`);
    majBlocsAccueil();

    // Résultat après retours et charges
    const zone = document.getElementById('dash-resultat');
    if (zone) {
        const debut = b ? b.debut : '', fin = b ? b.fin : '';
        const ops = amazonOps.filter(o => (!debut || String(o.date_op || '') >= debut) && (!fin || String(o.date_op || '') <= fin));
        const rfba = ops.filter(o => o.categorie === 'remboursement_fba').reduce((s, o) => s + (Number(o.total) || 0), 0);
        const fraisAmz = ops.filter(o => o.categorie !== 'remboursement_fba').reduce((s, o) => s + (Number(o.total) || 0), 0);
        const ch = chargesInternesPeriode(debut, fin);
        const devOk = typeof recupereRetoursPeriode === 'function' && retoursDevenirOk === true;
        const recup = devOk ? recupereRetoursPeriode(debut, fin) : 0;
        const resultat = actu.benefice + actu.remb + recup + rfba + fraisAmz - ch.ponctuel - ch.abonnements;
        const L = (lib, v, aide) => { if (Math.abs(v) < 0.005) v = 0; return `<div class="resultat-ligne"><span>${lib}${aide ? `<small>${aide}</small>` : ''}</span><span class="${v < 0 ? 'neg' : v > 0 ? 'pos' : ''}">${v > 0 ? '+' : ''}${fmtEur(v)}</span></div>`; };
        zone.innerHTML = `<h3>Résultat après retours et charges</h3>
            ${L('Bénéfice des ventes', actu.benefice)}
            ${devOk ? L('Perte réelle sur retours', actu.remb + recup, `${fmtEur(actu.remb)} repris par Amazon, ${fmtEur(recup)} récupérés (revenus en stock Amazon, reventes) ; les remboursements FBA sont dans leur ligne`) : L('Remboursements clients', actu.remb, 'montant net débité par Amazon ; les produits revenus en stock ne sont pas recomptés')}
            ${opsTableAbsente ? '<div class="resultat-ligne"><span>Remboursements FBA et frais Amazon hors ventes<small>exécutez migration-amazon-v2.sql pour les compter</small></span><span>–</span></div>' : L('Remboursements FBA', rfba, 'stock perdu ou abîmé payé par Amazon') + L('Frais Amazon hors ventes', fraisAmz, 'transport entrant, stockage, abonnement, étiquettes…')}
            ${L('Fournitures', -ch.ponctuel)}
            ${L('Abonnements', -ch.abonnements, 'saisis dans Fournitures & frais, ramenés à la période')}
            <div class="resultat-ligne total"><span>Résultat</span><span class="${resultat < 0 ? 'neg' : 'pos'}">${resultat >= 0 ? '+' : ''}${fmtEur(resultat)}</span></div>`;
    }
}

// Lignes « À faire » ajoutées par ce module (appelé depuis updateDashboard)
function lignesAFaireAnalyse(ligne) {
    try {
        const sansCout = ventes.filter(v => !(v.prix_achat_unitaire > 0));
        if (sansCout.length) ligne(sansCout.length, 'danger', `Vente${sansCout.length > 1 ? 's' : ''} sans prix d'achat`, 'Leur bénéfice est faux : complétez le prix d\'achat de la fiche produit', 'Voir les ventes', "switchTab('ventes');setVentesFiltreCout(true)");
        const r = calculerReassort();
        const aRacheter = r.filter(l => l.statut === 'a_racheter' || l.statut === 'rupture');
        if (aRacheter.length) ligne(aRacheter.length, 'warn', `Référence${aRacheter.length > 1 ? 's' : ''} à racheter`, `Moins de ${reassortCouverture} jours de stock au rythme des 30 derniers jours`, 'Voir le réassort', "switchTab('reassort');setReassortFiltre('a_racheter')");
        const ecarts = envoisFba.filter(e => e.statut === 'CLOSED' && !e.traite && ecartEnvoi(e) > 0);
        if (ecarts.length) ligne(ecarts.length, 'danger', `Envoi${ecarts.length > 1 ? 's' : ''} FBA avec des unités non reçues`, `${ecarts.reduce((s, e) => s + ecartEnvoi(e), 0)} unité(s) envoyée(s) qu'Amazon n'a pas réceptionnée(s)`, 'Vérifier', "switchTab('envois-fba');setEnvoisFiltre('ecart')");
    } catch (e) { console.warn('À faire (analyse):', e); }
}

// Blocs « Stock actuel » et « Canaux de vente » de l'accueil
function majBlocsAccueil() {
    const zs = document.getElementById('dash-stock');
    if (zs) {
        const enStock = products.filter(p => !p.vendu && !p.invendable);
        const ent = enStock.reduce((s, p) => s + (p.qte_entrepot || 0), 0), fba = enStock.reduce((s, p) => s + (p.qte_fba || 0), 0), fbm = enStock.reduce((s, p) => s + (p.qte_fbm || 0), 0);
        const total = ent + fba + fbm;
        const valeur = enStock.reduce((s, p) => s + (p.prix_achat || 0) * (p.quantite || 0), 0);
        const rebut = products.filter(p => !p.vendu && ((p.etat_stock || '') === 'rebut' || p.invendable)).reduce((s, p) => s + (p.quantite || 0), 0);
        const parts = [['Entrepôt', ent, '#2d5a27', enStock.reduce((s, p) => s + (p.prix_achat || 0) * (p.qte_entrepot || 0), 0)], ['Amazon FBA', fba, '#ff9900'], ['Amazon FBM', fbm, '#3f51b5']];
        const pc = (n) => total ? Math.round(n / total * 100) : 0;
        zs.innerHTML = `<div class="accueil-bloc-titre"><h3>Stock actuel</h3></div>
            <div class="stock-total"><strong>${total.toLocaleString('fr-FR')} unités</strong><span class="kpi-sous"><b style="color:var(--text-1);font-size:15px;">${fmtEur(valeur)}</b> au prix d'achat</span></div>
            <div class="stock-barre" role="img" aria-label="Répartition du stock">${parts.filter(x => x[1] > 0).map(x => `<span style="width:${x[1] / total * 100}%;background:${x[2]};" title="${x[0]} : ${x[1]} unités">${pc(x[1]) >= 8 ? pc(x[1]) + ' %' : ''}</span>`).join('')}</div>
            ${parts.map(x => `<div class="liste-ligne"><span class="pastille-couleur" style="background:${x[2]};"></span><span class="lib">${x[0]}${x[3] !== undefined ? ` <span class="kpi-sous">· ${fmtEur(x[3])}</span>` : ''}</span><span class="chiffre"><strong>${x[1].toLocaleString('fr-FR')}</strong> unités</span></div>`).join('')}
            ${rebut ? `<div class="liste-ligne"><span class="pastille-couleur" style="background:#c0392b;"></span><span class="lib">Rebut <span class="kpi-sous">(non compté ci-dessus)</span></span><span class="chiffre">${rebut} unités</span></div>` : ''}
            <div style="margin-top:10px;"><button type="button" class="afaire-btn" onclick="switchTab('stock')">Voir le stock</button> <button type="button" class="afaire-btn" onclick="switchTab('reassort')">Réassort</button></div>`;
    }
    const zc = document.getElementById('dash-canaux');
    if (zc) {
        const b = bornesPeriode(dashPeriode);
        const vs = ventes.filter(v => { const d = String(v.date_vente || '').slice(0, 10); return !b || (d >= b.debut && d <= b.fin); });
        const nomsPays = { FR: 'France', DE: 'Allemagne', IT: 'Italie', ES: 'Espagne', NL: 'Pays-Bas', BE: 'Belgique', IE: 'Irlande', UK: 'Royaume-Uni', PL: 'Pologne', SE: 'Suède' };
        const g = {};
        vs.forEach(v => {
            let k = v.canal || 'Autre';
            if (String(v.canal || '').startsWith('Amazon')) { const p = paysDeMarketplace(v.marketplace); k = 'Amazon ' + (p ? (nomsPays[p] || p) : '· pays inconnu'); }
            g[k] = g[k] || { n: 0, ca: 0, benef: 0 }; g[k].n += 1; g[k].ca += v.prix_total || 0; g[k].benef += v.benefice || 0;
        });
        const lignes = Object.entries(g).sort((a, b) => b[1].ca - a[1].ca);
        const max = lignes.length ? lignes[0][1].ca : 1;
        const libPeriode = { mois: 'ce mois-ci', '30': '30 derniers jours', '90': '90 derniers jours', annee: 'cette année', tout: 'depuis le début' }[dashPeriode];
        zc.innerHTML = `<div class="accueil-bloc-titre"><h3>Canaux de vente</h3><span class="kpi-sous">${libPeriode}</span></div>`
            + (lignes.length ? lignes.map(([k, x]) => `<div class="liste-ligne"><span class="lib">${escapeHtml(k)}<div class="canal-barre" style="width:${Math.max(2, x.ca / max * 100)}%;"></div></span><span class="chiffre second">${x.n.toLocaleString('fr-FR')} ventes</span><span class="chiffre" style="min-width:100px;"><strong>${fmtEur(x.ca)}</strong><div class="kpi-sous" style="color:${x.benef >= 0 ? 'var(--success)' : 'var(--danger)'};">${x.benef >= 0 ? '+' : ''}${fmtEur(x.benef)}</div></span></div>`).join('')
                : '<p class="kpi-sous">Aucune vente sur la période.</p>');
    }
}

// ═══════ Saisie des coûts des ventes sans prix d'achat (par produit) ═══════
function cleCout(v) {
    const m = String(v.notes || '').match(/ASIN:([A-Z0-9]{10})/);
    if (m) return 'A:' + m[1];
    if (v.produit_id) { const p = products.find(x => x.id === v.produit_id); if (p) return cleProduit(p); }
    return v.produit_ean ? 'E:' + v.produit_ean : 'N:' + (v.produit_nom || '');
}
function panneauSaisieCouts(liste) {
    const g = new Map();
    liste.filter(v => !(v.prix_achat_unitaire > 0)).forEach(v => {
        const k = cleCout(v);
        if (!g.has(k)) g.set(k, { k, nom: v.produit_nom || '', ids: [], unites: 0, ca: 0 });
        const x = g.get(k); x.ids.push(v.id); x.unites += v.quantite || 1; x.ca += v.prix_total || 0;
    });
    const groupes = [...g.values()].sort((a, b) => b.ca - a.ca);
    if (!groupes.length) return '';
    window._groupesCouts = groupes;
    const lignes = groupes.slice(0, 150).map((x, i) => {
        const code = x.k.slice(2);
        return `<tr style="cursor:default;"><td class="c-prod"><div class="achat-nom">${escapeHtml(x.nom || '-')}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(code, x.k[0] === 'A' ? 'ASIN' : 'EAN')}<span class="code-lib">${x.k[0] === 'A' ? 'ASIN' : x.k[0] === 'E' ? 'EAN' : ''}</span><span>${escapeHtml(code)}</span></span></div></td>
            <td class="num" data-l="Ventes">${x.ids.length}</td><td class="num" data-l="Unités">${x.unites}</td><td class="num" data-l="CA">${fmtEur(x.ca)}</td>
            <td class="c-actions"><div style="display:flex;gap:6px;align-items:center;"><input type="number" step="0.01" min="0" id="cout-${i}" placeholder="Coût TTC / u." class="search-input" style="width:120px;min-width:0;"><button type="button" class="btn-recep" style="margin:0;" onclick="appliquerCout(${i})">Appliquer</button></div></td></tr>`;
    }).join('');
    return `<div class="emp-panneau"><h3>Saisir les coûts manquants</h3><p class="sous-prix">${groupes.length} produit(s) vendu(s) sans prix d'achat connu, triés par chiffre d'affaires. Saisissez le coût unitaire TTC : le bénéfice de toutes leurs ventes est recalculé.</p>
        <div class="products-table" style="margin-top:8px;"><table class="achats-table"><thead><tr><th>Produit</th><th class="num">Ventes</th><th class="num">Unités</th><th class="num">CA</th><th>Coût unitaire</th></tr></thead><tbody>${lignes}</tbody></table></div>${groupes.length > 150 ? `<p class="sous-prix">… et ${groupes.length - 150} autres : traitez les premiers puis revenez.</p>` : ''}</div>`;
}
async function appliquerCout(i) {
    const x = (window._groupesCouts || [])[i];
    const cout = parseFloat(String(document.getElementById('cout-' + i)?.value || '').replace(',', '.'));
    if (!x || !(cout > 0)) return toastError('Coût invalide', 'Saisissez un coût unitaire supérieur à 0.');
    let ok = 0;
    for (const id of x.ids) {
        const v = ventes.find(y => y.id === id); if (!v) continue;
        const benefice = parseFloat(((v.prix_total || 0) - cout * (v.quantite || 1) - (v.frais || 0)).toFixed(2));
        const { error } = await sb.from('ventes').update({ prix_achat_unitaire: cout, benefice }).eq('id', id);
        if (error) { toastError('Erreur', error.message); break; }
        v.prix_achat_unitaire = cout; v.benefice = benefice; ok++;
    }
    toastSuccess('Coût appliqué', `${ok} vente(s) recalculée(s) pour ${x.nom}.`);
    displayVentes(); updateDashboard();
}
