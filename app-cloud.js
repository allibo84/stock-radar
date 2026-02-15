// ═══════════════════════════════════════════════
// STOCK RADAR V2 - app-cloud.js
// ═══════════════════════════════════════════════

// sb est créé dans config.js
let fournisseurs = [], achats = [], products = [], mouvements = [];
let currentPhotos = [], currentVenteProductId = null;
let activeStockView = 'all';
let charts = {};
let achatsFiltersInit = false, grossisteData = null;
let realtimeChannel = null;

// ═══════ DATA LOADING ═══════
async function loadAllData() {
    try {
        await Promise.all([
            loadFournisseurs().catch(e => console.warn('Fournisseurs:', e)),
            loadAchats().catch(e => console.warn('Achats:', e)),
            loadProducts().catch(e => console.warn('Produits:', e)),
            loadMouvements().catch(e => console.warn('Mouvements:', e)),
            loadFactures().catch(e => console.warn('Factures:', e)),
        ]);
    } catch (e) { console.error('Erreur chargement:', e); }
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    updateDashboard();
    setupRealtimeSync();
}

async function loadFournisseurs() {
    let query = sb.from('fournisseurs').select('*').order('nom');
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur fournisseurs:', error.message);
    fournisseurs = data || [];
    displayFournisseurs();
    updateFournisseursSelect();
}

async function loadAchats() {
    let query = sb.from('achats').select('*').order('date_achat', { ascending: false });
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur achats:', error.message);
    achats = data || [];
    displayAchats();
    populateAchatsFilters();
    updateAchatsStats();
}

async function loadProducts() {
    let query = sb.from('produits').select('*').order('date_ajout', { ascending: false });
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur produits:', error.message);
    products = (data || []).map(p => ({
        ...p,
        etat_stock: p.etat_stock || 'neuf',
        statut: p.statut || 'recu',
        emplacement: p.emplacement || '',
        seuil_stock: p.seuil_stock || 0,
        qte_fba: p.qte_fba || 0,
        qte_fbm: p.qte_fbm || 0,
        qte_entrepot: p.qte_entrepot || (p.quantite || 1),
        quantite: p.quantite || 1,
        amazon_fba: p.amazon_fba || false,
        amazon_fbm: p.amazon_fbm || false,
    }));
    displayStock();
    updateDashboard();
    displayAlertes();
}

async function loadMouvements() {
    let query = sb.from('mouvements').select('*').order('created_at', { ascending: false }).limit(200);
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur mouvements:', error.message);
    mouvements = data || [];
    displayMouvements();
}

function setupRealtimeSync() {
    if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    realtimeChannel = sb.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'produits' }, () => loadProducts())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'achats' }, () => loadAchats())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fournisseurs' }, () => loadFournisseurs())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mouvements' }, () => loadMouvements())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'factures' }, () => loadFactures())
        .subscribe();
}

// ═══════ NAVIGATION ═══════
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    const tab = document.getElementById(tabName);
    if (tab) tab.classList.add('active');
    const menuItem = document.querySelector(`.menu-item[data-tab="${tabName}"]`);
    if (menuItem) menuItem.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay').style.display = 'none';
    if (tabName === 'stock') displayStock();
    if (tabName === 'dashboard') updateDashboard();
}

document.addEventListener('click', e => {
    const mi = e.target.closest('.menu-item');
    if (mi && mi.dataset.tab) switchTab(mi.dataset.tab);
});

function escapeHtml(t) {
    if (!t) return '';
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════ FOURNISSEURS ═══════
let factures = [];

function displayFournisseurs() {
    const c = document.getElementById('fournisseurs-container');
    if (!c) return;
    if (!fournisseurs.length) { c.innerHTML = '<div class="empty-state"><h3>Aucun fournisseur</h3></div>'; return; }
    
    let h = '';
    fournisseurs.forEach(f => {
        const nbAchats = achats.filter(a => a.fournisseur_nom === f.nom).length;
        const totalAchats = achats.filter(a => a.fournisseur_nom === f.nom).reduce((s, a) => s + (a.prix_ttc || 0), 0);
        const catBadge = f.categorie_fournisseur ? `<span style="background:#27352a;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">${f.categorie_fournisseur}</span>` : '';
        
        h += `<div class="fournisseur-card" onclick="openFournisseurModal(${f.id})">
            <div class="fournisseur-header">
                <div><strong style="font-size:16px;">${escapeHtml(f.nom)}</strong> ${catBadge}</div>
                <div style="display:flex;gap:8px;" onclick="event.stopPropagation()">
                    <button class="btn-small" style="background:#3498db;color:white;padding:5px 10px;border-radius:6px;" onclick="openFournisseurModal(${f.id})">👁️</button>
                    <button class="btn-small btn-delete" onclick="deleteFournisseur(${f.id})">🗑️</button>
                </div>
            </div>
            <div class="fournisseur-details">
                ${f.contact ? `<div class="fournisseur-detail">👤 <strong>${escapeHtml(f.contact)}</strong></div>` : ''}
                ${f.email ? `<div class="fournisseur-detail">📧 ${escapeHtml(f.email)}</div>` : ''}
                ${f.tel ? `<div class="fournisseur-detail">📞 ${escapeHtml(f.tel)}</div>` : ''}
                <div class="fournisseur-detail">🛒 <strong>${nbAchats}</strong> achats · <strong>${totalAchats.toFixed(2)}€</strong></div>
                ${f.delai_livraison ? `<div class="fournisseur-detail">🚚 ${escapeHtml(f.delai_livraison)}</div>` : ''}
                ${f.moq > 0 ? `<div class="fournisseur-detail">📦 MOQ: ${f.moq}</div>` : ''}
            </div>
        </div>`;
    });
    c.innerHTML = h;
}

document.getElementById('fournisseur-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const f = {
        nom: document.getElementById('f-nom').value.trim(),
        contact: document.getElementById('f-contact').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        tel: document.getElementById('f-tel').value.trim(),
        adresse: document.getElementById('f-adresse').value.trim(),
        site_web: document.getElementById('f-siteweb')?.value.trim() || '',
        siret: document.getElementById('f-siret')?.value.trim() || '',
        tva_intra: document.getElementById('f-tva')?.value.trim() || '',
        conditions_paiement: document.getElementById('f-conditions')?.value.trim() || '',
        delai_livraison: document.getElementById('f-delai')?.value.trim() || '',
        moq: parseInt(document.getElementById('f-moq')?.value) || 0,
        franco: parseFloat(document.getElementById('f-franco')?.value) || 0,
        categorie_fournisseur: document.getElementById('f-categorie-fournisseur')?.value || '',
        notes: document.getElementById('f-notes').value.trim()
    };
    if (!f.nom) return alert('Nom requis');
    const { error } = await sb.from('fournisseurs').insert([f]);
    if (error) return alert('Erreur: ' + error.message);
    this.reset();
    document.getElementById('fournisseur-form-section').style.display = 'none';
    await loadFournisseurs();
});

async function deleteFournisseur(id) {
    if (!confirm('Supprimer ce fournisseur ?')) return;
    await sb.from('fournisseurs').delete().eq('id', id);
    await loadFournisseurs();
}

// Fiche fournisseur modale
function openFournisseurModal(id) {
    const f = fournisseurs.find(x => x.id === id);
    if (!f) return;
    
    const fAchats = achats.filter(a => a.fournisseur_nom === f.nom);
    const totalAchats = fAchats.reduce((s, a) => s + (a.prix_ttc || 0), 0);
    const fFactures = factures.filter(fa => fa.fournisseur_id === f.id);
    
    // Historique prix par EAN
    const prixParEAN = {};
    fAchats.forEach(a => {
        if (!a.ean) return;
        if (!prixParEAN[a.ean]) prixParEAN[a.ean] = { nom: a.nom, prix: [] };
        prixParEAN[a.ean].prix.push({ date: a.date_achat, ht: a.prix_ht || 0, ttc: a.prix_ttc || 0 });
    });

    const body = document.getElementById('fournisseur-modal-body');
    let h = `<h2 style="margin-bottom:5px;">${escapeHtml(f.nom)}</h2>
        <p style="color:var(--text-secondary);margin-bottom:20px;">${f.categorie_fournisseur ? f.categorie_fournisseur + ' · ' : ''}${fAchats.length} achats · ${totalAchats.toFixed(2)}€ total</p>
        
        <div class="detail-grid">
            <div class="detail-item"><div class="detail-label">Contact</div><div class="detail-value">${escapeHtml(f.contact||'-')}</div></div>
            <div class="detail-item"><div class="detail-label">Email</div><div class="detail-value">${f.email ? `<a href="mailto:${f.email}">${escapeHtml(f.email)}</a>` : '-'}</div></div>
            <div class="detail-item"><div class="detail-label">Téléphone</div><div class="detail-value">${f.tel ? `<a href="tel:${f.tel}">${escapeHtml(f.tel)}</a>` : '-'}</div></div>
            <div class="detail-item"><div class="detail-label">Adresse</div><div class="detail-value">${escapeHtml(f.adresse||'-')}</div></div>
            <div class="detail-item"><div class="detail-label">Site web</div><div class="detail-value">${f.site_web ? `<a href="${f.site_web}" target="_blank">${escapeHtml(f.site_web)}</a>` : '-'}</div></div>
            <div class="detail-item"><div class="detail-label">SIRET</div><div class="detail-value">${escapeHtml(f.siret||'-')}</div></div>
            <div class="detail-item"><div class="detail-label">TVA Intra.</div><div class="detail-value">${escapeHtml(f.tva_intra||'-')}</div></div>
            <div class="detail-item"><div class="detail-label">Conditions paiement</div><div class="detail-value">${escapeHtml(f.conditions_paiement||'-')}</div></div>
            <div class="detail-item"><div class="detail-label">Délai livraison</div><div class="detail-value">${escapeHtml(f.delai_livraison||'-')}</div></div>
            <div class="detail-item"><div class="detail-label">MOQ</div><div class="detail-value">${f.moq > 0 ? f.moq + ' unités' : '-'}</div></div>
            <div class="detail-item"><div class="detail-label">Franco de port</div><div class="detail-value">${f.franco > 0 ? f.franco.toFixed(2) + '€' : '-'}</div></div>
        </div>
        ${f.notes ? `<div style="margin:15px 0;padding:12px;background:var(--filter-bg);border-radius:8px;"><strong>Notes :</strong> ${escapeHtml(f.notes)}</div>` : ''}`;

    // Historique prix par produit
    const eanKeys = Object.keys(prixParEAN);
    if (eanKeys.length) {
        h += `<h3 style="margin:25px 0 10px;">📈 Historique prix par produit</h3>
        <div class="products-table"><table><thead><tr><th>EAN</th><th>Produit</th><th>Date</th><th>Prix HT</th><th>Prix TTC</th><th>Évolution</th></tr></thead><tbody>`;
        
        eanKeys.forEach(ean => {
            const item = prixParEAN[ean];
            const sorted = item.prix.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
            sorted.forEach((p, i) => {
                let evol = '';
                if (i > 0 && sorted[i-1].ttc > 0) {
                    const diff = ((p.ttc - sorted[i-1].ttc) / sorted[i-1].ttc * 100);
                    evol = diff > 0 ? `<span style="color:#e74c3c;">+${diff.toFixed(1)}% ↑</span>` : diff < 0 ? `<span style="color:#27ae60;">${diff.toFixed(1)}% ↓</span>` : '<span style="color:#95a5a6;">= 0%</span>';
                }
                h += `<tr><td>${escapeHtml(ean)}</td><td>${escapeHtml(item.nom||'')}</td><td>${p.date ? new Date(p.date).toLocaleDateString('fr-FR') : '-'}</td><td>${(p.ht||0).toFixed(2)}€</td><td>${(p.ttc||0).toFixed(2)}€</td><td>${evol}</td></tr>`;
            });
        });
        h += '</tbody></table></div>';
    }

    // Factures du fournisseur
    if (fFactures.length) {
        h += `<h3 style="margin:25px 0 10px;">🧾 Factures</h3>
        <div class="products-table"><table><thead><tr><th>N°</th><th>Date</th><th>Échéance</th><th>Montant TTC</th><th>Statut</th></tr></thead><tbody>`;
        fFactures.forEach(fa => {
            const isRetard = !fa.payee && fa.date_echeance && new Date(fa.date_echeance) < new Date();
            const badge = fa.payee ? '<span class="badge-payee">✅ Payée</span>' : isRetard ? '<span class="badge-retard">⚠️ En retard</span>' : '<span class="badge-impayee">🔴 Impayée</span>';
            h += `<tr><td>${escapeHtml(fa.numero)}</td><td>${fa.date_facture ? new Date(fa.date_facture).toLocaleDateString('fr-FR') : '-'}</td><td>${fa.date_echeance ? new Date(fa.date_echeance).toLocaleDateString('fr-FR') : '-'}</td><td>${(fa.montant_ttc||0).toFixed(2)}€</td><td>${badge}</td></tr>`;
        });
        h += '</tbody></table></div>';
    }

    // Derniers achats
    if (fAchats.length) {
        h += `<h3 style="margin:25px 0 10px;">🛒 Derniers achats (${fAchats.length})</h3>
        <div class="products-table"><table><thead><tr><th>Date</th><th>EAN</th><th>Produit</th><th>Qté</th><th>Prix TTC</th><th>Reçu</th></tr></thead><tbody>`;
        fAchats.slice(0, 20).forEach(a => {
            h += `<tr><td>${a.date_achat ? new Date(a.date_achat).toLocaleDateString('fr-FR') : '-'}</td><td>${escapeHtml(a.ean)}</td><td>${escapeHtml(a.nom)}</td><td>${a.quantite||1}</td><td>${(a.prix_ttc||0).toFixed(2)}€</td><td>${a.recu ? '✅' : '⏳'}</td></tr>`;
        });
        h += '</tbody></table></div>';
    }

    body.innerHTML = h;
    document.getElementById('fournisseur-modal').style.display = 'flex';
}

