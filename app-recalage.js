// ═══════════════════════════════════════════════════════════════════
// STOCK RADAR — Recalage du stock FBA sur l'inventaire Amazon
// Rapport « Gérer l'inventaire Expédié par Amazon » (.txt) de Seller Central.
// Stock chez Amazon = vendable + transferts entre entrepôts + en recherche + envois en route.
// Les unités envoyées mais encore comptées au local sont transférées (entrepôt → FBA),
// le reste est ajusté. Les achats ne sont jamais modifiés ; tout est noté dans le journal.
// ═══════════════════════════════════════════════════════════════════

let recalageData = null, recalageEnCours = false;

function analyserInventaireAmazon(texte) {
    const L = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (L.length < 2) return { erreur: 'Le fichier est vide.' };
    const h = L[0].split('\t').map(x => x.trim().toLowerCase());
    const ix = (n) => h.indexOf(n);
    if (ix('asin') < 0 || ix('afn-fulfillable-quantity') < 0) return { erreur: 'Ce n\'est pas le rapport « Gérer l\'inventaire Expédié par Amazon » (.txt).' };
    const A = {};
    L.slice(1).forEach(l => {
        const x = l.split('\t');
        const a = String(x[ix('asin')] || '').trim().toUpperCase();
        if (!a) return;
        const n = (k) => ix(k) < 0 ? 0 : (parseInt(x[ix(k)]) || 0);
        const o = A[a] = A[a] || { asin: a, sku: [], nom: x[ix('product-name')] || '', vendable: 0, transfert: 0, recherche: 0, entrant: 0, invendable: 0 };
        o.sku.push(x[ix('sku')] || '');
        o.vendable += n('afn-fulfillable-quantity');
        o.transfert += n('afn-fc-transfer-quantity');
        o.recherche += n('afn-researching-quantity');
        o.entrant += n('afn-inbound-working-quantity') + n('afn-inbound-shipped-quantity') + n('afn-inbound-receiving-quantity');
        o.invendable += n('afn-unsellable-quantity');
    });
    Object.values(A).forEach(o => { o.amazon = o.vendable + o.transfert + o.recherche + o.entrant; });
    return { asins: A };
}

function preparerRecalage(A) {
    const fichesAsin = (a) => products.filter(p => String(p.asin || '').toUpperCase() === a && !p.vendu)
        .sort((x, y) => String(x.date_ajout || '').localeCompare(String(y.date_ajout || '')));
    const ventesAsin = (a, ids) => ventes.filter(v => ids.includes(v.produit_id) || String(v.notes || '').includes('ASIN:' + a)).reduce((s, v) => s + (v.quantite || 1), 0);
    const plan = [], aVerifier = [], sansFiche = [];
    let identiques = 0;
    const vus = new Set();
    const traiter = (a, cible, nom) => {
        vus.add(a);
        const ps = fichesAsin(a);
        const sr = ps.reduce((s, p) => s + (p.qte_fba || 0), 0);
        if (!ps.length) { if (cible > 0) sansFiche.push({ asin: a, nom, amazon: cible }); return; }
        if (sr === cible) { identiques++; return; }
        if (sr > cible && cible === 0 && ventesAsin(a, ps.map(p => p.id)) === 0) { aVerifier.push({ asin: a, nom: ps[0].nom, sr, amazon: 0 }); return; }
        // Calcul des changements fiche par fiche
        const maj = new Map(), mvts = [];
        const get = (p) => maj.get(p.id) || { qte_fba: p.qte_fba || 0, qte_fbm: p.qte_fbm || 0, qte_entrepot: p.qte_entrepot || 0 };
        let ecart = cible - sr, transfert = 0, ajout = 0, retrait = 0;
        if (ecart > 0) {
            for (const p of ps.slice().reverse()) {
                if (ecart <= 0) break;
                const m = get(p);
                for (const k of ['qte_entrepot', 'qte_fbm']) {
                    const t = Math.min(m[k], ecart);
                    if (t > 0) { m[k] -= t; m.qte_fba += t; ecart -= t; transfert += t; mvts.push([p.id, 'transfert', t, k === 'qte_entrepot' ? 'entrepot' : 'fbm', 'fba', 'Recalage inventaire Amazon : envoi FBA non saisi']); }
                }
                maj.set(p.id, m);
            }
            if (ecart > 0) { const p = ps[ps.length - 1], m = get(p); m.qte_fba += ecart; ajout = ecart; maj.set(p.id, m); mvts.push([p.id, 'ajustement', ecart, '', 'fba', `Recalage inventaire Amazon : +${ecart} (Amazon ${cible})`]); }
        } else {
            let reste = -ecart;
            for (const p of ps) {
                if (reste <= 0) break;
                const m = get(p), t = Math.min(m.qte_fba, reste);
                if (t > 0) { m.qte_fba -= t; reste -= t; retrait += t; maj.set(p.id, m); mvts.push([p.id, 'ajustement', t, 'fba', '', `Recalage inventaire Amazon : −${t} (Amazon ${cible}, Stock Radar ${sr})`]); }
            }
        }
        plan.push({ asin: a, nom: ps[0].nom, sr, amazon: cible, transfert, ajout, retrait, maj, mvts });
    };
    Object.values(A).forEach(o => traiter(o.asin, o.amazon, o.nom));
    // Fiches avec du stock FBA dont l'ASIN n'est plus du tout chez Amazon
    [...new Set(products.filter(p => p.asin && (p.qte_fba || 0) > 0 && !p.vendu).map(p => String(p.asin).toUpperCase()))]
        .filter(a => !vus.has(a)).forEach(a => traiter(a, 0, ''));
    const sansAsin = products.filter(p => !p.asin && (p.qte_fba || 0) > 0 && !p.vendu).map(p => ({ id: p.id, nom: p.nom, ean: p.ean, sr: p.qte_fba }));
    return { plan, aVerifier, sansFiche, sansAsin, identiques, amazonTotal: Object.values(A).reduce((s, o) => s + o.amazon, 0), invendables: Object.values(A).reduce((s, o) => s + o.invendable, 0) };
}

