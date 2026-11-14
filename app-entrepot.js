// ═════════════════════════════════════════════
// STOCK RADAR - app-entrepot.js
// Rangement du local : étagères (A1, A2, B1…), étiquettes à imprimer (Brother QL-700),
// rangement des produits (un produit peut être sur plusieurs étagères), mode rangement
// au scanner, et « où le prendre » à chaque vente FBM / Vinted / Leboncoin.
// Stock physiquement au local = entrepôt + FBM.
// ═════════════════════════════════════════════

let emplacements = [], rangements = [], entrepotTableAbsente = false;
let entrepotVue = 'etageres', rangementEtagere = '', rangementReader = null, rangementPause = false;
const QR_PREFIXE = 'SR-EMP:';

// ───────── Chargement ─────────
async function loadEntrepot() {
    const uid = getUserFilter();
    let q1 = sb.from('emplacements').select('*').order('code', { ascending: true }).limit(5000);
    let q2 = sb.from('rangements').select('*').order('code', { ascending: true }).limit(20000);
    if (uid) { q1 = q1.eq('user_id', uid); q2 = q2.eq('user_id', uid); }
    const [r1, r2] = await Promise.all([q1, q2]);
    entrepotTableAbsente = !!(r1.error || r2.error);
    emplacements = r1.data || [];
    rangements = (r2.data || []).filter(r => (r.quantite || 0) > 0);
    if (document.getElementById('entrepot')?.classList.contains('active')) displayEntrepot();
}

// ───────── Outils ─────────
function normCode(c) { return String(c || '').trim().toUpperCase().replace(/^SR-EMP:/, '').replace(/\s+/g, ''); }
function triCode(a, b) {
    const pa = String(a).match(/^([A-Z]*)(\d*)(.*)$/) || [], pb = String(b).match(/^([A-Z]*)(\d*)(.*)$/) || [];
    return (pa[1] || '').localeCompare(pb[1] || '') || (parseInt(pa[2] || 0) - parseInt(pb[2] || 0)) || String(a).localeCompare(String(b));
}
function stockPhysique(p) { return p && !p.vendu ? (p.qte_entrepot || 0) + (p.qte_fbm || 0) : 0; }
function rangementsProduit(pid) { return rangements.filter(r => r.produit_id === pid && r.quantite > 0).sort((a, b) => triCode(a.code, b.code)); }
function qteRangee(pid) { return rangementsProduit(pid).reduce((s, r) => s + r.quantite, 0); }
function qteARanger(p) { return Math.max(0, stockPhysique(p) - qteRangee(p.id)); }
function chipsRangement(pid, vide) {
    const rs = rangementsProduit(pid);
    if (!rs.length) return vide || '';
    return `<span class="emp-chips">${rs.map(r => `<span class="emp-chip" title="${r.quantite} unité(s) sur l'étagère ${escapeHtml(r.code)}">${escapeHtml(r.code)}<small>×${r.quantite}</small></span>`).join('')}</span>`;
}
function datalistCodes() {
    let dl = document.getElementById('sr-emp-codes');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'sr-emp-codes'; document.body.appendChild(dl); }
    dl.innerHTML = emplacements.map(e => `<option value="${escapeHtml(e.code)}">${escapeHtml(e.libelle || '')}</option>`).join('');
    return 'sr-emp-codes';
}
function verifierTables() {
    if (entrepotTableAbsente) { toastError('Migration à exécuter', 'Exécutez migration-entrepot.sql dans Supabase (SQL Editor), puis rechargez la page.'); return false; }
    return true;
}