function closeFournisseurModal() {
    document.getElementById('fournisseur-modal').style.display = 'none';
}

// ═══════ FACTURES ═══════
async function loadFactures() {
    let query = sb.from('factures').select('*').order('date_facture', { ascending: false });
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur factures:', error.message);
    factures = data || [];
    displayFactures();
    updateFacturesSelect();
}

function updateFacturesSelect() {
    const sel = document.getElementById('fac-fournisseur');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">--</option>';
    fournisseurs.forEach(f => sel.innerHTML += `<option value="${f.id}">${escapeHtml(f.nom)}</option>`);
    sel.value = cur;
}

function displayFactures() {
    const c = document.getElementById('factures-container');
    if (!c) return;
    
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('fac-total', factures.length);
    el('fac-montant', factures.reduce((s, f) => s + (f.montant_ttc || 0), 0).toFixed(2) + '€');
    const impayees = factures.filter(f => !f.payee);
    el('fac-impayees', impayees.length);
    el('fac-montant-du', impayees.reduce((s, f) => s + (f.montant_ttc || 0), 0).toFixed(2) + '€');
    
    if (!factures.length) { c.innerHTML = '<div class="empty-state"><h3>Aucune facture</h3></div>'; return; }
    
    let h = '<div class="products-table"><table><thead><tr><th>N°</th><th>Fournisseur</th><th>Date</th><th>Échéance</th><th>HT</th><th>TTC</th><th>Statut</th><th>Actions</th></tr></thead><tbody>';
    
    factures.forEach(fa => {
        const isRetard = !fa.payee && fa.date_echeance && new Date(fa.date_echeance) < new Date();
        const badge = fa.payee ? '<span class="badge-payee">✅ Payée</span>' : isRetard ? '<span class="badge-retard">⚠️ Retard</span>' : '<span class="badge-impayee">🔴 Impayée</span>';
        
        h += `<tr>
            <td><strong>${escapeHtml(fa.numero)}</strong></td>
            <td>${escapeHtml(fa.fournisseur_nom||'-')}</td>
            <td>${fa.date_facture ? new Date(fa.date_facture).toLocaleDateString('fr-FR') : '-'}</td>
            <td>${fa.date_echeance ? new Date(fa.date_echeance).toLocaleDateString('fr-FR') : '-'}</td>
            <td>${(fa.montant_ht||0).toFixed(2)}€</td>
            <td><strong>${(fa.montant_ttc||0).toFixed(2)}€</strong></td>
            <td>${badge}</td>
            <td><div class="action-buttons">
                ${!fa.payee ? `<button class="btn-small" style="background:#27ae60;color:white;padding:4px 8px;border-radius:6px;" onclick="marquerPayee(${fa.id})">💰</button>` : ''}
                <button class="btn-small btn-delete" onclick="deleteFacture(${fa.id})">🗑️</button>
            </div></td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
}

document.getElementById('facture-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const fId = parseInt(document.getElementById('fac-fournisseur').value);
    const fObj = fournisseurs.find(f => f.id === fId);
    
    const fa = {
        numero: document.getElementById('fac-numero').value.trim(),
        fournisseur_id: fId || null,
        fournisseur_nom: fObj ? fObj.nom : '',
        date_facture: document.getElementById('fac-date').value || null,
        date_echeance: document.getElementById('fac-echeance').value || null,
        montant_ht: parseFloat(document.getElementById('fac-montant-ht').value) || 0,
        montant_ttc: parseFloat(document.getElementById('fac-montant-ttc').value) || 0,
        notes: document.getElementById('fac-notes').value.trim(),
        payee: false
    };
    if (!fa.numero) return alert('N° facture requis');
    const { error } = await sb.from('factures').insert([fa]);
    if (error) return alert('Erreur: ' + error.message);
    this.reset();
    document.getElementById('facture-form-section').style.display = 'none';
    await loadFactures();
});

async function marquerPayee(id) {
    if (!confirm('Marquer cette facture comme payée ?')) return;
    await sb.from('factures').update({ payee: true, date_paiement: new Date().toISOString().split('T')[0] }).eq('id', id);
    await loadFactures();
}

async function deleteFacture(id) {
    if (!confirm('Supprimer cette facture ?')) return;
    await sb.from('factures').delete().eq('id', id);
    await loadFactures();
}

function updateFournisseursSelect() {
    ['a-fournisseur', 'filter-achat-fournisseur'].forEach(sid => {
        const sel = document.getElementById(sid);
        if (!sel) return;
        const val = sel.value;
        const first = sel.options[0].outerHTML;
        sel.innerHTML = first;
        fournisseurs.forEach(f => sel.innerHTML += `<option value="${f.id}">${escapeHtml(f.nom)}</option>`);
        sel.value = val;
    });
}

// ═══════ ACHATS ═══════
function calculateTTC() {
    const ht = parseFloat(document.getElementById('a-prix-ht')?.value) || 0;
    const ttcEl = document.getElementById('a-prix-ttc');
    if (ttcEl && ht > 0) ttcEl.value = (ht * 1.20).toFixed(2);
}

function calculateHT() {
    const ttc = parseFloat(document.getElementById('a-prix-ttc')?.value) || 0;
    const htEl = document.getElementById('a-prix-ht');
    if (htEl && ttc > 0) htEl.value = (ttc / 1.20).toFixed(2);
}

document.getElementById('achat-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const fId = document.getElementById('a-fournisseur').value;
    const fObj = fournisseurs.find(f => f.id == fId);
    const a = {
        ean: document.getElementById('a-ean').value.trim(),
        nom: document.getElementById('a-nom').value.trim(),
        categorie: document.getElementById('a-categorie').value,
        fournisseur_id: fId ? parseInt(fId) : null,
        fournisseur_nom: fObj ? fObj.nom : '',
        prix_ht: parseFloat(document.getElementById('a-prix-ht').value) || 0,
        prix_ttc: parseFloat(document.getElementById('a-prix-ttc').value) || 0,
        quantite: parseInt(document.getElementById('a-quantite').value) || 1,
        notes: document.getElementById('a-notes').value.trim(),
        date_achat: document.getElementById('a-date').value || new Date().toISOString(),
    };
    if (!a.ean || !a.nom) return alert('EAN et Nom requis');
    const { error } = await sb.from('achats').insert([a]);
    if (error) return alert('Erreur: ' + error.message);
    this.reset();
    document.getElementById('achat-form-section').style.display = 'none';
    await loadAchats();
});

function displayAchats() {
    const c = document.getElementById('achats-container');
    if (!c) return;
    const filtered = filterAchats();
    if (!filtered.length) { c.innerHTML = '<div class="empty-state"><h3>Aucun achat</h3></div>'; return; }
    let h = '<div class="products-table"><table><thead><tr><th>Date</th><th>EAN</th><th>Produit</th><th>Fournisseur</th><th>Qté</th><th>Prix HT</th><th>Prix TTC</th><th>Reçu</th><th>Actions</th></tr></thead><tbody>';
    filtered.forEach(a => {
        const d = a.date_achat ? new Date(a.date_achat).toLocaleDateString('fr-FR') : '-';
        const recuBadge = a.recu ? '<span class="badge badge-stock" style="cursor:pointer">✅ Reçu</span>' : '<span class="badge badge-invendable" style="cursor:pointer">⏳ Attente</span>';
        h += `<tr><td>${d}</td><td>${escapeHtml(a.ean)}</td><td><strong>${escapeHtml(a.nom)}</strong></td><td>${escapeHtml(a.fournisseur_nom||'-')}</td><td>${a.quantite||1}</td><td>${(a.prix_ht||0).toFixed(2)}€</td><td>${(a.prix_ttc||0).toFixed(2)}€</td><td onclick="toggleRecu(${a.id},${!a.recu})">${recuBadge}</td><td><button class="btn-small btn-delete" onclick="deleteAchat(${a.id})">🗑️</button></td></tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
}

function filterAchats() {
    const s = document.getElementById('search-achats')?.value.toLowerCase() || '';
    const f = document.getElementById('filter-achat-fournisseur')?.value || '';
    const r = document.getElementById('filter-achat-recu')?.value || '';
    return achats.filter(a => {
        if (s && !(a.nom||'').toLowerCase().includes(s) && !(a.ean||'').toLowerCase().includes(s)) return false;
        if (f && a.fournisseur_id != f) return false;
        if (r === 'oui' && !a.recu) return false;
        if (r === 'non' && a.recu) return false;
        return true;
    });
}

function populateAchatsFilters() {
    if (!achatsFiltersInit) {
        document.getElementById('search-achats')?.addEventListener('input', displayAchats);
        document.getElementById('filter-achat-fournisseur')?.addEventListener('change', displayAchats);
        document.getElementById('filter-achat-recu')?.addEventListener('change', displayAchats);
        achatsFiltersInit = true;
    }
}

function updateAchatsStats() {
    const filtered = filterAchats();
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('achats-total', filtered.length);
    el('achats-montant', filtered.reduce((s, a) => s + ((a.prix_ttc || 0) * (a.quantite || 1)), 0).toFixed(2) + '€');
    el('achats-en-attente', filtered.filter(a => !a.recu).length);
}

async function toggleRecu(id, v) {
    await sb.from('achats').update({ recu: v }).eq('id', id);
    
    // Si on marque comme reçu → créer le produit dans le stock
    if (v === true) {
        const achat = achats.find(a => a.id === id);
        if (achat) {
            const pr = {
                ean: achat.ean,
                nom: achat.nom,
                categorie: achat.categorie || '',
                etat: 'Neuf',
                etat_stock: 'neuf',
                statut: 'recu',
                emplacement: '',
                prix_achat: achat.prix_ttc || achat.prix_ht || 0,
                prix_revente: 0,
                qte_fba: 0,
                qte_fbm: 0,
                qte_entrepot: achat.quantite || 1,
                quantite: achat.quantite || 1,
                amazon_fba: false,
                amazon_fbm: false,
                vinted: false,
                leboncoin: false,
                invendable: false,
                vendu: false,
                photos: [],
                notes: achat.notes || '',
                date_ajout: new Date().toISOString(),
            };
            const { data: inserted, error } = await sb.from('produits').insert([pr]).select();
            if (error) console.warn('Erreur création produit depuis achat:', error.message);
            if (inserted && inserted[0]) {
                await logMouvement(inserted[0].id, 'reception', achat.quantite || 1, 'achat', 'entrepot', 'Réception achat', achat.fournisseur_nom || '');
            }
            await loadProducts();
            updateDashboard();
        }
    }
    
    await loadAchats();
}

async function deleteAchat(id) {
    if (!confirm('Supprimer cet achat ?')) return;
    await sb.from('achats').delete().eq('id', id);
    await loadAchats();
}

function exportAchatsCSV() {
    if (!achats.length) return alert('Aucun achat');
    let csv = '\uFEFFDate,EAN,Nom,Fournisseur,Qté,Prix HT,Prix TTC,Reçu,Notes\n';
    achats.forEach(a => {
        csv += `"${a.date_achat?new Date(a.date_achat).toLocaleDateString('fr-FR'):'-'}","${a.ean}","${a.nom}","${a.fournisseur_nom||''}",${a.quantite||1},${(a.prix_ht||0).toFixed(2)},${(a.prix_ttc||0).toFixed(2)},"${a.recu?'Oui':'Non'}","${(a.notes||'').replace(/"/g,'""')}"\n`;
    });
    downloadCSV(csv, 'achats.csv');
}

// ═══════ NOUVEAU PRODUIT ═══════
function recalcPrixAchat() {
    const val = parseFloat(document.getElementById('prix-achat')?.value) || 0;
    const isHT = document.getElementById('prix-type-ht')?.checked;
    const conv = document.getElementById('prix-achat-conv');
    if (!conv) return;
    if (val > 0) {
        conv.style.display = 'block';
        conv.textContent = isHT ? `TTC: ${(val * 1.20).toFixed(2)}€` : `HT: ${(val / 1.20).toFixed(2)}€`;
    } else { conv.style.display = 'none'; }
    calculateMarge();
}

function getPrixAchatTTC() {
    const val = parseFloat(document.getElementById('prix-achat')?.value) || 0;
    return document.getElementById('prix-type-ht')?.checked ? val * 1.20 : val;
}

function calculateMarge() {
    const achat = getPrixAchatTTC();
    const revente = parseFloat(document.getElementById('prix-revente')?.value) || 0;
    const disp = document.getElementById('marge-display');
    if (!disp) return;
    if (achat > 0 && revente > 0) {
        const marge = ((revente - achat) / achat * 100);
        disp.style.display = 'block';
        disp.innerHTML = `Marge: <strong style="color:${marge>=30?'#27ae60':marge>=10?'#f39c12':'#e74c3c'}">${marge.toFixed(1)}%</strong> (${(revente-achat).toFixed(2)}€)`;
    } else { disp.style.display = 'none'; }
}

function updateTotalQte() {
    const fba = parseInt(document.getElementById('qte-fba')?.value) || 0;
    const fbm = parseInt(document.getElementById('qte-fbm')?.value) || 0;
    const ent = parseInt(document.getElementById('qte-entrepot')?.value) || 0;
    const total = fba + fbm + ent;
    const el = document.getElementById('total-qte-display');
    if (el) el.textContent = `Total : ${total} unités`;
    // Auto-check canaux
    if (document.getElementById('amazon_fba')) document.getElementById('amazon_fba').checked = fba > 0;
    if (document.getElementById('amazon_fbm')) document.getElementById('amazon_fbm').checked = fbm > 0;
}

function checkPurchaseHistory() {
    const ean = document.getElementById('ean')?.value.trim();
    const infoEl = document.getElementById('info-achat');
    const infoText = document.getElementById('info-achat-text');
    if (!ean || !infoEl || !infoText) return;
    
    // Chercher dans le stock existant (produits neuf non vendus)
    const stockNeuf = products.filter(p => p.ean === ean && !p.vendu && p.etat_stock === 'neuf');
    
    // Chercher dans les achats
    const found = achats.filter(a => a.ean === ean);
    
    if (stockNeuf.length) {
        const s = stockNeuf[0];
        infoEl.style.display = 'block';
        infoText.textContent = `En stock neuf : ${s.nom} — ${(s.prix_achat||0).toFixed(2)}€ TTC — ${s.quantite||0} unités`;
        if (!document.getElementById('product-name').value) document.getElementById('product-name').value = s.nom;
        if (!document.getElementById('categorie').value && s.categorie) document.getElementById('categorie').value = s.categorie;
        // Pré-remplir le prix d'achat
        if (!document.getElementById('prix-achat').value || document.getElementById('prix-achat').value === '0') {
            document.getElementById('prix-achat').value = (s.prix_achat || 0).toFixed(2);
            document.getElementById('prix-type-ht').checked = false;
            document.getElementById('prix-type-ttc').checked = true;
            recalcPrixAchat();
        }
        // Pré-remplir le prix de revente si existant
        if (s.prix_revente && (!document.getElementById('prix-revente').value || document.getElementById('prix-revente').value === '0')) {
            document.getElementById('prix-revente').value = (s.prix_revente || 0).toFixed(2);
            calculateMarge();
        }
    } else if (found.length) {
        const last = found[0];
        infoEl.style.display = 'block';
        infoText.textContent = `Déjà acheté : ${last.nom} — ${(last.prix_ttc||0).toFixed(2)}€ TTC chez ${last.fournisseur_nom||'?'}`;
        if (!document.getElementById('product-name').value) document.getElementById('product-name').value = last.nom;
        if (!document.getElementById('categorie').value && last.categorie) document.getElementById('categorie').value = last.categorie;
        // Pré-remplir le prix d'achat depuis l'achat
        if (!document.getElementById('prix-achat').value || document.getElementById('prix-achat').value === '0') {
            document.getElementById('prix-achat').value = (last.prix_ttc || 0).toFixed(2);
            document.getElementById('prix-type-ht').checked = false;
            document.getElementById('prix-type-ttc').checked = true;
            recalcPrixAchat();
        }
    } else { infoEl.style.display = 'none'; }
}

let codeReader = null;
let lastScannedEAN = '';
let scanCooldown = false;

// Sons de scan
function playSound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.3;
        if (type === 'ok') {
            osc.frequency.value = 880;
            osc.type = 'sine';
        } else if (type === 'doublon') {
            osc.frequency.value = 440;
            osc.type = 'triangle';
        } else {
            osc.frequency.value = 220;
            osc.type = 'square';
        }
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch(e) {}
}

function showScanFeedback(text, type) {
    const el = document.getElementById('scan-feedback');
    if (!el) return;
    el.textContent = text;
    el.className = 'scan-feedback ' + type;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2000);
}