function previewRecalage(input) {
    const f = input?.files?.[0];
    if (!f) return;
    f.text().then(t => { input.value = ''; traiterInventaireAmazon(t); });
}
function traiterInventaireAmazon(texte) {
    const a = analyserInventaireAmazon(texte);
    if (a.erreur) return toastError('Rapport non reconnu', a.erreur);
    recalageData = preparerRecalage(a.asins);
    if (typeof switchTab === 'function') switchTab('recalage');
    displayRecalage();
}

function displayRecalage() {
    const c = document.getElementById('recalage-container');
    if (!c) return;
    const fbaSR = products.reduce((s, p) => s + (p.vendu ? 0 : (p.qte_fba || 0)), 0);
    if (!recalageData) {
        c.innerHTML = `<div class="empty-state"><h3>Stock FBA dans Stock Radar : ${fbaSR.toLocaleString('fr-FR')} unités</h3>
            <p>Téléchargez dans Seller Central le rapport « Gérer l'inventaire Expédié par Amazon » au format .txt, puis déposez-le ici. Vous verrez un aperçu avant tout changement.</p></div>`;
        return;
    }
    const d = recalageData;
    const T = (k) => d.plan.reduce((s, x) => s + x[k], 0);
    const nb = (f) => d.plan.filter(f).length;
    const lignes = (list, cols) => list.length ? `<div class="products-table" style="max-height:360px;overflow-y:auto;"><table class="achats-table"><thead><tr>${cols.map(c => `<th${c[2] ? ' class="num"' : ''}>${c[0]}</th>`).join('')}</tr></thead><tbody>${list.map(x => `<tr style="cursor:default;">${cols.map(c => `<td${c[2] ? ' class="num"' : ''}>${c[1](x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="sous-prix">Aucun.</p>';
    const nom = (x) => `<div class="achat-nom">${escapeHtml(x.nom || '-')}</div><div class="achat-codes"><span class="code-copiable">${boutonCopier(x.asin, 'ASIN')}<span class="code-lib">ASIN</span><span>${escapeHtml(x.asin || '')}</span></span></div>`;
    c.innerHTML = `
        <div class="retours-bilan">
            <div><span>Stock Radar aujourd'hui</span><strong>${fbaSR.toLocaleString('fr-FR')}</strong><small>unités FBA</small></div>
            <div><span>Chez Amazon</span><strong>${d.amazonTotal.toLocaleString('fr-FR')}</strong><small>vendable, en transfert, en route · ${d.invendables} invendable(s) à part</small></div>
            <div><span>Déjà identiques</span><strong>${d.identiques}</strong><small>produits</small></div>
            <div><span>À corriger</span><strong>${d.plan.length}</strong><small>produits</small></div>
        </div>
        <div class="retours-aide" style="display:block;">
            <strong>Ce qui sera fait :</strong> ${nb(x => x.transfert > 0)} produit(s) transférés du local vers le FBA (${T('transfert')} u., envois non saisis) ·
            ${nb(x => x.ajout > 0)} ajusté(s) à la hausse (+${T('ajout')} u.) · ${nb(x => x.retrait > 0)} ajusté(s) à la baisse (−${T('retrait')} u.).
            Les achats ne changent pas ; chaque correction est notée dans le journal des mouvements.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px;">
            <button type="button" class="scan-button" id="recalage-btn" onclick="appliquerRecalage()" ${d.plan.length ? '' : 'disabled'}>Appliquer le recalage (${d.plan.length} produits)</button>
            <button type="button" class="scan-button export" onclick="recalageData=null;displayRecalage()">Annuler</button>
        </div>
        <h3 style="font-size:15px;margin:14px 0 6px;">Corrections prévues</h3>
        ${lignes(d.plan.slice().sort((a, b) => Math.abs(b.amazon - b.sr) - Math.abs(a.amazon - a.sr)), [['Produit', nom], ['Stock Radar', x => x.sr, 1], ['Amazon', x => x.amazon, 1], ['Correction', x => [x.transfert ? `transfert ${x.transfert}` : '', x.ajout ? `+${x.ajout}` : '', x.retrait ? `−${x.retrait}` : ''].filter(Boolean).join(' · ')]])}
        <h3 style="font-size:15px;margin:18px 0 6px;">À vérifier, non modifiés (${d.aVerifier.length})</h3>
        <p class="sous-prix">Du stock FBA dans Stock Radar, aucune vente enregistrée et rien chez Amazon : vendus ailleurs, retirés, ou jamais envoyés ? Vérifiez aussi que l'ASIN de la fiche est bien un ASIN (pas un EAN).</p>
        ${lignes(d.aVerifier, [['Produit', nom], ['Stock Radar', x => x.sr, 1]])}
        <h3 style="font-size:15px;margin:18px 0 6px;">Chez Amazon sans fiche (${d.sansFiche.length})</h3>
        ${lignes(d.sansFiche.sort((a, b) => b.amazon - a.amazon), [['Produit', nom], ['Amazon', x => x.amazon, 1]])}
        <h3 style="font-size:15px;margin:18px 0 6px;">Fiches FBA sans ASIN (${d.sansAsin.length})</h3>
        <p class="sous-prix">Ajoutez l'ASIN sur la fiche pour qu'elle soit recalée la prochaine fois.</p>
        ${lignes(d.sansAsin, [['Produit', x => `<a href="#" onclick="event.preventDefault();openProductModal(${x.id})">${escapeHtml(x.nom || '-')}</a> <span class="sous-prix">${escapeHtml(x.ean || '')}</span>`], ['Stock FBA', x => x.sr, 1]])}`;
}

async function appliquerRecalage() {
    if (recalageEnCours || !recalageData?.plan.length) return;
    if (!await srConfirm(`Recaler le stock FBA de ${recalageData.plan.length} produit(s) sur l'inventaire Amazon ?\n\nLes achats ne changent pas. Chaque correction est notée dans le journal des mouvements.`, 'Recalage FBA')) return;
    recalageEnCours = true;
    const btn = document.getElementById('recalage-btn');
    if (btn) btn.disabled = true;
    let ok = 0, erreurs = 0;
    try {
        const uid = getEffectiveUserId();
        const plan = recalageData.plan;
        for (let k = 0; k < plan.length; k += 8) {
            await Promise.all(plan.slice(k, k + 8).map(async (x) => {
                for (const [id, m] of x.maj) {
                    const p = products.find(q => q.id === id);
                    const v = { ...m, quantite: m.qte_fba + m.qte_fbm + m.qte_entrepot };
                    const { error } = await sb.from('produits').update(v).eq('id', id);
                    if (error) { erreurs++; console.warn('Recalage:', error.message); return; }
                    if (p) Object.assign(p, v);
                }
                const lignes = x.mvts.map(([id, type, q, de, vers, raison]) => {
                    const p = products.find(y => y.id === id);
                    return { user_id: uid, produit_id: id, produit_ean: p?.ean || '', produit_nom: p?.nom || '', type, quantite: q, de_emplacement: de, vers_emplacement: vers, raison, notes: '' };
                });
                if (lignes.length) await sb.from('mouvements').insert(lignes);
                ok++;
            }));
            if (btn) btn.textContent = `Recalage… ${Math.min(k + 8, plan.length)} / ${plan.length}`;
        }
        if (erreurs) toastError('Recalage incomplet', `${ok} produit(s) recalé(s), ${erreurs} erreur(s).`);
        else toastSuccess('Stock FBA recalé', `${ok} produit(s) alignés sur l'inventaire Amazon.`);
        const reste = recalageData;
        recalageData = { ...reste, plan: [], identiques: reste.identiques + ok };
        displayRecalage();
        if (typeof displayStock === 'function') displayStock();
        if (typeof updateDashboard === 'function') updateDashboard();
    } finally {
        recalageEnCours = false;
    }
}

// Le rapport peut aussi arriver de Seller Central (fenêtre ouverte par Stock Radar ou extension)
window.addEventListener('message', (e) => {
    if (!/^https:\/\/sellercentral(-europe)?\.amazon\./.test(e.origin)) return;
    if (e.data && e.data.type === 'SR_RAPPORT_INVENTAIRE' && typeof e.data.texte === 'string') traiterInventaireAmazon(e.data.texte);
});