// ───────── Écritures ─────────
async function creerEmplacements(codes, libelle) {
    if (!verifierTables()) return 0;
    const existants = new Set(emplacements.map(e => e.code));
    const nouveaux = [...new Set(codes.map(normCode).filter(c => c && !existants.has(c)))];
    if (!nouveaux.length) return 0;
    const uid = getEffectiveUserId();
    const { error } = await sb.from('emplacements').insert(nouveaux.map(code => ({ user_id: uid, code, libelle: libelle || '' })));
    if (error) { toastError('Erreur', error.message); return 0; }
    await loadEntrepot();
    return nouveaux.length;
}
async function ecrireRangement(pid, code, qte) {
    const uid = getEffectiveUserId();
    if (qte <= 0) {
        const { error } = await sb.from('rangements').delete().eq('produit_id', pid).eq('code', code);
        if (error) throw new Error(error.message);
    } else {
        const { error } = await sb.from('rangements').upsert([{ user_id: uid, produit_id: pid, code, quantite: qte, updated_at: new Date().toISOString() }], { onConflict: 'user_id,produit_id,code' });
        if (error) throw new Error(error.message);
    }
    const r = rangements.find(x => x.produit_id === pid && x.code === code);
    if (qte <= 0) rangements = rangements.filter(x => x !== r);
    else if (r) r.quantite = qte;
    else rangements.push({ produit_id: pid, code, quantite: qte });
}
// Ajoute `qte` unités du produit sur l'étagère `code` (créée si elle n'existe pas)
async function rangerProduit(pid, code, qte, silencieux) {
    if (!verifierTables()) return false;
    code = normCode(code);
    if (!code) { toastError('Étagère manquante', 'Indiquez une étagère, par exemple A1.'); return false; }
    const p = products.find(x => x.id === pid);
    if (!p) return false;
    qte = parseInt(qte) || 0;
    if (qte <= 0) return false;
    const libre = qteARanger(p);
    if (qte > libre && !silencieux) {
        if (!await srConfirm(`${p.nom}\n\nIl ne reste que ${libre} unité(s) à ranger (stock au local : ${stockPhysique(p)}, déjà rangées : ${qteRangee(pid)}).\nRanger quand même ${qte} unité(s) en ${code} ?`, 'Ranger')) return false;
    }
    if (!emplacements.some(e => e.code === code)) await creerEmplacements([code]);
    const actuel = rangements.find(r => r.produit_id === pid && r.code === code)?.quantite || 0;
    try { await ecrireRangement(pid, code, actuel + qte); }
    catch (e) { toastError('Rangement impossible', e.message); return false; }
    await logMouvementBrut(pid, 'transfert', qte, 'à ranger', 'étagère ' + code, 'Rangement', '');
    return true;
}
async function deplacerRangement(pid, de, vers, qte) {
    vers = normCode(vers);
    const src = rangements.find(r => r.produit_id === pid && r.code === de);
    if (!src || !vers || vers === de) return;
    qte = Math.min(parseInt(qte) || 0, src.quantite);
    if (qte <= 0) return;
    if (!emplacements.some(e => e.code === vers)) await creerEmplacements([vers]);
    const dest = rangements.find(r => r.produit_id === pid && r.code === vers)?.quantite || 0;
    try { await ecrireRangement(pid, de, src.quantite - qte); await ecrireRangement(pid, vers, dest + qte); }
    catch (e) { return toastError('Déplacement impossible', e.message); }
    await logMouvementBrut(pid, 'transfert', qte, 'étagère ' + de, 'étagère ' + vers, 'Déplacement', '');
    toastSuccess('Déplacé', `${qte} unité(s) de ${de} vers ${vers}.`);
}
async function retirerRangement(pid, code, qte) {
    const r = rangements.find(x => x.produit_id === pid && x.code === code);
    if (!r) return;
    qte = Math.min(parseInt(qte) || r.quantite, r.quantite);
    try { await ecrireRangement(pid, code, r.quantite - qte); } catch (e) { return toastError('Erreur', e.message); }
}
// Retire `qte` unités des étagères du produit, dans l'ordre des étagères ; renvoie où les prendre
async function preleverRangement(pid, qte) {
    const picks = [];
    let reste = qte;
    for (const r of rangementsProduit(pid)) {
        if (reste <= 0) break;
        const n = Math.min(r.quantite, reste);
        try { await ecrireRangement(pid, r.code, r.quantite - n); } catch (e) { console.warn('Prélèvement:', e.message); continue; }
        picks.push({ code: r.code, qte: n });
        reste -= n;
    }
    return { picks, nonRange: reste };
}