async function startScanner() {
    try {
        codeReader = new ZXing.BrowserMultiFormatReader();
        const video = document.getElementById('video');
        video.style.display = 'block';
        document.getElementById('stop-scanner').style.display = 'inline-flex';
        const devices = await codeReader.listVideoInputDevices();
        const back = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];
        
        codeReader.decodeFromVideoDevice(back?.deviceId, 'video', (result) => {
            if (result && !scanCooldown) {
                const ean = result.getText();
                scanCooldown = true;
                setTimeout(() => { scanCooldown = false; }, 1500);
                
                // Détection doublon
                const existant = products.find(p => p.ean === ean && !p.vendu);
                
                if (ean === lastScannedEAN) {
                    playSound('doublon');
                    showScanFeedback('⚠️ Déjà scanné : ' + ean, 'doublon');
                    return;
                }
                
                lastScannedEAN = ean;
                document.getElementById('ean').value = ean;
                checkPurchaseHistory();
                
                if (existant) {
                    playSound('doublon');
                    showScanFeedback('⚠️ Doublon en stock : ' + existant.nom, 'doublon');
                } else {
                    playSound('ok');
                    showScanFeedback('✅ ' + ean, 'ok');
                }
                
                // Ne pas arrêter le scanner en mode continu
                // L'utilisateur arrête manuellement
            }
        });
    } catch (e) { 
        playSound('ko');
        alert('Erreur caméra: ' + e.message); 
    }
}

function stopScanner() {
    if (codeReader) { codeReader.reset(); codeReader = null; }
    document.getElementById('video').style.display = 'none';
    document.getElementById('stop-scanner').style.display = 'none';
}

function handlePhotoUpload(e) {
    const files = e.target.files;
    [...files].forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => { currentPhotos.push(ev.target.result); displayPhotos(); };
        reader.readAsDataURL(file);
    });
}

function displayPhotos() {
    const c = document.getElementById('photo-preview');
    if (!c) return;
    c.innerHTML = currentPhotos.map((p, i) => `<img src="${p}" onclick="removePhoto(${i})" title="Clic pour supprimer">`).join('');
}

function removePhoto(i) { currentPhotos.splice(i, 1); displayPhotos(); }

document.getElementById('product-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const qFba = parseInt(document.getElementById('qte-fba')?.value) || 0;
    const qFbm = parseInt(document.getElementById('qte-fbm')?.value) || 0;
    const qEnt = parseInt(document.getElementById('qte-entrepot')?.value) || 0;
    const totalQte = qFba + qFbm + qEnt;
    if (totalQte <= 0) return alert('Quantité totale doit être > 0');
    const pr = {
        ean: document.getElementById('ean').value.trim(),
        nom: document.getElementById('product-name').value.trim(),
        categorie: document.getElementById('categorie').value,
        etat: document.getElementById('etat').value,
        etat_stock: document.getElementById('etat-stock').value,
        prix_achat: getPrixAchatTTC(),
        prix_revente: parseFloat(document.getElementById('prix-revente').value) || 0,
        qte_fba: qFba, qte_fbm: qFbm, qte_entrepot: qEnt,
        quantite: totalQte,
        amazon_fba: document.getElementById('amazon_fba')?.checked || false,
        amazon_fbm: document.getElementById('amazon_fbm')?.checked || false,
        vinted: document.getElementById('vinted')?.checked || false,
        leboncoin: document.getElementById('leboncoin')?.checked || false,
        invendable: false, vendu: false,
        photos: currentPhotos,
        notes: document.getElementById('notes').value.trim(),
        date_ajout: new Date().toISOString(),
    };
    if (!pr.ean || !pr.nom) return alert('EAN et Nom requis');
    
    // Si on ajoute en occasion ou rebut → déduire du stock neuf
    if (pr.etat_stock === 'occasion' || pr.etat_stock === 'rebut') {
        const stockNeuf = products.filter(p => p.ean === pr.ean && !p.vendu && p.etat_stock === 'neuf');
        let qteADeduire = totalQte;
        
        for (const sn of stockNeuf) {
            if (qteADeduire <= 0) break;
            const snTotal = (sn.qte_entrepot || 0) + (sn.qte_fba || 0) + (sn.qte_fbm || 0);
            
            if (snTotal <= qteADeduire) {
                // Supprimer entièrement ce produit neuf (marquer vendu ou mettre à 0)
                await sb.from('produits').update({ 
                    qte_entrepot: 0, qte_fba: 0, qte_fbm: 0, quantite: 0, vendu: true,
                    notes: (sn.notes || '') + ' [Transféré en ' + pr.etat_stock + ']'
                }).eq('id', sn.id);
                qteADeduire -= snTotal;
            } else {
                // Déduire partiellement — on prend d'abord de l'entrepôt, puis FBM, puis FBA
                let reste = qteADeduire;
                let newEnt = sn.qte_entrepot || 0;
                let newFbm = sn.qte_fbm || 0;
                let newFba = sn.qte_fba || 0;
                
                const deductEnt = Math.min(reste, newEnt);
                newEnt -= deductEnt; reste -= deductEnt;
                
                const deductFbm = Math.min(reste, newFbm);
                newFbm -= deductFbm; reste -= deductFbm;
                
                const deductFba = Math.min(reste, newFba);
                newFba -= deductFba; reste -= deductFba;
                
                await sb.from('produits').update({ 
                    qte_entrepot: newEnt, qte_fbm: newFbm, qte_fba: newFba,
                    quantite: newEnt + newFbm + newFba
                }).eq('id', sn.id);
                qteADeduire = 0;
            }
        }
        
        if (qteADeduire > 0 && stockNeuf.length > 0) {
            console.warn(`Attention : ${qteADeduire} unité(s) en plus par rapport au stock neuf disponible`);
        }
    }
    
    const { error } = await sb.from('produits').insert([pr]).select();
    if (error) return alert('Erreur: ' + error.message);
    showSuccess('success-message');
    this.reset();
    document.getElementById('info-achat').style.display = 'none';
    document.getElementById('marge-display').style.display = 'none';
    document.getElementById('prix-achat-conv').style.display = 'none';
    document.getElementById('prix-type-ht').checked = true;
    document.getElementById('total-qte-display').textContent = 'Total : 0 unités';
    currentPhotos = [];
    displayPhotos();
    await loadProducts();
});

// ═══════ STOCK DISPLAY ═══════
function switchStockView(view) {
    activeStockView = view;
    document.querySelectorAll('.stock-pill').forEach(p => p.classList.toggle('active', p.dataset.stock === view));
    displayStock();
}

function getFilteredStock() {
    const search = (document.getElementById('stock-search')?.value || '').toLowerCase();
    const sort = document.getElementById('stock-sort')?.value || 'date-desc';
    const canal = document.getElementById('stock-filter-canal')?.value || '';
    const cat = document.getElementById('stock-filter-cat')?.value || '';
    const emplacement = document.getElementById('stock-filter-emplacement')?.value || '';
    const dateFrom = document.getElementById('stock-filter-date-from')?.value || '';
    const dateTo = document.getElementById('stock-filter-date-to')?.value || '';
    const fournisseurFilter = document.getElementById('stock-filter-fournisseur')?.value || '';

    let list = products.filter(p => !p.vendu);

    // Filtre sous-catégorie
    if (activeStockView === 'neuf') list = list.filter(p => (p.etat_stock || 'neuf') === 'neuf' && !p.invendable);
    else if (activeStockView === 'occasion') list = list.filter(p => (p.etat_stock || '') === 'occasion' && !p.invendable);
    else if (activeStockView === 'entrepot') list = list.filter(p => (p.qte_entrepot || 0) > 0 && !p.invendable);
    else if (activeStockView === 'rebut') list = list.filter(p => (p.etat_stock || '') === 'rebut' || p.invendable);

    // Recherche étendue (nom, EAN, catégorie, notes, fournisseur)
    if (search) {
        list = list.filter(p => 
            (p.nom||'').toLowerCase().includes(search) || 
            (p.ean||'').toLowerCase().includes(search) ||
            (p.categorie||'').toLowerCase().includes(search) ||
            (p.notes||'').toLowerCase().includes(search)
        );
    }

    // Canal / Plateforme
    if (canal === 'fba') list = list.filter(p => (p.qte_fba || 0) > 0 || p.amazon_fba);
    else if (canal === 'fbm') list = list.filter(p => (p.qte_fbm || 0) > 0 || p.amazon_fbm);
    else if (canal === 'vinted') list = list.filter(p => p.vinted);
    else if (canal === 'leboncoin') list = list.filter(p => p.leboncoin);

    // Catégorie
    if (cat) list = list.filter(p => p.categorie === cat);

    // Emplacement
    if (emplacement === 'entrepot') list = list.filter(p => (p.qte_entrepot || 0) > 0);
    else if (emplacement === 'fba') list = list.filter(p => (p.qte_fba || 0) > 0);
    else if (emplacement === 'fbm') list = list.filter(p => (p.qte_fbm || 0) > 0);

    // Dates
    if (dateFrom) list = list.filter(p => p.date_ajout && new Date(p.date_ajout) >= new Date(dateFrom));
    if (dateTo) list = list.filter(p => p.date_ajout && new Date(p.date_ajout) <= new Date(dateTo + 'T23:59:59'));

    // Fournisseur (cherche dans les achats liés)
    if (fournisseurFilter) {
        const eansFournisseur = achats.filter(a => a.fournisseur_nom === fournisseurFilter).map(a => a.ean);
        list = list.filter(p => eansFournisseur.includes(p.ean));
    }

    // Statut
    const statutFilter = document.getElementById('stock-filter-statut')?.value || '';
    if (statutFilter) list = list.filter(p => (p.statut || 'recu') === statutFilter);

    // Fonction utilitaire marge
    const getMarge = (p) => (p.prix_achat > 0 && p.prix_revente > 0) ? ((p.prix_revente - p.prix_achat) / p.prix_achat * 100) : -999;
    const getAge = (p) => p.date_ajout ? Math.floor((Date.now() - new Date(p.date_ajout)) / 86400000) : 0;

    // Tri
    list.sort((a, b) => {
        switch (sort) {
            case 'date-desc': return new Date(b.date_ajout||0) - new Date(a.date_ajout||0);
            case 'date-asc': return new Date(a.date_ajout||0) - new Date(b.date_ajout||0);
            case 'qte-desc': return (b.quantite||0) - (a.quantite||0);
            case 'qte-asc': return (a.quantite||0) - (b.quantite||0);
            case 'prix-desc': return (b.prix_revente||0) - (a.prix_revente||0);
            case 'prix-asc': return (a.prix_revente||0) - (b.prix_revente||0);
            case 'nom-asc': return (a.nom||'').localeCompare(b.nom||'');
            case 'marge-desc': return getMarge(b) - getMarge(a);
            case 'marge-asc': return getMarge(a) - getMarge(b);
            case 'roi-desc': {
                const roiA = a.prix_achat > 0 ? ((a.prix_revente - a.prix_achat) / a.prix_achat) : -999;
                const roiB = b.prix_achat > 0 ? ((b.prix_revente - b.prix_achat) / b.prix_achat) : -999;
                return roiB - roiA;
            }
            case 'age-desc': return getAge(b) - getAge(a);
            case 'risk': {
                // Stock à risque = vieux (>30j) + pas de prix de revente ou marge faible
                const riskA = getAge(a) * (getMarge(a) < 10 ? 2 : 1);
                const riskB = getAge(b) * (getMarge(b) < 10 ? 2 : 1);
                return riskB - riskA;
            }
            default: return 0;
        }
    });
    return list;
}

// Toggle filtres avancés
function toggleAdvancedFilters() {
    const el = document.getElementById('advanced-filters');
    const btn = document.getElementById('btn-adv-filters');
    if (el.classList.contains('show')) {
        el.classList.remove('show');
        btn.classList.remove('active');
    } else {
        el.classList.add('show');
        btn.classList.add('active');
    }
}

function resetFilters() {
    document.getElementById('stock-filter-cat').value = '';
    document.getElementById('stock-filter-canal').value = '';
    document.getElementById('stock-filter-emplacement').value = '';
    document.getElementById('stock-filter-date-from').value = '';
    document.getElementById('stock-filter-date-to').value = '';
    document.getElementById('stock-filter-fournisseur').value = '';
    document.getElementById('stock-filter-statut').value = '';
    document.getElementById('stock-search').value = '';
    displayStock();
}

function displayStock() {
    const c = document.getElementById('stock-container');
    if (!c) return;

    // Populate categories
    const catSel = document.getElementById('stock-filter-cat');
    if (catSel) {
        const cats = [...new Set(products.map(p => p.categorie).filter(Boolean))];
        const cur = catSel.value;
        catSel.innerHTML = '<option value="">Toutes</option>';
        cats.forEach(cat => catSel.innerHTML += `<option value="${cat}">${cat}</option>`);
        catSel.value = cur;
    }

    // Populate fournisseurs
    const fournSel = document.getElementById('stock-filter-fournisseur');
    if (fournSel) {
        const fNames = [...new Set(achats.map(a => a.fournisseur_nom).filter(Boolean))];
        const cur = fournSel.value;
        fournSel.innerHTML = '<option value="">Tous</option>';
        fNames.forEach(f => fournSel.innerHTML += `<option value="${f}">${f}</option>`);
        fournSel.value = cur;
    }

    const list = getFilteredStock();

    // Stats
    const totalQte = list.reduce((s, p) => s + (p.quantite || 0), 0);
    const valeurAchat = list.reduce((s, p) => s + ((p.prix_achat || 0) * (p.quantite || 0)), 0);
    const valeurRevente = list.reduce((s, p) => s + ((p.prix_revente || 0) * (p.quantite || 0)), 0);
    const valeurEntrepot = list.reduce((s, p) => s + ((p.prix_achat || 0) * (p.qte_entrepot || 0)), 0);
    const beneficePotentiel = valeurRevente - valeurAchat;
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('stock-total', list.length);
    el('stock-qte-total', totalQte);
    el('stock-valeur-achat', valeurAchat.toFixed(2) + '€');
    el('stock-valeur-revente', valeurRevente.toFixed(2) + '€');
    el('stock-valeur-entrepot', valeurEntrepot.toFixed(2) + '€');
    el('stock-benefice-potentiel', beneficePotentiel.toFixed(2) + '€');

    if (!list.length) { c.innerHTML = '<div class="empty-state"><h3>Aucun produit</h3><p>Ajoutez des produits depuis le menu</p></div>'; return; }

    let h = '<div class="products-table"><table><thead><tr><th>Date</th><th>EAN</th><th>Produit</th><th>Cat.</th><th>Type</th>';
    if (activeStockView === 'neuf' || activeStockView === 'all') h += '<th>FBA</th><th>FBM</th>';
    h += '<th>Entrep.</th><th>Total</th><th>Achat</th><th>Revente</th><th>Marge</th><th>Actions</th></tr></thead><tbody>';

    list.forEach(p => {
        const date = p.date_ajout ? new Date(p.date_ajout).toLocaleDateString('fr-FR') : '-';
        const age = p.date_ajout ? Math.floor((Date.now() - new Date(p.date_ajout)) / 86400000) : 0;
        const marge = (p.prix_achat > 0 && p.prix_revente > 0) ? ((p.prix_revente - p.prix_achat) / p.prix_achat * 100) : null;
        
        const typeBadge = p.invendable ? '<span class="badge badge-rebut">Rebut</span>'
            : (p.etat_stock === 'occasion') ? '<span class="badge badge-occasion">Occasion</span>'
            : (p.etat_stock === 'rebut') ? '<span class="badge badge-rebut">Rebut</span>'
            : '<span class="badge badge-neuf">Neuf</span>';

        let riskBadge = '';
        if (age > 60) riskBadge = ' <span class="badge-risk">⚠️ ' + age + 'j</span>';
        else if (age > 30) riskBadge = ' <span class="badge-slow">🕐 ' + age + 'j</span>';
        
        // Alerte stock bas
        if ((p.seuil_stock || 0) > 0 && (p.quantite || 0) <= (p.seuil_stock || 0)) {
            riskBadge += (p.quantite || 0) === 0 ? ' <span class="alert-critique">🔴</span>' : ' <span class="alert-bas">🟠</span>';
        }

        let margeDisplay = '-';
        if (marge !== null) {
            const margeColor = marge >= 30 ? '#27ae60' : marge >= 10 ? '#f39c12' : '#e74c3c';
            margeDisplay = `<span style="color:${margeColor};font-weight:700;">${marge.toFixed(0)}%</span>`;
        }

        h += `<tr style="cursor:pointer" onclick="openProductModal(${p.id})">
            <td>${date}${riskBadge}</td>
            <td>${escapeHtml(p.ean||'')}</td>
            <td><strong>${escapeHtml(p.nom||'')}</strong></td>
            <td>${escapeHtml(p.categorie||'-')}</td>
            <td>${typeBadge}</td>`;
        if (activeStockView === 'neuf' || activeStockView === 'all') {
            h += `<td>${p.qte_fba||0}</td><td>${p.qte_fbm||0}</td>`;
        }
        h += `<td>${p.qte_entrepot||0}</td>
            <td><strong>${p.quantite||0}</strong></td>
            <td>${(p.prix_achat||0).toFixed(2)}€</td>
            <td>${(p.prix_revente||0).toFixed(2)}€</td>
            <td>${margeDisplay}</td>
            <td onclick="event.stopPropagation()"><div class="action-buttons">
                <button class="btn-small btn-sold" onclick="openVenteModal(${p.id})">💰</button>
                <button class="btn-small btn-edit" onclick="openProductModal(${p.id})">👁️</button>
                <button class="btn-small btn-delete" onclick="deleteProduct(${p.id})">🗑️</button>
            </div></td></tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
}

// ═══════ FICHE PRODUIT (MODAL) ═══════
function openProductModal(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const body = document.getElementById('product-modal-body');
    const total = (p.quantite || 0);
    const typeBadge = (p.etat_stock === 'occasion') ? '<span class="badge badge-occasion">Occasion</span>'
        : (p.etat_stock === 'rebut' || p.invendable) ? '<span class="badge badge-rebut">Rebut</span>'
        : '<span class="badge badge-neuf">Neuf</span>';

    let canaux = [];
    if (p.amazon_fba) canaux.push('Amazon FBA');
    if (p.amazon_fbm) canaux.push('Amazon FBM');
    if (p.vinted) canaux.push('Vinted');
    if (p.leboncoin) canaux.push('Leboncoin');

    let marge = '-';
    if (p.prix_achat > 0 && p.prix_revente > 0) {
        const m = ((p.prix_revente - p.prix_achat) / p.prix_achat * 100);
        marge = `<span class="marge-indicator ${m>=30?'marge-high':m>=10?'marge-medium':'marge-low'}">${m.toFixed(1)}%</span>`;
    }

    let photos = '';
    if (p.photos && p.photos.length) {
        photos = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:15px 0;">' +
            p.photos.map(ph => `<img src="${ph}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;">`).join('') + '</div>';
    }

    body.innerHTML = `
        <h2 style="margin-bottom:5px;">${escapeHtml(p.nom)}</h2>
        <p style="color:var(--text-secondary);margin-bottom:20px;">EAN: ${escapeHtml(p.ean||'-')} · ${typeBadge}</p>
        
        <!-- Zone lecture -->
        <div id="product-view-${p.id}">
            <!-- Statut & Emplacement -->
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px;align-items:center;">
                <div style="flex:1;">
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Statut</div>
                    <select onchange="changeStatut(${p.id}, this.value)" style="padding:8px 12px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-color);font-size:13px;font-weight:600;">
                        ${STATUTS.map(s => `<option value="${s.value}" ${(p.statut||'recu')===s.value?'selected':''}>${s.label}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1;">
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Emplacement (zone/étagère/bac)</div>
                    <input type="text" value="${escapeHtml(p.emplacement||'')}" placeholder="Ex: A-03-2" 
                        onchange="changeEmplacement(${p.id}, this.value)" 
                        style="padding:8px 12px;border-radius:8px;border:1px solid var(--input-border);background:var(--input-bg);color:var(--text-color);font-size:13px;width:100%;">
                </div>
            </div>
            <div class="detail-grid">
                <div class="detail-item"><div class="detail-label">Catégorie</div><div class="detail-value">${escapeHtml(p.categorie||'-')}</div></div>
                <div class="detail-item"><div class="detail-label">État</div><div class="detail-value">${escapeHtml(p.etat||'-')}</div></div>
                <div class="detail-item"><div class="detail-label">Prix achat TTC</div><div class="detail-value">${(p.prix_achat||0).toFixed(2)}€</div></div>
                <div class="detail-item"><div class="detail-label">Prix revente</div><div class="detail-value">${(p.prix_revente||0).toFixed(2)}€</div></div>
                <div class="detail-item"><div class="detail-label">Marge</div><div class="detail-value">${marge}</div></div>
                <div class="detail-item"><div class="detail-label">Date ajout</div><div class="detail-value">${p.date_ajout?new Date(p.date_ajout).toLocaleDateString('fr-FR'):'-'}</div></div>
            </div>
            <h3 style="margin:20px 0 10px;">📦 Répartition des quantités</h3>
            <div class="qte-grid">
                <div class="qte-card" style="border-top:3px solid #ff9900;"><div class="qte-num">${p.qte_fba||0}</div><div class="qte-label">Amazon FBA</div></div>
                <div class="qte-card" style="border-top:3px solid #3f51b5;"><div class="qte-num">${p.qte_fbm||0}</div><div class="qte-label">Amazon FBM</div></div>
                <div class="qte-card" style="border-top:3px solid #9c27b0;"><div class="qte-num">${p.qte_entrepot||0}</div><div class="qte-label">Entrepôt</div></div>
            </div>
            <div style="text-align:center;font-size:18px;font-weight:700;margin:10px 0 20px;">Total : ${total} unités</div>
            <div class="detail-item" style="margin-bottom:15px;"><div class="detail-label">Canaux de vente</div><div class="detail-value">${canaux.length ? canaux.join(', ') : 'Aucun'}</div></div>
            ${p.emplacement ? `<div class="detail-item" style="margin-bottom:15px;"><div class="detail-label">📍 Emplacement</div><div class="detail-value" style="font-weight:700;">${escapeHtml(p.emplacement)}</div></div>` : ''}
            ${p.notes ? `<div class="detail-item" style="margin-bottom:15px;"><div class="detail-label">Notes</div><div class="detail-value">${escapeHtml(p.notes)}</div></div>` : ''}
            ${photos}
        </div>

        <!-- Zone édition (cachée par défaut) -->
        <div id="product-edit-${p.id}" style="display:none;">
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Catégorie</div>
                    <select id="edit-categorie-${p.id}" class="form-input" style="padding:8px;">
                        <option value="">-- Aucune --</option>
                        <option value="Informatique" ${p.categorie==='Informatique'?'selected':''}>Informatique</option>
                        <option value="Électronique" ${p.categorie==='Électronique'?'selected':''}>Électronique</option>
                        <option value="Maison" ${p.categorie==='Maison'?'selected':''}>Maison</option>
                        <option value="Jouets" ${p.categorie==='Jouets'?'selected':''}>Jouets</option>
                        <option value="Sport" ${p.categorie==='Sport'?'selected':''}>Sport</option>
                        <option value="Mode" ${p.categorie==='Mode'?'selected':''}>Mode</option>
                        <option value="Beauté" ${p.categorie==='Beauté'?'selected':''}>Beauté</option>
                        <option value="Alimentation" ${p.categorie==='Alimentation'?'selected':''}>Alimentation</option>
                        <option value="Autre" ${p.categorie==='Autre'?'selected':''}>Autre</option>
                    </select>
                </div>
                <div class="detail-item">
                    <div class="detail-label">État stock</div>
                    <select id="edit-etat-stock-${p.id}" class="form-input" style="padding:8px;">
                        <option value="neuf" ${p.etat_stock==='neuf'?'selected':''}>Neuf</option>
                        <option value="occasion" ${p.etat_stock==='occasion'?'selected':''}>Occasion</option>
                        <option value="rebut" ${p.etat_stock==='rebut'?'selected':''}>Rebut</option>
                    </select>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Prix achat TTC</div>
                    <input type="number" step="0.01" id="edit-prix-achat-${p.id}" class="form-input" value="${(p.prix_achat||0).toFixed(2)}" style="padding:8px;">
                </div>
                <div class="detail-item">
                    <div class="detail-label">Prix revente</div>
                    <input type="number" step="0.01" id="edit-prix-revente-${p.id}" class="form-input" value="${(p.prix_revente||0).toFixed(2)}" style="padding:8px;">
                </div>
            </div>
            <h3 style="margin:20px 0 10px;">📦 Répartition des quantités</h3>
            <div class="qte-grid">
                <div class="qte-card" style="border-top:3px solid #ff9900;">
                    <input type="number" min="0" id="edit-qte-fba-${p.id}" value="${p.qte_fba||0}" style="width:60px;text-align:center;font-size:24px;font-weight:700;border:1px solid #555;border-radius:8px;background:var(--bg-card);color:var(--text-primary);padding:5px;">
                    <div class="qte-label">Amazon FBA</div>
                </div>
                <div class="qte-card" style="border-top:3px solid #3f51b5;">
                    <input type="number" min="0" id="edit-qte-fbm-${p.id}" value="${p.qte_fbm||0}" style="width:60px;text-align:center;font-size:24px;font-weight:700;border:1px solid #555;border-radius:8px;background:var(--bg-card);color:var(--text-primary);padding:5px;">
                    <div class="qte-label">Amazon FBM</div>
                </div>
                <div class="qte-card" style="border-top:3px solid #9c27b0;">
                    <input type="number" min="0" id="edit-qte-entrepot-${p.id}" value="${p.qte_entrepot||0}" style="width:60px;text-align:center;font-size:24px;font-weight:700;border:1px solid #555;border-radius:8px;background:var(--bg-card);color:var(--text-primary);padding:5px;">
                    <div class="qte-label">Entrepôt</div>
                </div>
            </div>
            <h3 style="margin:20px 0 10px;">🛒 Canaux de vente</h3>
            <div style="display:flex;gap:15px;flex-wrap:wrap;margin-bottom:15px;">
                <label><input type="checkbox" id="edit-amazon-fba-${p.id}" ${p.amazon_fba?'checked':''}> Amazon FBA</label>
                <label><input type="checkbox" id="edit-amazon-fbm-${p.id}" ${p.amazon_fbm?'checked':''}> Amazon FBM</label>
                <label><input type="checkbox" id="edit-vinted-${p.id}" ${p.vinted?'checked':''}> Vinted</label>
                <label><input type="checkbox" id="edit-leboncoin-${p.id}" ${p.leboncoin?'checked':''}> Leboncoin</label>
            </div>
            <div class="detail-item">
                <div class="detail-label">Notes</div>
                <textarea id="edit-notes-${p.id}" class="form-input" rows="2" style="padding:8px;">${escapeHtml(p.notes||'')}</textarea>
            </div>
            <div class="detail-item">
                <div class="detail-label">📍 Emplacement (zone/étagère/bac)</div>
                <input type="text" id="edit-emplacement-${p.id}" class="form-input" style="padding:8px;" value="${escapeHtml(p.emplacement||'')}" placeholder="Ex: A-03-2">
            </div>
            <div class="detail-item">
                <div class="detail-label">🔔 Seuil alerte stock min</div>
                <input type="number" id="edit-seuil-${p.id}" class="form-input" style="padding:8px;" value="${p.seuil_stock||0}" min="0" placeholder="0">
            </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;">
            <button class="scan-button" id="btn-edit-${p.id}" onclick="toggleEditProduct(${p.id})">✏️ Éditer</button>
            <button class="scan-button" id="btn-save-${p.id}" style="display:none;background:#00b894;" onclick="saveEditProduct(${p.id})">💾 Sauvegarder</button>
            <button class="scan-button" style="background:#3498db;" onclick="mouvementManuel(${p.id}); closeProductModal();">🔄 Transférer</button>
            <button class="scan-button" onclick="openVenteModal(${p.id}); closeProductModal();">💰 Vendre</button>
            <button class="scan-button" style="background:#00b4b6;" onclick="generateAnnonce(${p.id},'vinted')">📝 Vinted</button>
            <button class="scan-button" style="background:#f56b2a;" onclick="generateAnnonce(${p.id},'leboncoin')">📝 Leboncoin</button>
            <button class="scan-button danger" onclick="deleteProduct(${p.id}); closeProductModal();">🗑️ Supprimer</button>
        </div>
    `;
    document.getElementById('product-modal').style.display = 'block';
}

function toggleEditProduct(id) {
    document.getElementById('product-view-' + id).style.display = 'none';
    document.getElementById('product-edit-' + id).style.display = 'block';
    document.getElementById('btn-edit-' + id).style.display = 'none';
    document.getElementById('btn-save-' + id).style.display = 'inline-block';
}

async function saveEditProduct(id) {
    const qFba = parseInt(document.getElementById('edit-qte-fba-' + id).value) || 0;
    const qFbm = parseInt(document.getElementById('edit-qte-fbm-' + id).value) || 0;
    const qEnt = parseInt(document.getElementById('edit-qte-entrepot-' + id).value) || 0;
    const totalQte = qFba + qFbm + qEnt;

    const update = {
        categorie: document.getElementById('edit-categorie-' + id).value,
        etat_stock: document.getElementById('edit-etat-stock-' + id).value,
        prix_achat: parseFloat(document.getElementById('edit-prix-achat-' + id).value) || 0,
        prix_revente: parseFloat(document.getElementById('edit-prix-revente-' + id).value) || 0,
        qte_fba: qFba,
        qte_fbm: qFbm,
        qte_entrepot: qEnt,
        quantite: totalQte,
        amazon_fba: document.getElementById('edit-amazon-fba-' + id).checked,
        amazon_fbm: document.getElementById('edit-amazon-fbm-' + id).checked,
        vinted: document.getElementById('edit-vinted-' + id).checked,
        leboncoin: document.getElementById('edit-leboncoin-' + id).checked,
        invendable: document.getElementById('edit-etat-stock-' + id).value === 'rebut',
        notes: document.getElementById('edit-notes-' + id).value.trim(),
        emplacement: document.getElementById('edit-emplacement-' + id).value.trim(),
        seuil_stock: parseInt(document.getElementById('edit-seuil-' + id).value) || 0,
    };

    const { error } = await sb.from('produits').update(update).eq('id', id);
    if (error) return alert('Erreur: ' + error.message);
    
    closeProductModal();
    await loadProducts();
    updateDashboard();
}

function closeProductModal() { document.getElementById('product-modal').style.display = 'none'; }

// ═══════ VENTE ═══════
function openVenteModal(id) {
    currentVenteProductId = id;
    const p = products.find(x => x.id === id);
    if (!p) return;
    document.getElementById('vente-prix').value = (p.prix_revente || 0).toFixed(2);
    document.getElementById('vente-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('vente-qte').value = 1;
    document.getElementById('vente-qte').max = p.quantite || 1;
    document.getElementById('vente-plateforme').value = '';
    if (p.amazon_fba && !p.amazon_fbm) document.getElementById('vente-plateforme').value = 'Amazon FBA';
    else if (p.amazon_fbm && !p.amazon_fba) document.getElementById('vente-plateforme').value = 'Amazon FBM';
    document.getElementById('vente-modal').style.display = 'block';
}

function closeVenteModal() { document.getElementById('vente-modal').style.display = 'none'; currentVenteProductId = null; }

document.getElementById('vente-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentVenteProductId) return;
    const p = products.find(x => x.id === currentVenteProductId);
    if (!p) return;
    const prixVente = parseFloat(document.getElementById('vente-prix').value);
    const qteVendue = parseInt(document.getElementById('vente-qte').value) || 1;
    const canal = document.getElementById('vente-plateforme').value;
    if (isNaN(prixVente) || prixVente <= 0) return alert('Prix de vente invalide');

    const newTotal = (p.quantite || 0) - qteVendue;
    const update = {
        prix_vente_reel: prixVente,
        date_vente: document.getElementById('vente-date').value,
        plateforme_vente: canal,
        quantite: Math.max(0, newTotal),
    };
    // Decrease from appropriate location
    if (canal === 'Amazon FBA') update.qte_fba = Math.max(0, (p.qte_fba || 0) - qteVendue);
    else if (canal === 'Amazon FBM') update.qte_fbm = Math.max(0, (p.qte_fbm || 0) - qteVendue);
    else update.qte_entrepot = Math.max(0, (p.qte_entrepot || 0) - qteVendue);

    if (newTotal <= 0) update.vendu = true;

    const { error } = await sb.from('produits').update(update).eq('id', currentVenteProductId);
    if (error) return alert('Erreur: ' + error.message);
    await logMouvement(currentVenteProductId, 'vente', qteVendue, canal || 'entrepot', 'vendu', `Vente ${canal} — ${prixVente}€`, '');
    closeVenteModal();
    await loadProducts();
    showSuccess('success-message');
});

// ═══════ ANNONCES ═══════
function generateAnnonce(id, pf) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    let txt = pf === 'vinted'
        ? `${p.nom}\n\nÉtat: ${p.etat}\nPrix: ${p.prix_revente}€\n\n${p.notes||'Produit en '+p.etat.toLowerCase()}\n\n---\n📦 Neuf\n✅ ${p.etat}\n💰 Prix négociable\n📮 Envoi rapide`
        : `${p.nom}\n\nPrix: ${p.prix_revente}€\nÉtat: ${p.etat}\n\n${p.notes||'Produit en '+p.etat.toLowerCase()}\n\nN'hésitez pas à me contacter.`;
    document.getElementById('modal-title').textContent = `Annonce ${pf==='vinted'?'Vinted':'Leboncoin'}`;
    document.getElementById('annonce-text').textContent = txt;
    document.getElementById('annonce-modal').style.display = 'block';
}

function closeAnnonceModal() { document.getElementById('annonce-modal').style.display = 'none'; }
function copyAnnonce() {
    const t = document.getElementById('annonce-text')?.textContent;
    if (!t) return;
    navigator.clipboard.writeText(t).then(() => alert('✅ Copié !')).catch(() => {
        const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); alert('✅ Copié !');
    });
}

window.onclick = e => {
    if (e.target === document.getElementById('product-modal')) closeProductModal();
    if (e.target === document.getElementById('vente-modal')) closeVenteModal();
    if (e.target === document.getElementById('annonce-modal')) closeAnnonceModal();
    if (e.target === document.getElementById('fournisseur-modal')) closeFournisseurModal();
};

// ═══════ DELETE PRODUCT ═══════
async function deleteProduct(id) {
    if (!confirm('Supprimer ce produit ?')) return;
    await sb.from('produits').delete().eq('id', id);
    await loadProducts();
}

// ═══════ IMPORT GROSSISTE ═══════
function previewGrossisteImport(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('grossiste-file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let rows = [];
            if (file.name.endsWith('.csv')) {
                rows = parseCSV(e.target.result);
            } else {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                rows = XLSX.utils.sheet_to_json(sheet);
            }
            if (!rows.length) return alert('Fichier vide');

            // Auto-map columns
            const cols = Object.keys(rows[0]);
            const findCol = (keywords) => cols.find(c => keywords.some(k => c.toLowerCase().includes(k)));
            const colEan = findCol(['ean', 'gtin', 'code', 'barr', 'asin', 'upc']);
            const colNom = findCol(['nom', 'name', 'title', 'titre', 'produit', 'designation', 'description', 'libelle']);
            const colPrix = findCol(['prix', 'price', 'ht', 'ttc', 'cost', 'cout', 'tarif', 'ppc']);
            const colQte = findCol(['qte', 'quantit', 'qty', 'nb', 'nombre']);
            const colCat = findCol(['cat', 'categor', 'type', 'rayon']);

            if (!colNom && !colEan) return alert('Impossible de détecter les colonnes. Vérifiez que le fichier contient EAN ou Nom.');

            grossisteData = rows.map(r => ({
                ean: String(r[colEan] || '').trim(),
                nom: String(r[colNom] || '').trim(),
                prix: parseFloat(r[colPrix]) || 0,
                quantite: parseInt(r[colQte]) || 1,
                categorie: String(r[colCat] || '').trim(),
            })).filter(r => r.nom || r.ean);

            // Preview table
            let h = '<div class="products-table"><table><thead><tr><th>EAN</th><th>Nom</th><th>Prix</th><th>Qté</th><th>Catégorie</th></tr></thead><tbody>';
            grossisteData.slice(0, 50).forEach(r => {
                h += `<tr><td>${escapeHtml(r.ean)}</td><td>${escapeHtml(r.nom)}</td><td>${r.prix.toFixed(2)}€</td><td>${r.quantite}</td><td>${escapeHtml(r.categorie)}</td></tr>`;
            });
            if (grossisteData.length > 50) h += `<tr><td colspan="5" style="text-align:center;color:var(--text-secondary)">... et ${grossisteData.length - 50} de plus</td></tr>`;
            h += '</tbody></table></div>';
            document.getElementById('grossiste-preview-table').innerHTML = h;
            document.getElementById('grossiste-count').textContent = grossisteData.length;
            document.getElementById('grossiste-preview').style.display = 'block';
        } catch (err) { alert('Erreur lecture fichier: ' + err.message); }
    };
    if (file.name.endsWith('.csv')) reader.readAsText(file, 'UTF-8');
    else reader.readAsBinaryString(file);
}

async function confirmGrossisteImport() {
    if (!grossisteData || !grossisteData.length) return;
    const emplacement = document.getElementById('grossiste-emplacement').value;
    const batch = grossisteData.map(r => ({
        ean: r.ean, nom: r.nom, categorie: r.categorie,
        etat: 'Neuf', etat_stock: 'neuf',
        prix_achat: r.prix, prix_revente: 0,
        qte_fba: emplacement === 'fba' ? r.quantite : 0,
        qte_fbm: emplacement === 'fbm' ? r.quantite : 0,
        qte_entrepot: emplacement === 'entrepot' ? r.quantite : 0,
        quantite: r.quantite,
        amazon_fba: emplacement === 'fba',
        amazon_fbm: emplacement === 'fbm',
        date_ajout: new Date().toISOString(),
    }));

    // Insert by chunks of 100
    for (let i = 0; i < batch.length; i += 100) {
        const chunk = batch.slice(i, i + 100);
        const { error } = await sb.from('produits').insert(chunk);
        if (error) { alert('Erreur import: ' + error.message); return; }
    }
    alert(`✅ ${batch.length} produits importés !`);
    cancelGrossisteImport();
    await loadProducts();
    switchTab('stock');
}

function cancelGrossisteImport() {
    grossisteData = null;
    document.getElementById('grossiste-preview').style.display = 'none';
    document.getElementById('grossiste-file-name').textContent = '';
    document.getElementById('grossiste-file-input').value = '';
}

function parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim());
    return lines.slice(1).map(line => {
        const vals = line.split(sep).map(v => v.replace(/^"|"$/g, '').trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
    });
}