// ───────── Ventes et transferts : où prendre les unités ─────────
// Chaque sortie du local passe par logMouvement (vente Vinted / Leboncoin / FBM, transfert vers FBA) :
// on y retire les unités des étagères et on note où les prendre.
const logMouvementBrut = logMouvement;
const estAuLocal = (x) => { const t = String(x || '').toLowerCase(); return !t.includes('fba') && /entrepot|entrepôt|fbm|vinted|leboncoin|autre|^$/.test(t); };
const sortDuLocal = (x) => { const t = String(x || '').toLowerCase(); return t === 'vendu' || t.includes('fba'); };
let preparation = [], preparationTimer = null;
logMouvement = async function (produitId, type, quantite, de, vers, raison, notes, infos) {
    await logMouvementBrut(produitId, type, quantite, de, vers, raison, notes, infos);
    try {
        if (entrepotTableAbsente || !(quantite > 0) || !estAuLocal(de) || !sortDuLocal(vers)) return;
        if (!rangementsProduit(produitId).length) return;
        const { picks, nonRange } = await preleverRangement(produitId, quantite);
        const p = products.find(x => x.id === produitId);
        preparation.push({ nom: p?.nom || infos?.nom || '', ean: p?.ean || infos?.ean || '', picks, nonRange, raison: raison || '' });
        clearTimeout(preparationTimer);
        preparationTimer = setTimeout(afficherPreparation, 900);
    } catch (e) { console.warn('Rangement après mouvement:', e); }
};
function afficherPreparation() {
    const liste = preparation; preparation = [];
    if (!liste.length) return;
    if (liste.length === 1) {
        const x = liste[0];
        showToast('info', 'À prendre en ' + x.picks.map(p => p.code + (p.qte > 1 ? ' ×' + p.qte : '')).join(', '), x.nom + (x.nonRange ? ` · ${x.nonRange} unité(s) non rangée(s)` : ''), 9000);
        return;
    }
    ouvrirListePreparation(liste);
}
function ouvrirListePreparation(liste) {
    document.getElementById('sr-preparation')?.remove();
    const lignes = [];
    liste.forEach(x => x.picks.forEach(p => lignes.push({ code: p.code, qte: p.qte, nom: x.nom, ean: x.ean })));
    lignes.sort((a, b) => triCode(a.code, b.code));
    const m = document.createElement('div');
    m.id = 'sr-preparation'; m.className = 'sr-tiroir';
    m.innerHTML = `<div class="sr-tiroir-panneau" role="dialog" aria-modal="true" aria-label="Liste de préparation">
        <div class="tiroir-titre">Liste de préparation</div>
        <div class="tiroir-sur" style="margin-bottom:12px;">${lignes.length} prise(s), triées par étagère</div>
        <div class="detail-calcul">${lignes.map(l => `<div class="detail-ligne"><span><strong class="emp-chip" style="font-size:14px;">${escapeHtml(l.code)}</strong> ${escapeHtml(l.nom)}<small>EAN ${escapeHtml(l.ean || '-')}</small></span><span>×${l.qte}</span></div>`).join('')}</div>
        ${liste.some(x => x.nonRange) ? `<p class="sous-prix" style="margin-top:10px;">Non rangés : ${liste.filter(x => x.nonRange).map(x => escapeHtml(x.nom) + ' ×' + x.nonRange).join(', ')}</p>` : ''}
        <div style="display:flex;gap:8px;margin-top:auto;padding-top:14px;"><button type="button" class="scan-button export" onclick="window.print()">Imprimer</button><button type="button" class="scan-button" onclick="document.getElementById('sr-preparation').remove()">Fermer</button></div>
    </div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    document.body.appendChild(m);
}

// ───────── Fenêtre de vente et fiche produit ─────────
const openVenteModalBrut = openVenteModal;
openVenteModal = function (id) {
    openVenteModalBrut(id);
    const info = document.getElementById('vente-product-info');
    if (!info || entrepotTableAbsente) return;
    info.querySelector('.vente-emp')?.remove();
    const d = document.createElement('div');
    d.className = 'vente-emp';
    d.innerHTML = rangementsProduit(id).length ? `À prendre sur : ${chipsRangement(id)}` : '<span class="sous-prix">Pas encore rangé sur une étagère</span>';
    info.appendChild(d);
};
const openProductModalBrut = openProductModal;
openProductModal = function (id) {
    openProductModalBrut(id);
    const vue = document.getElementById('product-view-' + id);
    if (!vue || entrepotTableAbsente) return;
    vue.querySelector('.emp-fiche')?.remove();
    const p = products.find(x => x.id === id);
    const bloc = document.createElement('div');
    bloc.className = 'emp-fiche';
    bloc.innerHTML = blocRangementFiche(p);
    vue.insertBefore(bloc, vue.firstChild);
};
function blocRangementFiche(p) {
    const rs = rangementsProduit(p.id), libre = qteARanger(p);
    return `<h3 style="margin:0 0 8px;">Rangement au local</h3>
        ${rs.length ? rs.map(r => `<div class="liste-ligne"><span class="emp-chip">${escapeHtml(r.code)}</span><span class="lib">${r.quantite} unité(s)</span>
            <button type="button" class="afaire-btn" onclick="demanderDeplacement(${p.id}, '${escapeHtml(r.code)}')">Déplacer</button>
            <button type="button" class="afaire-btn" onclick="demanderRetrait(${p.id}, '${escapeHtml(r.code)}')">Retirer</button></div>`).join('') : '<p class="sous-prix">Pas encore rangé.</p>'}
        <div class="sous-prix" style="margin:6px 0;">Au local : ${stockPhysique(p)} (entrepôt ${p.qte_entrepot || 0} + FBM ${p.qte_fbm || 0}) · rangées ${qteRangee(p.id)} · <strong>à ranger ${libre}</strong></div>
        ${libre > 0 ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px;"><input id="emp-fiche-code-${p.id}" list="${datalistCodes()}" placeholder="Étagère (ex. A1)" class="search-input" style="max-width:150px;min-width:0;text-transform:uppercase;">
            <input id="emp-fiche-qte-${p.id}" type="number" min="1" value="${libre}" class="search-input" style="max-width:90px;min-width:0;">
            <button type="button" class="scan-button" onclick="rangerDepuisFiche(${p.id})">Ranger</button></div>` : '<div style="margin-bottom:16px;"></div>'}`;
}
async function rafraichirFiche(pid) {
    const vue = document.getElementById('product-view-' + pid);
    const bloc = vue?.querySelector('.emp-fiche');
    if (bloc) bloc.innerHTML = blocRangementFiche(products.find(x => x.id === pid));
    if (document.getElementById('entrepot')?.classList.contains('active')) displayEntrepot();
    if (document.getElementById('stock')?.classList.contains('active')) displayStock();
}
async function rangerDepuisFiche(pid) {
    const ok = await rangerProduit(pid, document.getElementById('emp-fiche-code-' + pid)?.value, document.getElementById('emp-fiche-qte-' + pid)?.value);
    if (ok) { toastSuccess('Rangé', 'Emplacement enregistré.'); rafraichirFiche(pid); }
}
async function demanderDeplacement(pid, code) {
    const r = rangements.find(x => x.produit_id === pid && x.code === code);
    if (!r) return;
    const vers = prompt(`Déplacer depuis ${code} vers quelle étagère ?`, '');
    if (!vers) return;
    const qte = r.quantite > 1 ? prompt(`Combien d'unités (sur ${r.quantite}) ?`, String(r.quantite)) : '1';
    if (!qte) return;
    await deplacerRangement(pid, code, vers, qte);
    rafraichirFiche(pid);
}
async function demanderRetrait(pid, code) {
    const r = rangements.find(x => x.produit_id === pid && x.code === code);
    if (!r) return;
    const qte = r.quantite > 1 ? prompt(`Retirer combien d'unités de ${code} (sur ${r.quantite}) ?\n(Le stock du produit n'est pas modifié : seules les étagères changent.)`, String(r.quantite)) : '1';
    if (!qte) return;
    await retirerRangement(pid, code, qte);
    rafraichirFiche(pid);
}

// ═══════ PAGE ENTREPÔT ═══════
function setEntrepotVue(v) { entrepotVue = v; displayEntrepot(); }
function basculerPanneau(id) {
    ['emp-panneau-creer', 'emp-panneau-etiquettes', 'emp-panneau-ranger'].forEach(x => {
        const e = document.getElementById(x); if (!e) return;
        e.style.display = (x === id && e.style.display === 'none') ? '' : 'none';
    });
    if (id !== 'emp-panneau-ranger') arreterCameraRangement();
    if (id === 'emp-panneau-ranger' && document.getElementById(id).style.display !== 'none') setTimeout(() => document.getElementById('rg-etagere')?.focus(), 50);
    datalistCodes();
}
function displayEntrepot() {
    const c = document.getElementById('entrepot-container');
    if (!c) return;
    const aide = document.getElementById('entrepot-aide-migration');
    if (aide) aide.style.display = entrepotTableAbsente ? '' : 'none';
    datalistCodes();
    const auLocal = products.filter(p => stockPhysique(p) > 0);
    const aRanger = auLocal.filter(p => qteARanger(p) > 0);
    const unitesRangees = rangements.reduce((s, r) => s + r.quantite, 0);
    const unitesARanger = aRanger.reduce((s, p) => s + qteARanger(p), 0);
    const set = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
    set('entrepot-resume', `${emplacements.length} étagère(s) · ${unitesRangees.toLocaleString('fr-FR')} unité(s) rangée(s) · <strong style="color:${unitesARanger ? 'var(--warning, #b36b00)' : 'var(--success)'};">${unitesARanger.toLocaleString('fr-FR')} unité(s) à ranger</strong>`);
    set('entrepot-pastilles', pastillesHtml([['etageres', 'Étagères', emplacements.length], ['a_ranger', 'À ranger', aRanger.length], ['chercher', 'Où est… ?']], entrepotVue, 'setEntrepotVue'));
    const rech = document.getElementById('entrepot-search');
    if (rech) { rech.style.display = entrepotVue === 'etageres' ? 'none' : ''; rech.parentElement.style.display = rech.style.display; }
    const q = (rech?.value || '').trim().toLowerCase();
    const parId = new Map(products.map(p => [p.id, p]));

    if (entrepotVue === 'etageres') {
        if (!emplacements.length) { c.innerHTML = `<div class="empty-state"><h3>Aucune étagère</h3><p>Cliquez sur « Créer des étagères » : par exemple de A à F, niveaux 1 à 5.</p></div>`; return; }
        const parCode = {};
        rangements.forEach(r => { parCode[r.code] = parCode[r.code] || { u: 0, refs: 0 }; parCode[r.code].u += r.quantite; parCode[r.code].refs += 1; });
        const groupes = {};
        emplacements.map(e => e.code).sort(triCode).forEach(code => { const l = (code.match(/^[A-Z]*/) || [''])[0] || '#'; (groupes[l] = groupes[l] || []).push(code); });
        c.innerHTML = Object.entries(groupes).map(([l, codes]) => `<div class="emp-rangee"><div class="emp-rangee-titre">Étagère ${escapeHtml(l)}</div><div class="emp-grille">${codes.map(code => {
            const x = parCode[code];
            return `<button type="button" class="emp-case${x ? '' : ' vide'}" onclick="ouvrirEtagere('${escapeHtml(code)}')"><strong>${escapeHtml(code)}</strong><span>${x ? x.u + ' u. · ' + x.refs + ' réf.' : 'vide'}</span></button>`;
        }).join('')}</div></div>`).join('');
        return;
    }
    if (entrepotVue === 'a_ranger') {
        let liste = aRanger;
        if (q) liste = liste.filter(p => (p.nom || '').toLowerCase().includes(q) || (p.ean || '').includes(q) || (p.asin || '').toLowerCase().includes(q));
        liste.sort((a, b) => qteARanger(b) - qteARanger(a));
        if (!liste.length) { c.innerHTML = '<div class="empty-state"><h3>Tout est rangé</h3></div>'; return; }
        c.innerHTML = '<div class="products-table"><table class="achats-table"><thead><tr><th>Produit</th><th class="num">Au local</th><th>Déjà rangé</th><th class="num">À ranger</th><th>Ranger sur</th></tr></thead><tbody>'
            + liste.slice(0, 200).map(p => `<tr style="cursor:default;">
                <td class="c-prod"><div class="achat-nom">${escapeHtml(p.nom || '')}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(p.ean, 'EAN')}<span class="code-lib">EAN</span><span>${escapeHtml(p.ean || '-')}</span></span></div></td>
                <td class="num" data-l="Au local">${stockPhysique(p)}</td>
                <td>${chipsRangement(p.id, '–')}</td>
                <td class="num" data-l="À ranger"><strong>${qteARanger(p)}</strong></td>
                <td class="c-actions"><div style="display:flex;gap:6px;flex-wrap:wrap;"><input id="emp-ar-code-${p.id}" list="sr-emp-codes" placeholder="A1" class="search-input" style="width:80px;min-width:0;text-transform:uppercase;" value="${escapeHtml(rangementsProduit(p.id)[0]?.code || '')}"><input id="emp-ar-qte-${p.id}" type="number" min="1" value="${qteARanger(p)}" class="search-input" style="width:70px;min-width:0;"><button type="button" class="btn-recep" style="margin:0;" onclick="rangerDepuisListe(${p.id})">Ranger</button></div></td>
            </tr>`).join('') + '</tbody></table></div>' + (liste.length > 200 ? `<p class="sous-prix">… et ${liste.length - 200} autres : affinez avec la recherche.</p>` : '');
        return;
    }
    // Où est… ?
    if (q.length < 2) { c.innerHTML = '<div class="empty-state"><h3>Tapez un nom, un EAN ou un ASIN</h3><p>ou scannez le code-barres du produit dans le champ de recherche.</p></div>'; return; }
    const trouves = products.filter(p => !p.vendu && ((p.nom || '').toLowerCase().includes(q) || (p.ean || '').includes(q) || (p.asin || '').toLowerCase().includes(q)));
    if (!trouves.length) { c.innerHTML = '<div class="empty-state"><h3>Aucun produit trouvé</h3></div>'; return; }
    c.innerHTML = '<div class="products-table"><table class="achats-table"><thead><tr><th>Produit</th><th>Étagères</th><th class="num">Au local</th><th class="num">FBA</th></tr></thead><tbody>'
        + trouves.slice(0, 100).map(p => `<tr onclick="openProductModal(${p.id})"><td class="c-prod"><div class="achat-nom">${escapeHtml(p.nom || '')}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(p.ean, 'EAN')}<span class="code-lib">EAN</span><span>${escapeHtml(p.ean || '-')}</span></span></div></td>
            <td>${chipsRangement(p.id, stockPhysique(p) ? '<span class="pill pill-warn">Pas rangé</span>' : '–')}</td><td class="num" data-l="Au local">${stockPhysique(p)}</td><td class="num" data-l="FBA">${p.qte_fba || 0}</td></tr>`).join('') + '</tbody></table></div>';
}
async function rangerDepuisListe(pid) {
    const ok = await rangerProduit(pid, document.getElementById('emp-ar-code-' + pid)?.value, document.getElementById('emp-ar-qte-' + pid)?.value);
    if (ok) { toastSuccess('Rangé', 'Emplacement enregistré.'); displayEntrepot(); }
}
function ouvrirEtagere(code) {
    const parId = new Map(products.map(p => [p.id, p]));
    const rs = rangements.filter(r => r.code === code).sort((a, b) => (parId.get(a.produit_id)?.nom || '').localeCompare(parId.get(b.produit_id)?.nom || ''));
    const e = emplacements.find(x => x.code === code);
    document.getElementById('sr-etagere')?.remove();
    const m = document.createElement('div');
    m.id = 'sr-etagere'; m.className = 'sr-tiroir';
    m.innerHTML = `<div class="sr-tiroir-panneau" role="dialog" aria-modal="true" aria-label="Étagère ${escapeHtml(code)}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><div class="tiroir-sur">Étagère${e?.libelle ? ' · ' + escapeHtml(e.libelle) : ''}</div><div class="tiroir-titre" style="font-size:26px;">${escapeHtml(code)}</div></div>
        <button type="button" class="ico-btn ico-voir" onclick="document.getElementById('sr-etagere').remove()" aria-label="Fermer">${ICO('<path d="M6 6l12 12M18 6L6 18"/>')}</button></div>
        <div class="tiroir-sur" style="margin:4px 0 12px;">${rs.length} référence(s) · ${rs.reduce((s, r) => s + r.quantite, 0)} unité(s)</div>
        ${rs.length ? '<div class="detail-calcul">' + rs.map(r => { const p = parId.get(r.produit_id); return `<div class="detail-ligne"><span>${escapeHtml(p?.nom || 'Produit supprimé')}<small>EAN ${escapeHtml(p?.ean || '-')}</small></span><span style="display:flex;gap:6px;align-items:center;">×${r.quantite}<button type="button" class="afaire-btn" onclick="document.getElementById('sr-etagere').remove();openProductModal(${r.produit_id})">Fiche</button></span></div>`; }).join('') + '</div>' : '<p class="sous-prix">Étagère vide.</p>'}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:14px;">
            <button type="button" class="scan-button export" onclick="imprimerEtiquettes(['${escapeHtml(code)}'])">Imprimer l'étiquette</button>
            ${!rs.length ? `<button type="button" class="scan-button danger" onclick="supprimerEtagere('${escapeHtml(code)}')">Supprimer l'étagère</button>` : ''}
        </div></div>`;
    m.addEventListener('click', ev => { if (ev.target === m) m.remove(); });
    document.body.appendChild(m);
}
async function supprimerEtagere(code) {
    if (rangements.some(r => r.code === code)) return toastError('Étagère occupée', 'Videz-la avant de la supprimer.');
    if (!await srConfirm(`Supprimer l'étagère ${code} ?`, 'Supprimer', true)) return;
    const { error } = await sb.from('emplacements').delete().eq('code', code).eq('user_id', getEffectiveUserId());
    if (error) return toastError('Erreur', error.message);
    document.getElementById('sr-etagere')?.remove();
    await loadEntrepot();
}

// Création en série : lettres de A à F × niveaux 1 à 5
function apercuCreation() {
    const codes = codesACreer();
    const e = document.getElementById('emp-creer-apercu');
    if (e) e.textContent = codes.length ? `${codes.length} étagère(s) : ${codes.slice(0, 8).join(', ')}${codes.length > 8 ? '…' : ''}` : 'Vérifiez les lettres et les niveaux.';
}
function codesACreer() {
    const l1 = normCode(document.getElementById('emp-lettre-de')?.value).charCodeAt(0), l2 = normCode(document.getElementById('emp-lettre-a')?.value).charCodeAt(0);
    const n1 = parseInt(document.getElementById('emp-niv-de')?.value), n2 = parseInt(document.getElementById('emp-niv-a')?.value);
    if (!(l1 >= 65 && l2 >= l1 && l2 <= 90 && n1 >= 0 && n2 >= n1 && n2 - n1 < 100)) return [];
    const codes = [];
    for (let l = l1; l <= l2; l++) for (let n = n1; n <= n2; n++) codes.push(String.fromCharCode(l) + n);
    return codes;
}
async function creerEtageresSerie() {
    const codes = codesACreer();
    if (!codes.length) return toastError('Plage invalide', 'Exemple : de A à F, niveaux 1 à 5.');
    const n = await creerEmplacements(codes, document.getElementById('emp-libelle')?.value?.trim());
    toastSuccess('Étagères créées', n ? `${n} nouvelle(s) étagère(s).` : 'Elles existaient déjà toutes.');
    displayEntrepot();
}
async function creerEtagereUnique() {
    const code = normCode(document.getElementById('emp-code-unique')?.value);
    if (!code) return;
    const n = await creerEmplacements([code], document.getElementById('emp-libelle')?.value?.trim());
    toastSuccess(n ? 'Étagère créée' : 'Déjà existante', code);
    document.getElementById('emp-code-unique').value = '';
    displayEntrepot();
}

// ───────── Étiquettes (Brother QL-700) ─────────
const FORMATS_ETIQUETTE = {
    '62x29': { l: 62, h: 29, nom: '62 × 29 mm (DK-11209)' },
    '90x29': { l: 90, h: 29, nom: '90 × 29 mm (DK-11201)' },
    '62x100': { l: 62, h: 100, nom: '62 × 100 mm (DK-11202)' },
};
function imprimerEtiquettesSelection() {
    const de = normCode(document.getElementById('emp-etq-de')?.value), a = normCode(document.getElementById('emp-etq-a')?.value);
    let codes = emplacements.map(e => e.code).sort(triCode);
    if (de) codes = codes.filter(c => triCode(c, de) >= 0);
    if (a) codes = codes.filter(c => triCode(c, a) <= 0);
    if (!codes.length) return toastError('Aucune étagère', 'Créez des étagères ou élargissez la plage.');
    imprimerEtiquettes(codes);
}
function imprimerEtiquettes(codes) {
    const fmt = FORMATS_ETIQUETTE[document.getElementById('emp-etq-format')?.value || '62x29'] || FORMATS_ETIQUETTE['62x29'];
    const avecQr = document.getElementById('emp-etq-qr') ? document.getElementById('emp-etq-qr').checked : true;
    const libelles = Object.fromEntries(emplacements.map(e => [e.code, e.libelle || '']));
    const w = window.open('', '_blank', 'width=700,height=600');
    if (!w) return toastError('Fenêtre bloquée', 'Autorisez les fenêtres pop-up pour Stock Radar, puis recommencez.');
    const haut = fmt.h >= 60;
    const qrTaille = haut ? Math.min(fmt.l - 8, 48) : fmt.h - 5;
    const policeCode = haut ? 26 : (avecQr ? Math.min(19, (fmt.l - qrTaille - 6) / 2.4) : 20);
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Étiquettes d'étagères</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
<style>
@page { size: ${fmt.l}mm ${fmt.h}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; }
body { font-family: Arial, Helvetica, sans-serif; }
.etq { width: ${fmt.l}mm; height: ${fmt.h}mm; display: flex; ${haut ? 'flex-direction: column;' : ''} align-items: center; justify-content: center; gap: 2.5mm; padding: 1.5mm 2mm; page-break-after: always; overflow: hidden; }
.etq:last-child { page-break-after: auto; }
.qr { width: ${qrTaille}mm; height: ${qrTaille}mm; flex: 0 0 auto; }
.qr img, .qr svg { width: 100%; height: 100%; display: block; }
.txt { display: flex; flex-direction: column; align-items: ${avecQr && !haut ? 'flex-start' : 'center'}; justify-content: center; min-width: 0; }
.code { font-size: ${policeCode}mm; font-weight: 800; line-height: 1; letter-spacing: .3mm; }
.lib { font-size: 2.8mm; margin-top: 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.aide { font: 13px Arial; padding: 10px; background: #fff8e1; border-bottom: 1px solid #e0c060; }
@media print { .aide { display: none; } }
</style></head><body>
<div class="aide">${codes.length} étiquette(s) au format ${fmt.nom}. Dans la fenêtre d'impression : choisissez la Brother QL-700, le papier « ${fmt.nom.replace(/ \(.*/, '')} », marges « Aucune », échelle 100 %.</div>
${codes.map(c => `<div class="etq">${avecQr ? `<div class="qr" data-code="${c}"></div>` : ''}<div class="txt"><div class="code">${c}</div>${libelles[c] ? `<div class="lib">${String(libelles[c]).replace(/</g, '&lt;')}</div>` : ''}</div></div>`).join('')}
<script>
function dessiner() {
  if (${avecQr} && typeof qrcode === 'undefined') return setTimeout(dessiner, 150);
  document.querySelectorAll('.qr').forEach(function (d) { var q = qrcode(0, 'M'); q.addData('${QR_PREFIXE}' + d.dataset.code); q.make(); d.innerHTML = q.createSvgTag({ margin: 0, scalable: true }); });
  setTimeout(function () { window.focus(); window.print(); }, 300);
}
window.addEventListener('load', dessiner);
<\/script></body></html>`);
    w.document.close();
}

// ───────── Mode rangement (scanner ou saisie) ─────────
function rgFeedback(texte, ok) {
    const f = document.getElementById('rg-feedback');
    if (!f) return;
    const l = document.createElement('div');
    l.className = 'rg-ligne ' + (ok === false ? 'ko' : ok === 'info' ? 'info' : 'ok');
    l.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' · ' + texte;
    f.prepend(l);
    while (f.children.length > 12) f.lastChild.remove();
}
function choisirEtagere(code) {
    code = normCode(code);
    if (!code) return;
    rangementEtagere = code;
    const e = document.getElementById('rg-etagere'); if (e) e.value = code;
    const a = document.getElementById('rg-etagere-active'); if (a) a.textContent = code;
    rgFeedback(`Étagère ${code}${emplacements.some(x => x.code === code) ? '' : ' (nouvelle : elle sera créée au premier rangement)'}`, 'info');
    document.getElementById('rg-ean')?.focus();
}
async function rangerScan(code, qte) {
    code = String(code || '').trim();
    if (!code) return;
    if (code.toUpperCase().startsWith(QR_PREFIXE) || emplacements.some(e => e.code === normCode(code))) return choisirEtagere(code);
    if (!rangementEtagere) { rgFeedback('Scannez d\'abord l\'étiquette de l\'étagère.', false); if (typeof playSound === 'function') playSound('ko'); return; }
    const cands = products.filter(p => !p.vendu && (p.ean === code || String(p.asin || '').toUpperCase() === code.toUpperCase()) && stockPhysique(p) > 0);
    if (!cands.length) { rgFeedback(`${code} : aucun produit au local avec ce code.`, false); if (typeof playSound === 'function') playSound('ko'); return; }
    const p = cands.find(x => qteARanger(x) > 0) || cands[0];
    const n = parseInt(qte) || 1;
    const ok = await rangerProduit(p.id, rangementEtagere, n, true);
    if (ok) {
        rgFeedback(`${p.nom} ×${n} → ${rangementEtagere} (reste à ranger : ${qteARanger(p)})`, true);
        if (typeof playSound === 'function') playSound('ok');
        if (navigator.vibrate) navigator.vibrate(80);
    }
    const champ = document.getElementById('rg-ean'); if (champ) { champ.value = ''; champ.focus(); }
    const q = document.getElementById('rg-qte'); if (q) q.value = 1;
}
async function demarrerCameraRangement() {
    if (typeof ZXing === 'undefined') return toastError('Scanner non disponible', 'Vérifiez votre connexion internet.');
    if (rangementReader) return arreterCameraRangement();
    if (typeof stopAllScanners === 'function') stopAllScanners('rangement');
    try {
        rangementReader = new ZXing.BrowserMultiFormatReader();
        const v = document.getElementById('rg-video'); v.style.display = 'block';
        document.getElementById('rg-camera-btn').textContent = 'Arrêter la caméra';
        const devices = await rangementReader.listVideoInputDevices();
        const back = devices.find(d => /back|arrière|environment/i.test(d.label)) || devices[devices.length - 1];
        rangementReader.decodeFromVideoDevice(back?.deviceId, 'rg-video', (res) => {
            if (!res || rangementPause) return;
            rangementPause = true; setTimeout(() => { rangementPause = false; }, 1500);
            rangerScan(res.getText(), document.getElementById('rg-qte')?.value);
        });
    } catch (e) { arreterCameraRangement(); toastError('Caméra', e.message); }
}
function arreterCameraRangement() {
    if (rangementReader) { try { rangementReader.reset(); } catch (e) {} rangementReader = null; }
    const v = document.getElementById('rg-video'); if (v) v.style.display = 'none';
    const b = document.getElementById('rg-camera-btn'); if (b) b.textContent = 'Scanner avec la caméra';
}