// ═══════ EXPORT EXCEL ═══════
async function exportStockExcel() {
    const list = getFilteredStock();
    if (!list.length) return alert('Aucun produit à exporter');

    const viewLabel = {all:'Tout',neuf:'Neuf',occasion:'Occasion',entrepot:'Entrepot',rebut:'Rebut'}[activeStockView] || 'Stock';
    const data = list.map(p => ({
        'Date': p.date_ajout ? new Date(p.date_ajout).toLocaleDateString('fr-FR') : '',
        'EAN': p.ean || '',
        'Nom': p.nom || '',
        'Catégorie': p.categorie || '',
        'État': p.etat || '',
        'Type Stock': p.etat_stock || '',
        'Qté FBA': p.qte_fba || 0,
        'Qté FBM': p.qte_fbm || 0,
        'Qté Entrepôt': p.qte_entrepot || 0,
        'Qté Total': p.quantite || 0,
        'Prix Achat': p.prix_achat || 0,
        'Prix Revente': p.prix_revente || 0,
        'Valeur': ((p.prix_revente || 0) * (p.quantite || 0)),
        'Canaux': [p.amazon_fba?'FBA':'', p.amazon_fbm?'FBM':'', p.vinted?'Vinted':'', p.leboncoin?'LBC':''].filter(Boolean).join(', '),
        'Notes': p.notes || '',
    }));

    // Total row
    const totalQte = list.reduce((s,p) => s + (p.quantite||0), 0);
    const totalValeur = list.reduce((s,p) => s + ((p.prix_revente||0) * (p.quantite||0)), 0);
    const totalAchat = list.reduce((s,p) => s + ((p.prix_achat||0) * (p.quantite||0)), 0);
    data.push({
        'Date': '', 'EAN': '', 'Nom': 'TOTAL', 'Catégorie': '', 'État': '', 'Type Stock': '',
        'Qté FBA': list.reduce((s,p)=>s+(p.qte_fba||0),0),
        'Qté FBM': list.reduce((s,p)=>s+(p.qte_fbm||0),0),
        'Qté Entrepôt': list.reduce((s,p)=>s+(p.qte_entrepot||0),0),
        'Qté Total': totalQte,
        'Prix Achat': totalAchat,
        'Prix Revente': totalValeur,
        'Valeur': totalValeur,
        'Canaux': '', 'Notes': ''
    });

    const ws = XLSX.utils.json_to_sheet(data);
    // Column widths
    ws['!cols'] = [
        {wch:12},{wch:15},{wch:35},{wch:15},{wch:12},{wch:12},
        {wch:10},{wch:10},{wch:12},{wch:10},{wch:12},{wch:12},{wch:12},{wch:20},{wch:30}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Stock ${viewLabel}`);
    XLSX.writeFile(wb, `stock-radar-${viewLabel.toLowerCase()}-${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ═══════ DASHBOARD ═══════
function updateDashboard() {
    const enStock = products.filter(p => !p.vendu && !p.invendable);
    const vendus = products.filter(p => p.vendu);
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    el('dash-total-produits', enStock.reduce((s,p)=>s+(p.quantite||0),0));
    el('dash-total-vendus', vendus.length);
    const valStockAchat = enStock.reduce((s,p) => s + ((p.prix_achat||0)*(p.quantite||0)), 0);
    el('dash-valeur-stock', valStockAchat.toFixed(2) + '€');
    const valEntrepot = enStock.reduce((s,p) => s + ((p.prix_achat||0)*(p.qte_entrepot||0)), 0);
    el('dash-valeur-entrepot', valEntrepot.toFixed(2) + '€');

    const ca = vendus.reduce((s,p) => s + (p.prix_vente_reel||0), 0);
    el('dash-ca-realise', ca.toFixed(2) + '€');
    const benefice = vendus.reduce((s,p) => s + ((p.prix_vente_reel||0)-(p.prix_achat||0)), 0);
    el('dash-benefice', benefice.toFixed(2) + '€');
    const marges = vendus.filter(p => p.prix_achat > 0).map(p => (((p.prix_vente_reel||0)-p.prix_achat)/p.prix_achat*100));
    el('dash-marge-moyenne', (marges.length ? (marges.reduce((a,b)=>a+b,0)/marges.length) : 0).toFixed(1) + '%');

    // Sub-stats
    el('dash-qte-fba', enStock.reduce((s,p)=>s+(p.qte_fba||0),0));
    el('dash-qte-fbm', enStock.reduce((s,p)=>s+(p.qte_fbm||0),0));
    el('dash-qte-entrepot', enStock.reduce((s,p)=>s+(p.qte_entrepot||0),0));
    el('dash-qte-rebut', products.filter(p => !p.vendu && ((p.etat_stock||'')==='rebut' || p.invendable)).reduce((s,p)=>s+(p.quantite||0),0));

    createCharts();
}

function createCharts() {
    if (typeof Chart === 'undefined') return;

    // Evolution mensuelle
    const months = {};
    products.forEach(p => { if (!p.date_ajout) return; const m = new Date(p.date_ajout).toLocaleDateString('fr-FR',{month:'short',year:'numeric'}); months[m] = (months[m]||0) + (p.quantite||1); });
    const mLabels = Object.keys(months).slice(-6);
    if (charts.evolution) charts.evolution.destroy();
    const c1 = document.getElementById('chartEvolution');
    if (c1) charts.evolution = new Chart(c1, { type:'bar', data:{labels:mLabels, datasets:[{label:'Unités ajoutées',data:mLabels.map(m=>months[m]),backgroundColor:'rgba(45,80,22,0.7)'}]}, options:{responsive:true,plugins:{legend:{display:false}}} });

    // Répartition stock
    const enStock = products.filter(p => !p.vendu);
    const fba = enStock.reduce((s,p)=>s+(p.qte_fba||0),0);
    const fbm = enStock.reduce((s,p)=>s+(p.qte_fbm||0),0);
    const ent = enStock.reduce((s,p)=>s+(p.qte_entrepot||0),0);
    if (charts.repartition) charts.repartition.destroy();
    const c2 = document.getElementById('chartRepartition');
    if (c2) charts.repartition = new Chart(c2, { type:'doughnut', data:{labels:['FBA','FBM','Entrepôt'],datasets:[{data:[fba,fbm,ent],backgroundColor:['#ff9900','#3f51b5','#9c27b0']}]}, options:{responsive:true} });

    // Top catégories
    const cats = {};
    enStock.forEach(p => { if (p.categorie) cats[p.categorie] = (cats[p.categorie]||0) + (p.quantite||0); });
    const sortedCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (charts.categories) charts.categories.destroy();
    const c3 = document.getElementById('chartCategories');
    if (c3) charts.categories = new Chart(c3, { type:'bar', data:{labels:sortedCats.map(c=>c[0]),datasets:[{label:'Unités',data:sortedCats.map(c=>c[1]),backgroundColor:'rgba(45,80,22,0.6)'}]}, options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}}} });

    // CA par canal
    const vendus = products.filter(p => p.vendu);
    const canaux = {};
    vendus.forEach(p => { const c = p.plateforme_vente || 'Autre'; canaux[c] = (canaux[c]||0) + (p.prix_vente_reel||0); });
    if (charts.canaux) charts.canaux.destroy();
    const c4 = document.getElementById('chartCanaux');
    if (c4) charts.canaux = new Chart(c4, { type:'doughnut', data:{labels:Object.keys(canaux),datasets:[{data:Object.values(canaux),backgroundColor:['#ff9900','#3f51b5','#00b4b6','#f56b2a','#95a5a6']}]}, options:{responsive:true} });
}

// ═══════ UTILS ═══════
function showSuccess(id) { const m = document.getElementById(id); if (m) { m.style.display='block'; setTimeout(()=>m.style.display='none',3000); } }

function downloadCSV(csv, name) {
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

function searchPrice(platform) {
    const ean = document.getElementById('ean')?.value.trim();
    if (!ean) return alert('Saisir un EAN d\'abord');
    const url = platform === 'amazon' ? `https://www.amazon.fr/s?k=${ean}` : `https://www.google.com/search?q=${ean}+prix`;
    window.open(url, '_blank');
}

// ═══════ DARK MODE ═══════
function toggleDarkMode() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-theme'));
    updateDarkModeIcon();
}

function updateDarkModeIcon() {
    const btn = document.getElementById('dark-toggle');
    if (btn) btn.textContent = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
}

// ═══════ MOUVEMENTS DE STOCK ═══════
async function logMouvement(produitId, type, quantite, de, vers, raison, notes) {
    const p = products.find(x => x.id === produitId);
    const mvt = {
        produit_id: produitId,
        produit_ean: p?.ean || '',
        produit_nom: p?.nom || '',
        type: type,
        quantite: quantite,
        de_emplacement: de || '',
        vers_emplacement: vers || '',
        raison: raison || '',
        notes: notes || '',
    };
    const { error } = await sb.from('mouvements').insert([mvt]);
    if (error) console.warn('Erreur log mouvement:', error.message);
}

function displayMouvements() {
    const c = document.getElementById('mouvements-container');
    if (!c) return;
    
    if (!mouvements.length) {
        c.innerHTML = '<div class="empty-state"><h3>Aucun mouvement</h3><p>Les mouvements apparaîtront ici automatiquement.</p></div>';
        return;
    }

    const typeIcons = { 'entree': '📥', 'sortie': '📤', 'transfert': '🔄', 'ajustement': '⚙️', 'vente': '💰', 'reception': '✅' };
    const typeColors = { 'entree': '#27ae60', 'sortie': '#e74c3c', 'transfert': '#3498db', 'ajustement': '#f39c12', 'vente': '#9b59b6', 'reception': '#27352a' };
    
    let h = '<div class="products-table"><table><thead><tr><th>Date</th><th>Type</th><th>Produit</th><th>EAN</th><th>Qté</th><th>De</th><th>Vers</th><th>Raison</th></tr></thead><tbody>';
    
    mouvements.slice(0, 100).forEach(m => {
        const date = m.created_at ? new Date(m.created_at).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
        const icon = typeIcons[m.type] || '📋';
        const color = typeColors[m.type] || '#666';
        h += `<tr>
            <td>${date}</td>
            <td><span style="color:${color};font-weight:700;">${icon} ${m.type}</span></td>
            <td><strong>${escapeHtml(m.produit_nom||'-')}</strong></td>
            <td>${escapeHtml(m.produit_ean||'-')}</td>
            <td style="font-weight:700;">${m.quantite||0}</td>
            <td>${escapeHtml(m.de_emplacement||'-')}</td>
            <td>${escapeHtml(m.vers_emplacement||'-')}</td>
            <td>${escapeHtml(m.raison||m.notes||'-')}</td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
}

// ═══════ STATUT WORKFLOW ═══════
const STATUTS = [
    { value: 'recu', label: '📦 Reçu', color: '#27352a' },
    { value: 'a_controler', label: '🔍 À contrôler', color: '#e67e22' },
    { value: 'a_etiqueter', label: '🏷️ À étiqueter', color: '#f39c12' },
    { value: 'a_expedier', label: '📮 À expédier', color: '#3498db' },
    { value: 'envoye', label: '🚀 Envoyé', color: '#2ecc71' },
    { value: 'termine', label: '✅ Terminé', color: '#27ae60' },
];

function getStatutBadge(statut) {
    const s = STATUTS.find(x => x.value === statut) || STATUTS[0];
    return `<span style="background:${s.color};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${s.label}</span>`;
}

async function changeStatut(productId, newStatut) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const oldStatut = p.statut || 'recu';
    await sb.from('produits').update({ statut: newStatut }).eq('id', productId);
    await logMouvement(productId, 'ajustement', 0, '', '', `Statut: ${oldStatut} → ${newStatut}`, '');
    await loadProducts();
}

// ═══════ EMPLACEMENT ═══════
async function changeEmplacement(productId, newEmplacement) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const oldEmpl = p.emplacement || '';
    await sb.from('produits').update({ emplacement: newEmplacement }).eq('id', productId);
    if (oldEmpl !== newEmplacement) {
        await logMouvement(productId, 'transfert', p.quantite||0, oldEmpl || 'non défini', newEmplacement || 'non défini', 'Changement emplacement', '');
    }
    await loadProducts();
}

// Mouvement de stock manuel (transfert de quantité entre emplacements)
async function mouvementManuel(productId) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    
    const qte = parseInt(prompt(`Quantité à déplacer (stock total: ${p.quantite||0}) :`));
    if (!qte || qte <= 0) return;
    
    const de = prompt('De quel emplacement ? (entrepot / fba / fbm)');
    const vers = prompt('Vers quel emplacement ? (entrepot / fba / fbm)');
    if (!de || !vers || de === vers) return alert('Emplacements invalides');
    
    const champs = { entrepot: 'qte_entrepot', fba: 'qte_fba', fbm: 'qte_fbm' };
    if (!champs[de] || !champs[vers]) return alert('Emplacement non reconnu (entrepot, fba, fbm)');
    
    const qteDe = p[champs[de]] || 0;
    if (qte > qteDe) return alert(`Stock insuffisant en ${de} (${qteDe} disponible)`);
    
    const update = {};
    update[champs[de]] = qteDe - qte;
    update[champs[vers]] = (p[champs[vers]] || 0) + qte;
    
    const { error } = await sb.from('produits').update(update).eq('id', productId);
    if (error) return alert('Erreur: ' + error.message);
    
    await logMouvement(productId, 'transfert', qte, de, vers, 'Transfert manuel', '');
    await loadProducts();
}

// ═══════ ALERTES STOCK BAS ═══════
function displayAlertes() {
    const c = document.getElementById('alertes-container');
    if (!c) return;
    
    const enStock = products.filter(p => !p.vendu && !p.invendable);
    const avecSeuil = enStock.filter(p => (p.seuil_stock || 0) > 0);
    const critiques = avecSeuil.filter(p => (p.quantite || 0) === 0);
    const basses = avecSeuil.filter(p => (p.quantite || 0) > 0 && (p.quantite || 0) <= (p.seuil_stock || 0));
    const ok = avecSeuil.filter(p => (p.quantite || 0) > (p.seuil_stock || 0));
    const sansSeuil = enStock.filter(p => !(p.seuil_stock > 0));

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('alertes-critiques', critiques.length);
    el('alertes-basses', basses.length);
    el('alertes-ok', ok.length);
    el('alertes-sans-seuil', sansSeuil.length);

    const alertes = [...critiques, ...basses].sort((a, b) => (a.quantite || 0) - (b.quantite || 0));
    
    if (!alertes.length) {
        c.innerHTML = '<div class="empty-state"><h3>✅ Aucune alerte</h3><p>Tous les produits avec seuil sont en stock suffisant.<br>Configurez des seuils depuis la fiche produit ou le bouton "Configurer seuils en lot".</p></div>';
        return;
    }

    let h = '<div class="products-table"><table><thead><tr><th>Produit</th><th>EAN</th><th>Stock actuel</th><th>Seuil min</th><th>Écart</th><th>Statut</th><th>Action</th></tr></thead><tbody>';
    
    alertes.forEach(p => {
        const ecart = (p.quantite || 0) - (p.seuil_stock || 0);
        const isCritique = (p.quantite || 0) === 0;
        const badge = isCritique ? '<span class="alert-critique">🔴 Rupture</span>' : '<span class="alert-bas">🟠 Stock bas</span>';
        
        h += `<tr style="cursor:pointer" onclick="openProductModal(${p.id})">
            <td><strong>${escapeHtml(p.nom||'')}</strong></td>
            <td>${escapeHtml(p.ean||'')}</td>
            <td style="font-weight:700;color:${isCritique ? '#e74c3c' : '#f39c12'};">${p.quantite || 0}</td>
            <td>${p.seuil_stock || 0}</td>
            <td style="font-weight:700;color:#e74c3c;">${ecart}</td>
            <td>${badge}</td>
            <td onclick="event.stopPropagation()">
                <button class="btn-small" style="background:#3498db;color:white;padding:5px 10px;border-radius:6px;" onclick="modifierSeuil(${p.id})">⚙️</button>
            </td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
}

async function modifierSeuil(productId) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const seuil = prompt(`Seuil minimum pour "${p.nom}" (stock actuel: ${p.quantite}) :`, p.seuil_stock || 0);
    if (seuil === null) return;
    const val = parseInt(seuil) || 0;
    const { error } = await sb.from('produits').update({ seuil_stock: val }).eq('id', productId);
    if (error) return alert('Erreur: ' + error.message);
    await loadProducts();
    displayAlertes();
}

async function configurerSeuilsEnLot() {
    const seuil = prompt('Définir un seuil minimum pour TOUS les produits qui n\'en ont pas encore :', '2');
    if (seuil === null) return;
    const val = parseInt(seuil) || 0;
    if (val <= 0) return;
    
    const sansSeuil = products.filter(p => !p.vendu && !p.invendable && !(p.seuil_stock > 0));
    if (!sansSeuil.length) return alert('Tous les produits ont déjà un seuil.');
    
    if (!confirm(`Mettre le seuil à ${val} pour ${sansSeuil.length} produits ?`)) return;
    
    for (const p of sansSeuil) {
        await sb.from('produits').update({ seuil_stock: val }).eq('id', p.id);
    }
    alert(`✅ Seuil mis à ${val} pour ${sansSeuil.length} produits.`);
    await loadProducts();
    displayAlertes();
}

// ═══════ INVENTAIRE / COMPTAGE ═══════
let inventaireData = []; // { id, ean, nom, theorique, compte, ecart }
let inventaireActif = false;
let invCodeReader = null;
let inventaireFilter = 'all';

function startInventaire() {
    if (inventaireActif && !confirm('Un inventaire est déjà en cours. Recommencer ?')) return;
    
    const enStock = products.filter(p => !p.vendu && !p.invendable);
    inventaireData = enStock.map(p => ({
        id: p.id,
        ean: p.ean || '',
        nom: p.nom || '',
        categorie: p.categorie || '',
        emplacement: p.emplacement || '',
        theorique: p.quantite || 0,
        compte: null,
        ecart: null
    }));
    
    inventaireActif = true;
    document.getElementById('inventaire-vide').style.display = 'none';
    document.getElementById('inventaire-mode').style.display = 'block';
    document.getElementById('btn-export-inventaire').style.display = 'inline-flex';
    displayInventaire();
}

function displayInventaire() {
    const c = document.getElementById('inventaire-container');
    if (!c) return;
    
    let list = inventaireData;
    if (inventaireFilter === 'ecarts') list = list.filter(i => i.compte !== null && i.ecart !== 0);
    else if (inventaireFilter === 'non-comptes') list = list.filter(i => i.compte === null);
    
    const comptes = inventaireData.filter(i => i.compte !== null).length;
    const ecarts = inventaireData.filter(i => i.compte !== null && i.ecart !== 0).length;
    const conformes = inventaireData.filter(i => i.compte !== null && i.ecart === 0).length;
    
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('inv-total-produits', inventaireData.length);
    el('inv-comptes', comptes);
    el('inv-ok', conformes);
    el('inv-ecarts', ecarts);
    
    if (!list.length) {
        c.innerHTML = '<div class="empty-state"><h3>Aucun produit dans ce filtre</h3></div>';
        return;
    }

    let h = '<div style="background:var(--card-bg);border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">';
    h += '<div class="inv-row" style="font-weight:700;background:var(--filter-bg);font-size:13px;"><div>EAN</div><div>Produit</div><div>Théorique</div><div>Compté</div><div>Écart</div><div>Statut</div></div>';
    
    list.forEach(item => {
        const ecartClass = item.compte === null ? '' : (item.ecart !== 0 ? 'ecart' : 'ok');
        const inputClass = item.compte === null ? '' : (item.ecart !== 0 ? 'ecart' : 'ok');
        const ecartText = item.compte === null ? '-' : (item.ecart > 0 ? `<span style="color:#27ae60;font-weight:700;">+${item.ecart}</span>` : item.ecart < 0 ? `<span style="color:#e74c3c;font-weight:700;">${item.ecart}</span>` : '<span style="color:#27ae60;">0</span>');
        const statusBadge = item.compte === null ? '<span style="color:var(--text-secondary);">❓</span>' : (item.ecart === 0 ? '<span class="alert-ok">✅</span>' : '<span class="alert-critique">⚠️</span>');
        
        h += `<div class="inv-row ${ecartClass}">
            <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(item.ean)}</div>
            <div><strong>${escapeHtml(item.nom)}</strong>${item.emplacement ? `<br><span style="font-size:11px;color:var(--text-secondary);">📍 ${escapeHtml(item.emplacement)}</span>` : ''}</div>
            <div style="font-weight:700;text-align:center;">${item.theorique}</div>
            <div><input type="number" class="inv-input ${inputClass}" value="${item.compte !== null ? item.compte : ''}" min="0" placeholder="-" onchange="updateInventaireCount(${item.id}, this.value)"></div>
            <div style="text-align:center;">${ecartText}</div>
            <div style="text-align:center;">${statusBadge}</div>
        </div>`;
    });
    
    c.innerHTML = h + '</div>';
}

function filterInventaire(filter) {
    inventaireFilter = filter;
    displayInventaire();
}

function updateInventaireCount(productId, value) {
    const item = inventaireData.find(i => i.id === productId);
    if (!item) return;
    
    if (value === '' || value === null) {
        item.compte = null;
        item.ecart = null;
    } else {
        item.compte = parseInt(value) || 0;
        item.ecart = item.compte - item.theorique;
    }
    displayInventaire();
}

function inventaireScanEAN() {
    const input = document.getElementById('inv-scan-ean');
    const ean = input.value.trim();
    if (!ean) return;
    
    const item = inventaireData.find(i => i.ean === ean);
    const feedback = document.getElementById('inv-scan-feedback');
    
    if (!item) {
        playSound('ko');
        if (feedback) { feedback.textContent = '❌ EAN non trouvé dans le stock : ' + ean; feedback.style.color = '#e74c3c'; feedback.style.display = 'block'; }
    } else {
        // Incrémenter le comptage
        if (item.compte === null) item.compte = 0;
        item.compte++;
        item.ecart = item.compte - item.theorique;
        
        playSound('ok');
        if (feedback) { feedback.textContent = `✅ ${item.nom} — compté : ${item.compte} / théorique : ${item.theorique}`; feedback.style.color = '#27ae60'; feedback.style.display = 'block'; }
        displayInventaire();
    }
    
    input.value = '';
    input.focus();
}

// Scanner inventaire
async function startInventaireScanner() {
    try {
        invCodeReader = new ZXing.BrowserMultiFormatReader();
        const video = document.getElementById('inv-video');
        video.style.display = 'block';
        document.getElementById('inv-stop-scanner').style.display = 'inline-flex';
        const devices = await invCodeReader.listVideoInputDevices();
        const back = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];
        
        let cooldown = false;
        invCodeReader.decodeFromVideoDevice(back?.deviceId, 'inv-video', (result) => {
            if (result && !cooldown) {
                cooldown = true;
                setTimeout(() => { cooldown = false; }, 1500);
                document.getElementById('inv-scan-ean').value = result.getText();
                inventaireScanEAN();
            }
        });
    } catch (e) { alert('Erreur caméra: ' + e.message); }
}

function stopInventaireScanner() {
    if (invCodeReader) { invCodeReader.reset(); invCodeReader = null; }
    document.getElementById('inv-video').style.display = 'none';
    document.getElementById('inv-stop-scanner').style.display = 'none';
}

async function validerInventaire() {
    const ecarts = inventaireData.filter(i => i.compte !== null && i.ecart !== 0);
    const comptes = inventaireData.filter(i => i.compte !== null);
    
    if (!comptes.length) return alert('Aucun produit compté.');
    
    const msg = `Résumé de l'inventaire :\n- ${comptes.length} produits comptés\n- ${comptes.length - ecarts.length} conformes\n- ${ecarts.length} écarts\n\n${ecarts.length > 0 ? 'Les écarts vont ajuster les quantités en stock.\n\n' : ''}Valider et appliquer ?`;
    if (!confirm(msg)) return;
    
    for (const item of ecarts) {
        const p = products.find(x => x.id === item.id);
        if (!p) continue;
        
        // Ajuster la quantité entrepôt (on suppose l'écart est en entrepôt)
        const newEntrepot = Math.max(0, (p.qte_entrepot || 0) + item.ecart);
        const newTotal = newEntrepot + (p.qte_fba || 0) + (p.qte_fbm || 0);
        
        await sb.from('produits').update({
            qte_entrepot: newEntrepot,
            quantite: newTotal,
            vendu: newTotal <= 0
        }).eq('id', item.id);
        
        await logMouvement(item.id, 'ajustement', Math.abs(item.ecart),
            'inventaire', 'entrepot',
            `Inventaire: ${item.ecart > 0 ? '+' : ''}${item.ecart} (théo: ${item.theorique}, réel: ${item.compte})`,
            ''
        );
    }
    
    alert(`✅ Inventaire validé ! ${ecarts.length} ajustement(s) appliqué(s).`);
    inventaireActif = false;
    inventaireData = [];
    document.getElementById('inventaire-mode').style.display = 'none';
    document.getElementById('inventaire-vide').style.display = 'block';
    document.getElementById('btn-export-inventaire').style.display = 'none';
    await loadProducts();
}

function annulerInventaire() {
    if (!confirm('Annuler l\'inventaire en cours ? Les comptages seront perdus.')) return;
    inventaireActif = false;
    inventaireData = [];
    document.getElementById('inventaire-mode').style.display = 'none';
    document.getElementById('inventaire-vide').style.display = 'block';
    document.getElementById('btn-export-inventaire').style.display = 'none';
}

function exportInventaire() {
    if (!inventaireData.length) return alert('Pas d\'inventaire en cours.');
    
    const data = inventaireData.map(i => ({
        'EAN': i.ean, 'Produit': i.nom, 'Catégorie': i.categorie,
        'Emplacement': i.emplacement,
        'Stock théorique': i.theorique,
        'Compté': i.compte !== null ? i.compte : 'Non compté',
        'Écart': i.ecart !== null ? i.ecart : '-',
        'Statut': i.compte === null ? 'Non compté' : (i.ecart === 0 ? 'Conforme' : 'ÉCART')
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire');
    XLSX.writeFile(wb, `inventaire-${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ═══════ ADVANCED EXPORT ═══════
function exportAdvanced() {
    const type = document.getElementById('export-type').value;
    const format = document.getElementById('export-format').value;
    let data = [], fileName = 'export';

    switch(type) {
        case 'stock-all':
            data = products.filter(p => !p.vendu).map(p => formatProductExport(p));
            fileName = 'stock-complet';
            break;
        case 'stock-filtered':
            data = getFilteredStock().map(p => formatProductExport(p));
            fileName = 'stock-filtre';
            break;
        case 'stock-neuf':
            data = products.filter(p => !p.vendu && (p.etat_stock||'neuf') === 'neuf').map(p => formatProductExport(p));
            fileName = 'stock-neuf';
            break;
        case 'stock-occasion':
            data = products.filter(p => !p.vendu && p.etat_stock === 'occasion').map(p => formatProductExport(p));
            fileName = 'stock-occasion';
            break;
        case 'achats-all':
            data = achats.map(a => formatAchatExport(a));
            fileName = 'achats-complet';
            break;
        case 'achats-mois': {
            const now = new Date();
            const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1);
            data = achats.filter(a => a.date_achat && new Date(a.date_achat) >= moisDebut).map(a => formatAchatExport(a));
            fileName = 'achats-mois-' + (now.getMonth()+1);
            break;
        }
        case 'fournisseurs':
            data = fournisseurs.map(f => ({
                'Nom': f.nom||'', 'Contact': f.contact||'', 'Email': f.email||'',
                'Téléphone': f.tel||'', 'Adresse': f.adresse||'', 'Notes': f.notes||''
            }));
            fileName = 'fournisseurs';
            break;
        case 'vendus':
            data = products.filter(p => p.vendu).map(p => ({
                ...formatProductExport(p),
                'Date vente': p.date_vente || '',
                'Prix vente réel': p.prix_vente_reel || 0,
                'Plateforme vente': p.plateforme_vente || '',
                'Bénéfice': ((p.prix_vente_reel||0) - (p.prix_achat||0)).toFixed(2)
            }));
            fileName = 'vendus';
            break;
        case 'marge': {
            const enStock = products.filter(p => !p.vendu && p.prix_achat > 0 && p.prix_revente > 0);
            data = enStock.map(p => {
                const marge = ((p.prix_revente - p.prix_achat) / p.prix_achat * 100);
                const roi = ((p.prix_revente - p.prix_achat) / p.prix_achat);
                const age = p.date_ajout ? Math.floor((Date.now() - new Date(p.date_ajout)) / 86400000) : 0;
                return {
                    'EAN': p.ean||'', 'Nom': p.nom||'', 'Catégorie': p.categorie||'',
                    'Prix Achat': p.prix_achat, 'Prix Revente': p.prix_revente,
                    'Marge €': (p.prix_revente - p.prix_achat).toFixed(2),
                    'Marge %': marge.toFixed(1) + '%',
                    'ROI': roi.toFixed(2),
                    'Qté': p.quantite||0,
                    'Valeur potentielle': ((p.prix_revente - p.prix_achat) * (p.quantite||0)).toFixed(2),
                    'Ancienneté (jours)': age,
                    'Risque': age > 60 ? 'ÉLEVÉ' : age > 30 ? 'MOYEN' : 'FAIBLE'
                };
            }).sort((a, b) => parseFloat(b['Marge %']) - parseFloat(a['Marge %']));
            fileName = 'rapport-marge';
            break;
        }
    }

    if (!data.length) return alert('Aucune donnée à exporter');

    const dateStr = new Date().toISOString().split('T')[0];
    if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, fileName);
        XLSX.writeFile(wb, `stock-radar-${fileName}-${dateStr}.xlsx`);
    } else {
        const headers = Object.keys(data[0]);
        let csv = '\uFEFF' + headers.join(';') + '\n';
        data.forEach(row => {
            csv += headers.map(h => `"${String(row[h]||'').replace(/"/g,'""')}"`).join(';') + '\n';
        });
        downloadCSV(csv, `stock-radar-${fileName}-${dateStr}.csv`);
    }
}

function formatProductExport(p) {
    const marge = (p.prix_achat > 0 && p.prix_revente > 0) ? ((p.prix_revente - p.prix_achat) / p.prix_achat * 100).toFixed(1) + '%' : '-';
    return {
        'Date': p.date_ajout ? new Date(p.date_ajout).toLocaleDateString('fr-FR') : '',
        'EAN': p.ean||'', 'Nom': p.nom||'', 'Catégorie': p.categorie||'',
        'État': p.etat||'', 'Type Stock': p.etat_stock||'',
        'Qté FBA': p.qte_fba||0, 'Qté FBM': p.qte_fbm||0, 'Qté Entrepôt': p.qte_entrepot||0,
        'Qté Total': p.quantite||0,
        'Prix Achat': (p.prix_achat||0).toFixed(2), 'Prix Revente': (p.prix_revente||0).toFixed(2),
        'Marge': marge,
        'Valeur': ((p.prix_revente||0) * (p.quantite||0)).toFixed(2),
        'Canaux': [p.amazon_fba?'FBA':'', p.amazon_fbm?'FBM':'', p.vinted?'Vinted':'', p.leboncoin?'LBC':''].filter(Boolean).join(', '),
        'Notes': p.notes||''
    };
}

function formatAchatExport(a) {
    return {
        'Date': a.date_achat ? new Date(a.date_achat).toLocaleDateString('fr-FR') : '',
        'EAN': a.ean||'', 'Nom': a.nom||'', 'Fournisseur': a.fournisseur_nom||'',
        'Quantité': a.quantite||1, 'Prix HT': (a.prix_ht||0).toFixed(2),
        'Prix TTC': (a.prix_ttc||0).toFixed(2),
        'Reçu': a.recu ? 'Oui' : 'Non', 'Notes': a.notes||''
    };
}

// ═══════ BACKUP / RESTORE ═══════
async function backupData() {
    const backup = {
        version: 'stock-radar-v2',
        date: new Date().toISOString(),
        fournisseurs: fournisseurs,
        achats: achats,
        produits: products,
        factures: factures
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stock-radar-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

async function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!confirm('⚠️ ATTENTION : Cela va SUPPRIMER toutes les données actuelles et les remplacer par celles du fichier de sauvegarde.\n\nÊtes-vous sûr ?')) {
        event.target.value = '';
        return;
    }

    try {
        const text = await file.text();
        const backup = JSON.parse(text);
        
        if (!backup.version || !backup.version.startsWith('stock-radar')) {
            alert('❌ Fichier de sauvegarde non reconnu');
            return;
        }

        // Confirmation finale
        const info = `Données du fichier :\n- ${(backup.fournisseurs||[]).length} fournisseurs\n- ${(backup.achats||[]).length} achats\n- ${(backup.produits||[]).length} produits\n\nDate de sauvegarde : ${backup.date ? new Date(backup.date).toLocaleString('fr-FR') : 'inconnue'}\n\nConfirmer la restauration ?`;
        if (!confirm(info)) return;

        // Supprimer les données actuelles
        await sb.from('factures').delete().neq('id', 0);
        await sb.from('produits').delete().neq('id', 0);
        await sb.from('achats').delete().neq('id', 0);
        await sb.from('fournisseurs').delete().neq('id', 0);

        // Insérer les données de la sauvegarde par lots
        if (backup.fournisseurs?.length) {
            const fClean = backup.fournisseurs.map(f => ({ nom: f.nom, contact: f.contact||'', email: f.email||'', tel: f.tel||'', adresse: f.adresse||'', notes: f.notes||'' }));
            for (let i = 0; i < fClean.length; i += 50) {
                await sb.from('fournisseurs').insert(fClean.slice(i, i+50));
            }
        }
        if (backup.achats?.length) {
            const aClean = backup.achats.map(a => ({ ean: a.ean, nom: a.nom, categorie: a.categorie||'', fournisseur_nom: a.fournisseur_nom||'', prix_ht: a.prix_ht||0, prix_ttc: a.prix_ttc||0, quantite: a.quantite||1, recu: a.recu||false, notes: a.notes||'', date_achat: a.date_achat }));
            for (let i = 0; i < aClean.length; i += 50) {
                await sb.from('achats').insert(aClean.slice(i, i+50));
            }
        }
        if (backup.produits?.length) {
            const pClean = backup.produits.map(p => ({
                ean: p.ean, nom: p.nom, categorie: p.categorie||'', etat: p.etat||'Neuf', etat_stock: p.etat_stock||'neuf',
                prix_achat: p.prix_achat||0, prix_revente: p.prix_revente||0,
                qte_fba: p.qte_fba||0, qte_fbm: p.qte_fbm||0, qte_entrepot: p.qte_entrepot||0, quantite: p.quantite||0,
                amazon_fba: p.amazon_fba||false, amazon_fbm: p.amazon_fbm||false,
                vinted: p.vinted||false, leboncoin: p.leboncoin||false,
                invendable: p.invendable||false, vendu: p.vendu||false,
                date_vente: p.date_vente||null, prix_vente_reel: p.prix_vente_reel||0,
                plateforme_vente: p.plateforme_vente||null,
                photos: p.photos||[], notes: p.notes||'', date_ajout: p.date_ajout
            }));
            for (let i = 0; i < pClean.length; i += 50) {
                await sb.from('produits').insert(pClean.slice(i, i+50));
            }
        }
        if (backup.factures?.length) {
            const faClean = backup.factures.map(fa => ({
                numero: fa.numero, fournisseur_id: null, fournisseur_nom: fa.fournisseur_nom||'',
                date_facture: fa.date_facture, date_echeance: fa.date_echeance,
                montant_ht: fa.montant_ht||0, montant_ttc: fa.montant_ttc||0,
                payee: fa.payee||false, date_paiement: fa.date_paiement||null, notes: fa.notes||''
            }));
            for (let i = 0; i < faClean.length; i += 50) {
                await sb.from('factures').insert(faClean.slice(i, i+50));
            }
        }

        alert('✅ Restauration terminée ! Rechargement...');
        location.reload();
    } catch (e) {
        alert('❌ Erreur lors de la restauration : ' + e.message);
        console.error(e);
    }
    event.target.value = '';
}

// ═══════ AIDE ACCORDÉON ═══════
function toggleHelp(header) {
    const body = header.nextElementSibling;
    const isOpen = header.classList.contains('open');
    header.classList.toggle('open');
    body.classList.toggle('open');
}

// ═══════ KEYBOARD SHORTCUTS ═══════
document.addEventListener('keydown', (e) => {
    // Ignorer si on est dans un input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        // Sauf Escape pour fermer les modals
        if (e.key === 'Escape') {
            closeProductModal();
            closeVenteModal();
            document.getElementById('global-search-results').style.display = 'none';
        }
        return;
    }

    if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
            case 'n':
                e.preventDefault();
                switchTab('nouveau-produit');
                setTimeout(() => document.getElementById('ean')?.focus(), 200);
                break;
            case 'f':
                e.preventDefault();
                const searchInput = document.getElementById('global-search');
                if (searchInput) { searchInput.focus(); searchInput.select(); }
                break;
            case 's':
                e.preventDefault();
                switchTab('nouveau-produit');
                setTimeout(() => startScanner(), 300);
                break;
            case 'd':
                e.preventDefault();
                switchTab('dashboard');
                break;
            case 'k':
                e.preventDefault();
                switchTab('stock');
                break;
            case 'e':
                e.preventDefault();
                exportStockExcel();
                break;
        }
    }

    // Escape pour fermer les modals
    if (e.key === 'Escape') {
        closeProductModal();
        closeVenteModal();
        document.getElementById('global-search-results').style.display = 'none';
    }
});
if (localStorage.getItem('darkMode') === 'true') { document.body.classList.add('dark-theme'); }
updateDarkModeIcon();
const dateEl = document.getElementById('a-date');
if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

// Show mobile search on small screens
if (window.innerWidth <= 768) {
    const ms = document.getElementById('mobile-search');
    if (ms) ms.style.display = 'block';
}

// ═══════ GLOBAL SEARCH ═══════
let searchTimeout = null;
function globalSearch(query, isMobile = false) {
    clearTimeout(searchTimeout);
    const resultsId = isMobile ? 'global-search-results-mobile' : 'global-search-results';
    const dropdown = document.getElementById(resultsId);
    if (!dropdown) return;
    
    if (!query || query.length < 2) {
        dropdown.style.display = 'none';
        return;
    }

    searchTimeout = setTimeout(() => {
        const q = query.toLowerCase();
        let results = [];
        
        // Chercher dans les produits
        products.filter(p => !p.vendu).forEach(p => {
            if ((p.nom||'').toLowerCase().includes(q) || (p.ean||'').toLowerCase().includes(q) || 
                (p.categorie||'').toLowerCase().includes(q) || (p.notes||'').toLowerCase().includes(q)) {
                results.push({ type: 'stock', id: p.id, nom: p.nom, detail: `EAN: ${p.ean||'-'} · ${p.quantite||0} unités · ${(p.prix_revente||0).toFixed(2)}€`, badge: p.etat_stock || 'neuf' });
            }
        });
        
        // Chercher dans les achats
        achats.forEach(a => {
            if ((a.nom||'').toLowerCase().includes(q) || (a.ean||'').toLowerCase().includes(q) || 
                (a.fournisseur_nom||'').toLowerCase().includes(q)) {
                results.push({ type: 'achat', id: a.id, nom: a.nom, detail: `EAN: ${a.ean||'-'} · ${a.fournisseur_nom||'?'} · ${(a.prix_ttc||0).toFixed(2)}€`, badge: a.recu ? 'Reçu' : 'Attente' });
            }
        });
        
        // Chercher dans les fournisseurs
        fournisseurs.forEach(f => {
            if ((f.nom||'').toLowerCase().includes(q) || (f.email||'').toLowerCase().includes(q) || 
                (f.contact||'').toLowerCase().includes(q)) {
                results.push({ type: 'fournisseur', id: f.id, nom: f.nom, detail: `${f.contact||''} ${f.email||''}`.trim() || 'Pas de détails', badge: '' });
            }
        });

        if (!results.length) {
            dropdown.innerHTML = '<div class="search-result-item" style="color:var(--text-secondary);">Aucun résultat pour "' + escapeHtml(query) + '"</div>';
        } else {
            dropdown.innerHTML = results.slice(0, 15).map(r => `
                <div class="search-result-item" onclick="goToSearchResult('${r.type}', ${r.id})">
                    <div>
                        <strong>${escapeHtml(r.nom)}</strong>
                        <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(r.detail)}</div>
                    </div>
                    <span class="search-result-type ${r.type}">${r.type === 'stock' ? '📦 Stock' : r.type === 'achat' ? '🛒 Achat' : '🏪 Fournisseur'}</span>
                </div>
            `).join('');
        }
        dropdown.style.display = 'block';
    }, 200);
}

function goToSearchResult(type, id) {
    // Fermer les dropdowns
    document.getElementById('global-search-results').style.display = 'none';
    const mobileResults = document.getElementById('global-search-results-mobile');
    if (mobileResults) mobileResults.style.display = 'none';
    document.getElementById('global-search').value = '';
    const mobileInput = document.getElementById('global-search-mobile');
    if (mobileInput) mobileInput.value = '';
    
    if (type === 'stock') {
        switchTab('stock');
        setTimeout(() => openProductModal(id), 300);
    } else if (type === 'achat') {
        switchTab('achats');
    } else if (type === 'fournisseur') {
        switchTab('fournisseurs');
    }
}

// Fermer dropdown quand on clique ailleurs
document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search-wrapper')) {
        document.getElementById('global-search-results').style.display = 'none';
        const mobileResults = document.getElementById('global-search-results-mobile');
        if (mobileResults) mobileResults.style.display = 'none';
    }
});
