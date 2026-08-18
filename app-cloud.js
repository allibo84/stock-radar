// ═══════════════════════════════════════════════
// STOCK RADAR V4 - app-cloud.js
// ═══════════════════════════════════════════════

// ── Toast notification system ──
function showToast(type, title, message, duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><div class="toast-body"><div class="toast-title">${escapeHtml(title)}</div>${message ? `<div class="toast-msg">${escapeHtml(message)}</div>` : ''}</div>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all .3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
function toastSuccess(title, msg) { showToast('success', title, msg); }
function toastError(title, msg)   { showToast('error',   title, msg, 6000); }
function toastWarning(title, msg) { showToast('warning', title, msg, 5000); }
function toastInfo(title, msg)    { showToast('info',    title, msg); }

// ── Async confirm dialog (replaces browser confirm()) ──
function srConfirm(message, title = 'Confirmer', danger = false) {
    return new Promise(resolve => {
        const existing = document.getElementById('sr-confirm-modal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'sr-confirm-modal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px);';
        const btnColor = danger ? 'var(--danger)' : 'var(--brand)';
        const btnLabel = danger ? 'Supprimer' : 'Confirmer';
        modal.innerHTML = `
            <div style="background:var(--bg-elevated);border-radius:var(--radius-xl);padding:28px;max-width:420px;width:100%;border:1px solid var(--border);box-shadow:var(--shadow-lg);">
                <div style="font-size:15px;font-weight:700;color:var(--text-1);margin-bottom:10px;">${escapeHtml(title)}</div>
                <div style="font-size:13.5px;color:var(--text-2);line-height:1.6;margin-bottom:22px;white-space:pre-line;">${escapeHtml(message)}</div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="sr-confirm-cancel" style="padding:9px 18px;border-radius:var(--radius);border:1.5px solid var(--border);background:var(--bg-elevated);color:var(--text-1);font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit;">Annuler</button>
                    <button id="sr-confirm-ok" style="padding:9px 18px;border-radius:var(--radius);border:none;background:${btnColor};color:white;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;">${btnLabel}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        const cleanup = (result) => { modal.remove(); resolve(result); };
        modal.querySelector('#sr-confirm-ok').onclick = () => cleanup(true);
        modal.querySelector('#sr-confirm-cancel').onclick = () => cleanup(false);
        modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
    });
}

// sb est créé dans config.js
let fournisseurs = [], achats = [], products = [], mouvements = [], ventes = [];
let currentPhotos = [], currentVenteProductId = null;
let activeStockView = 'all';
let stockCurrentPage = 1;
let stockPerPage = 25;
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
            loadFournitures().catch(e => console.warn('Fournitures:', e)),
            loadVentes().catch(e => console.warn('Ventes:', e)),
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
    populateAchatsFilters();
    displayAchats();
}

async function loadProducts() {
    let query = sb.from('produits').select('*').order('date_ajout', { ascending: false });
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur produits:', error.message);
    products = (data || []).map(p => ({
        ...p,
        etat_stock: p.etat_stock ?? 'neuf',
        statut: p.statut ?? 'recu',
        emplacement: p.emplacement ?? '',
        seuil_stock: p.seuil_stock ?? 0,
        qte_fba: p.qte_fba ?? 0,
        qte_fbm: p.qte_fbm ?? 0,
        qte_entrepot: p.qte_entrepot ?? (p.quantite ?? 1),
        quantite: p.quantite ?? ((p.qte_fba ?? 0) + (p.qte_fbm ?? 0) + (p.qte_entrepot ?? 0)),
        amazon_fba: p.amazon_fba ?? false,
        amazon_fbm: p.amazon_fbm ?? false,
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

async function loadVentes() {
    let query = sb.from('ventes').select('*').order('date_vente', { ascending: false });
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur ventes:', error.message);
    ventes = data || [];
    displayVentes();
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, () => loadVentes())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'factures' }, () => loadFactures())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fournitures' }, () => loadFournitures())
        .subscribe();
}

// ═══════ NAVIGATION ═══════
function switchTab(tabName) {
    // Sans ça, la caméra reste allumée en arrière-plan et continue d'écrire dans le formulaire
    if (tabName !== 'nouveau-produit') stopScanner();
    if (tabName !== 'inventaire') stopInventaireScanner();
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
    if (tabName === 'ventes') displayVentes();
    if (tabName === 'outils-export') loadSauvegardes();
}

document.addEventListener('click', e => {
    const mi = e.target.closest('.menu-item');
    if (mi && mi.dataset.tab) switchTab(mi.dataset.tab);
});

function escapeHtml(t) {
    if (t === null || t === undefined || t === '') return '';
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
        const totalAchats = achats.filter(a => a.fournisseur_nom === f.nom).reduce((s, a) => s + ((a.prix_ttc || 0) * (a.quantite || 1)), 0);
        const catBadge = f.categorie_fournisseur ? `<span style="background:#27352a;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">${escapeHtml(f.categorie_fournisseur)}</span>` : '';
        
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
    if (!f.nom) return toastError('Champ requis', 'Le nom du fournisseur est obligatoire.');
    f.user_id = getEffectiveUserId();
    const { error } = await sb.from('fournisseurs').insert([f]);
    if (error) return toastError('Erreur', error.message);
    this.reset();
    document.getElementById('fournisseur-form-section').style.display = 'none';
    await loadFournisseurs();
});

async function deleteFournisseur(id) {
    const f = fournisseurs.find(x => x.id === id);
    if (!await srConfirm(`Supprimer le fournisseur "${f?.nom || ''}" ?`, 'Supprimer', true)) return;
    await sb.from('fournisseurs').delete().eq('id', id);
    await loadFournisseurs();
    toastSuccess('Fournisseur supprimé');
}

// Fiche fournisseur modale
function openFournisseurModal(id) {
    const f = fournisseurs.find(x => x.id === id);
    if (!f) return;
    
    const fAchats = achats.filter(a => a.fournisseur_nom === f.nom);
    const totalAchats = fAchats.reduce((s, a) => s + ((a.prix_ttc || 0) * (a.quantite || 1)), 0);
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

function toggleFactureForm() {
    const section = document.getElementById('facture-form-section');
    if (section.style.display === 'none' || !section.style.display) {
        document.getElementById('facture-form').reset();
        document.getElementById('fac-date').value = new Date().toISOString().split('T')[0];
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
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
    if (!fa.numero) return toastError('Champ requis', 'Le numéro de facture est obligatoire.');
    fa.user_id = getEffectiveUserId();
    const { error } = await sb.from('factures').insert([fa]);
    if (error) return toastError('Erreur', error.message);
    this.reset();
    document.getElementById('facture-form-section').style.display = 'none';
    await loadFactures();
});

async function marquerPayee(id) {
    if (!await srConfirm('Marquer cette facture comme payée ?', 'Confirmer le paiement')) return;
    await sb.from('factures').update({ payee: true, date_paiement: new Date().toISOString().split('T')[0] }).eq('id', id);
    await loadFactures();
    toastSuccess('Facture marquée comme payée');
}

async function deleteFacture(id) {
    if (!await srConfirm('Supprimer cette facture définitivement ?', 'Supprimer', true)) return;
    await sb.from('factures').delete().eq('id', id);
    await loadFactures();
}

function updateFournisseursSelect() {
    ['a-fournisseur', 'filter-achat-fournisseur', 'four-fournisseur', 'grossiste-fournisseur'].forEach(sid => {
        const sel = document.getElementById(sid);
        if (!sel) return;
        const val = sel.value;
        const first = sel.options[0].outerHTML;
        sel.innerHTML = first;
        fournisseurs.forEach(f => sel.innerHTML += `<option value="${f.id}">${escapeHtml(f.nom)}</option>`);
        sel.value = val;
    });
}

async function quickAddFournisseur() {
    const nom = prompt('Nom du nouveau fournisseur :');
    if (!nom || !nom.trim()) return;
    const { data, error } = await sb.from('fournisseurs').insert([{ nom: nom.trim(), user_id: getEffectiveUserId() }]).select();
    if (error) return toastError('Erreur', error.message);
    toastSuccess('Fournisseur créé', nom.trim());
    await loadFournisseurs();
    // Sélectionner automatiquement le nouveau fournisseur
    if (data && data[0]) {
        document.getElementById('a-fournisseur').value = data[0].id;
    }
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
        asin: (document.getElementById('a-asin')?.value || '').trim().toUpperCase(),
        nom: document.getElementById('a-nom').value.trim(),
        categorie: document.getElementById('a-categorie').value,
        fournisseur_id: fId ? parseInt(fId) : null,
        fournisseur_nom: fObj ? fObj.nom : '',
        prix_ht: parseFloat(document.getElementById('a-prix-ht').value) || 0,
        prix_ttc: parseFloat(document.getElementById('a-prix-ttc').value) || 0,
        quantite: parseInt(document.getElementById('a-quantite').value) || 1,
        notes: document.getElementById('a-notes').value.trim(),
        date_achat: document.getElementById('a-date').value || new Date().toISOString().split('T')[0],
    };
    if (!a.ean || !a.nom) return toastError('Champs requis', `L'EAN et le nom du produit sont obligatoires.`);
    a.user_id = getEffectiveUserId();

    if (editingAchatId) {
        // Mode modification
        const { error } = await sb.from('achats').update(a).eq('id', editingAchatId);
        if (error) return toastError('Erreur', error.message);
    } else {
        // Mode création
        const { error } = await sb.from('achats').insert([a]);
        if (error) return toastError('Erreur', error.message);
    }
    
    resetAchatForm();
    document.getElementById('achat-form-section').style.display = 'none';
    await loadAchats();
});

function displayAchats() {
    const c = document.getElementById('achats-container');
    if (!c) return;
    const filtered = filterAchats();
    if (!filtered.length) { c.innerHTML = '<div class="empty-state"><h3>Aucun achat</h3></div>'; updateAchatsStats(); return; }
    let h = `<div id="achats-selection-bar" style="margin-bottom:10px;display:none;gap:10px;flex-wrap:wrap;">
        <button class="scan-button" style="padding:6px 14px;font-size:13px;" onclick="copySelectedCodes('ean')">📋 Copier EAN sélectionnés</button>
        <button class="scan-button" style="padding:6px 14px;font-size:13px;background:#ff9900;" onclick="copySelectedCodes('asin')">📋 Copier ASIN sélectionnés</button>
        <span id="achats-selected-count" style="font-size:13px;color:var(--text-secondary);padding:8px 0;"></span>
    </div>`;
    h += '<div class="products-table"><table><thead><tr><th style="width:30px;"><input type="checkbox" id="achats-select-all" onchange="toggleAllAchats(this.checked)"></th><th>Date</th><th>EAN</th><th>ASIN</th><th>Produit</th><th>Fournisseur</th><th>Qté</th><th>Prix HT</th><th>Prix TTC</th><th>Reçu</th><th>Actions</th></tr></thead><tbody>';
    filtered.forEach(a => {
        const d = a.date_achat ? new Date(a.date_achat).toLocaleDateString('fr-FR') : '-';
        const recuBadge = a.recu ? '<span class="badge badge-stock" style="cursor:pointer">✅ Reçu</span>' : '<span class="badge badge-invendable" style="cursor:pointer">⏳ Attente</span>';
        h += `<tr style="cursor:pointer" onclick="editAchat(${a.id})"><td onclick="event.stopPropagation()"><input type="checkbox" class="achat-check" data-id="${a.id}" data-ean="${escapeHtml(a.ean||'')}" data-asin="${escapeHtml(a.asin||'')}" onchange="updateAchatsSelection()"></td><td>${d}</td><td>${escapeHtml(a.ean)}</td><td>${escapeHtml(a.asin||'-')}</td><td><strong>${escapeHtml(a.nom)}</strong></td><td>${escapeHtml(a.fournisseur_nom||'-')}</td><td>${a.quantite||1}</td><td>${(a.prix_ht||0).toFixed(2)}€</td><td>${(a.prix_ttc||0).toFixed(2)}€</td><td onclick="event.stopPropagation();toggleRecu(${a.id},${!a.recu})">${recuBadge}</td><td onclick="event.stopPropagation()"><div class="action-buttons" style="display:flex;gap:4px;"><button class="btn-small" style="background:#3498db;color:white;padding:4px 8px;border-radius:6px;" onclick="duplicateAchat(${a.id})" title="Dupliquer">📋</button>${(a.asin || a.ean) ? `<button class="btn-small" style="background:#1565c0;color:white;padding:4px 8px;border-radius:6px;font-weight:700;" onclick="openSellerAmp('${escapeHtml(a.asin || a.ean)}')" title="Analyser sur SellerAmp">⚡</button>` : ''}${a.asin ? `<button class="btn-small" style="background:#ff9900;color:white;padding:4px 8px;border-radius:6px;font-weight:700;" onclick="openSellerCentral('${escapeHtml(a.asin)}')" title="Ajouter l'offre sur Amazon Seller Central">➕</button>` : ''}<button class="btn-small btn-delete" onclick="deleteAchat(${a.id})" title="Supprimer">🗑️</button></div></td></tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
    updateAchatsStats();
}

function filterAchats() {
    const s = (document.getElementById('search-achats')?.value || '').trim().toLowerCase();
    const f = document.getElementById('filter-achat-fournisseur')?.value || '';
    const r = document.getElementById('filter-achat-recu')?.value || '';
    const dateDebut = document.getElementById('filter-achat-date-debut')?.value || '';
    const dateFin = document.getElementById('filter-achat-date-fin')?.value || '';
    const tri = document.getElementById('filter-achat-tri')?.value || 'recent';

    let result = achats.filter(a => {
        if (s && !(a.nom||'').toLowerCase().includes(s) && !(a.ean||'').toLowerCase().includes(s) && !(a.asin||'').toLowerCase().includes(s) && !(a.fournisseur_nom||'').toLowerCase().includes(s)) return false;
        if (f && String(a.fournisseur_id) !== String(f)) return false;
        if (r === 'oui' && !a.recu) return false;
        if (r === 'non' && a.recu) return false;
        if (dateDebut && a.date_achat && a.date_achat.split('T')[0] < dateDebut) return false;
        if (dateFin && a.date_achat && a.date_achat.split('T')[0] > dateFin) return false;
        return true;
    });

    // Tri
    if (tri === 'recent') result.sort((a, b) => (b.date_achat || '').localeCompare(a.date_achat || ''));
    else if (tri === 'ancien') result.sort((a, b) => (a.date_achat || '').localeCompare(b.date_achat || ''));
    else if (tri === 'nom') result.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    else if (tri === 'prix-desc') result.sort((a, b) => ((b.prix_ttc || 0) * (b.quantite || 1)) - ((a.prix_ttc || 0) * (a.quantite || 1)));
    else if (tri === 'prix-asc') result.sort((a, b) => ((a.prix_ttc || 0) * (a.quantite || 1)) - ((b.prix_ttc || 0) * (b.quantite || 1)));
    else if (tri === 'qte-desc') result.sort((a, b) => (b.quantite || 1) - (a.quantite || 1));

    return result;
}

function populateAchatsFilters() {
    if (!achatsFiltersInit) {
        document.getElementById('search-achats')?.addEventListener('input', displayAchats);
        document.getElementById('filter-achat-fournisseur')?.addEventListener('change', displayAchats);
        document.getElementById('filter-achat-recu')?.addEventListener('change', displayAchats);
        document.getElementById('filter-achat-date-debut')?.addEventListener('change', displayAchats);
        document.getElementById('filter-achat-date-fin')?.addEventListener('change', displayAchats);
        document.getElementById('filter-achat-tri')?.addEventListener('change', displayAchats);
        achatsFiltersInit = true;
    }
}

function resetAchatsFilters() {
    const ids = ['search-achats', 'filter-achat-fournisseur', 'filter-achat-recu', 'filter-achat-date-debut', 'filter-achat-date-fin'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('filter-achat-tri').value = 'recent';
    displayAchats();
}

function toggleAllAchats(checked) {
    document.querySelectorAll('.achat-check').forEach(cb => cb.checked = checked);
    updateAchatsSelection();
}

function updateAchatsSelection() {
    const checked = document.querySelectorAll('.achat-check:checked');
    const barre = document.getElementById('achats-selection-bar');
    if (barre) barre.style.display = checked.length > 0 ? 'flex' : 'none';
    const count = checked.length;
    const countEl = document.getElementById('achats-selected-count');
    if (countEl) countEl.textContent = count > 0 ? `${count} sélectionné${count > 1 ? 's' : ''}` : '';
}

function copySelectedCodes(type) {
    const checked = document.querySelectorAll('.achat-check:checked');
    if (!checked.length) return toastError('Sélection vide', 'Sélectionnez au moins un achat.');
    
    const codes = [];
    checked.forEach(cb => {
        const code = type === 'asin' ? cb.dataset.asin : cb.dataset.ean;
        if (code && code !== '-' && code.trim()) codes.push(code.trim());
    });

    if (!codes.length) return toastWarning('Aucun code', `Aucun ${type.toUpperCase()} trouvé dans la sélection.`);

    const text = codes.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        const msg = `✅ ${codes.length} ${type.toUpperCase()} copié${codes.length > 1 ? 's' : ''} !`;
        toastSuccess("Codes copiés", msg);
    }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toastSuccess('Codes copiés', `${codes.length} ${type.toUpperCase()} copié${codes.length > 1 ? 's' : ''} dans le presse-papiers.`);
    });
}

function updateAchatsStats() {
    const filtered = filterAchats();
    const isFiltered = (document.getElementById('search-achats')?.value || '') !== '' ||
                       (document.getElementById('filter-achat-fournisseur')?.value || '') !== '' ||
                       (document.getElementById('filter-achat-recu')?.value || '') !== '' ||
                       (document.getElementById('filter-achat-date-debut')?.value || '') !== '' ||
                       (document.getElementById('filter-achat-date-fin')?.value || '') !== '';
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('achats-total', filtered.length + (isFiltered ? ' / ' + achats.length : ''));
    el('achats-total-label', isFiltered ? 'Achats filtrés' : 'Total achats');
    el('achats-qte', filtered.reduce((s, a) => s + (a.quantite || 1), 0));
    el('achats-montant-ht', filtered.reduce((s, a) => s + ((a.prix_ht || 0) * (a.quantite || 1)), 0).toFixed(2) + '€');
    el('achats-montant', filtered.reduce((s, a) => s + ((a.prix_ttc || 0) * (a.quantite || 1)), 0).toFixed(2) + '€');
    el('achats-en-attente', filtered.filter(a => !a.recu).length);
}

async function toggleRecu(id, v) {
    // Empêcher la double création de stock — vérification via produit_genere_id
    const achat = achats.find(a => a.id === id);

    // Cas d'incohérence : produit déjà créé mais recu=false → juste mettre recu=true sans recréer
    if (v === true && achat?.produit_genere_id && !achat?.recu) {
        await sb.from('achats').update({ recu: true }).eq('id', id);
        await loadAchats();
        toastSuccess('Réception confirmée', 'Le produit (ID ' + achat.produit_genere_id + ') est déjà en stock.');
        return;
    }

    // Déjà reçu ET produit créé → bloquer
    if (v === true && achat?.produit_genere_id && achat?.recu) {
        toastWarning('Déjà réceptionné', 'Un produit a déjà été créé pour cet achat (ID ' + achat.produit_genere_id + ').');
        return;
    }
    if (v === true && achat?.recu === true) return;

    await sb.from('achats').update({ recu: v }).eq('id', id);

    if (v === true && achat) {
        const pr = {
            user_id: getEffectiveUserId(),
            ean: achat.ean,
            asin: (achat.asin || '').toUpperCase(),
            nom: achat.nom,
            categorie: achat.categorie || '',
            etat: 'Neuf',
            etat_stock: 'neuf',
            statut: 'recu',
            emplacement: '',
            prix_achat: achat.prix_ttc || achat.prix_ht || 0,
            prix_revente: 0,
            qte_fba: 0, qte_fbm: 0,
            qte_entrepot: achat.quantite || 1,
            quantite: achat.quantite || 1,
            amazon_fba: false, amazon_fbm: false,
            vinted: false, leboncoin: false,
            invendable: false, vendu: false,
            photos: [],
            notes: achat.notes || '',
            date_ajout: new Date().toISOString(),
        };
        const { data: inserted, error } = await sb.from('produits').insert([pr]).select();
        if (error) {
            console.warn('Erreur création produit depuis achat:', error.message);
        } else if (inserted && inserted[0]) {
            // Lier l'achat au produit créé via la vraie relation SQL
            await sb.from('achats').update({ produit_genere_id: inserted[0].id }).eq('id', id);
            await logMouvement(inserted[0].id, 'reception', achat.quantite || 1, 'achat', 'entrepot', 'Réception achat', achat.fournisseur_nom || '');
        }
        await loadProducts();
        updateDashboard();
    }

    await loadAchats();
}

async function deleteAchat(id) {
    const a = achats.find(x => x.id === id);
    if (!await srConfirm(`Supprimer l'achat "${a?.nom || ""}" ?`, 'Supprimer', true)) return;
    await sb.from('achats').delete().eq('id', id);
    await loadAchats();
    toastSuccess('Achat supprimé');
}

let editingAchatId = null;

function duplicateAchat(id) {
    const a = achats.find(x => x.id === id);
    if (!a) return;
    editingAchatId = null; // Mode création, pas modification
    
    document.getElementById('a-ean').value = a.ean || '';
    document.getElementById('a-asin').value = a.asin || '';
    document.getElementById('a-nom').value = a.nom || '';
    document.getElementById('a-categorie').value = a.categorie || '';
    document.getElementById('a-fournisseur').value = a.fournisseur_id || '';
    document.getElementById('a-prix-ht').value = '';
    document.getElementById('a-prix-ttc').value = '';
    document.getElementById('a-quantite').value = a.quantite || 1;
    document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('a-notes').value = a.notes || '';
    
    const btn = document.querySelector('#achat-form .submit-button');
    if (btn) btn.innerHTML = '💾 Enregistrer (copie)';
    
    document.getElementById('achat-form-section').style.display = 'block';
    document.getElementById('achat-form-section').scrollIntoView({ behavior: 'smooth' });
}

function editAchat(id) {
    const a = achats.find(x => x.id === id);
    if (!a) return;
    editingAchatId = id;
    
    // Remplir le formulaire avec les données de l'achat
    document.getElementById('a-ean').value = a.ean || '';
    document.getElementById('a-asin').value = a.asin || '';
    document.getElementById('a-nom').value = a.nom || '';
    document.getElementById('a-categorie').value = a.categorie || '';
    document.getElementById('a-fournisseur').value = a.fournisseur_id || '';
    document.getElementById('a-prix-ht').value = a.prix_ht || '';
    document.getElementById('a-prix-ttc').value = a.prix_ttc || '';
    document.getElementById('a-quantite').value = a.quantite || 1;
    document.getElementById('a-date').value = a.date_achat ? a.date_achat.split('T')[0] : '';
    document.getElementById('a-notes').value = a.notes || '';
    
    // Changer le bouton submit
    const btn = document.querySelector('#achat-form .submit-button');
    if (btn) btn.innerHTML = '💾 Modifier l\'achat';
    
    // Afficher le formulaire
    document.getElementById('achat-form-section').style.display = 'block';
    document.getElementById('achat-form-section').scrollIntoView({ behavior: 'smooth' });
}

function resetAchatForm() {
    editingAchatId = null;
    document.getElementById('achat-form').reset();
    // Remettre la date du jour
    document.getElementById('a-date').value = new Date().toISOString().split('T')[0];
    const btn = document.querySelector('#achat-form .submit-button');
    if (btn) btn.innerHTML = '💾 Enregistrer';
}

function toggleAchatForm() {
    const section = document.getElementById('achat-form-section');
    if (section.style.display === 'none' || !section.style.display) {
        resetAchatForm();
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
        resetAchatForm();
    }
}

function exportAchatsCSV() {
    if (!achats.length) return toastError('Aucune donnée', 'Aucun achat à exporter.');
    let csv = '\uFEFFDate,EAN,ASIN,Nom,Fournisseur,Qté,Prix HT,Prix TTC,Reçu,Notes\n';
    achats.forEach(a => {
        csv += `"${a.date_achat?new Date(a.date_achat).toLocaleDateString('fr-FR'):'-'}","${a.ean}","${a.asin||''}","${a.nom}","${a.fournisseur_nom||''}",${a.quantite||1},${(a.prix_ht||0).toFixed(2)},${(a.prix_ttc||0).toFixed(2)},"${a.recu?'Oui':'Non'}","${(a.notes||'').replace(/"/g,'""')}"\n`;
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
    return document.getElementById('prix-type-ht')?.checked ? +(val * 1.20).toFixed(2) : val;
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

// Sons de scan — un seul AudioContext pour toute la session.
// Avant : un contexte par bip, jamais fermé → au bout de quelques dizaines de scans
// le navigateur refusait d'en créer un de plus et les bips s'arrêtaient en silence.
let audioCtx = null;
function playSound(type) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const ctx = audioCtx;
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
        osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch(e) {} };
    } catch(e) { console.warn('Son de scan indisponible :', e.message); }
}

let scanFeedbackTimer = null;
function showScanFeedback(text, type) {
    const el = document.getElementById('scan-feedback');
    if (!el) return;
    // Annuler le masquage programmé par le scan précédent, sinon il efface ce message-ci
    if (scanFeedbackTimer) clearTimeout(scanFeedbackTimer);
    el.textContent = text;
    el.className = 'scan-feedback ' + type;
    el.style.display = 'block';
    scanFeedbackTimer = setTimeout(() => { el.style.display = 'none'; }, 2000);
}

// Coupe les trois scanners. Deux lecteurs ZXing actifs en même temps décodent
// le même flux et comptent chaque code deux fois.
function stopAllScanners(sauf) {
    if (sauf !== 'produit') stopScanner();
    if (sauf !== 'inventaire') stopInventaireScanner();
    if (sauf !== 'quick') stopQuickScanner();
}

async function startScanner() {
    if (typeof ZXing === 'undefined') {
        toastError('Scanner non disponible', 'Vérifiez votre connexion internet.');
        return;
    }
    if (codeReader) return;              // déjà en route : un 2e clic ne doit rien faire
    stopAllScanners('produit');
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
                    // Remplir quand même le champ s'il est vide (ex: 2e produit identique après enregistrement)
                    if (!document.getElementById('ean').value) {
                        document.getElementById('ean').value = ean;
                        checkPurchaseHistory();
                    }
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
        stopScanner();                   // sinon l'écran reste bloqué en mode "scan en cours"
        toastError('Erreur caméra', e.message); 
    }
}

function stopScanner() {
    if (codeReader) { try { codeReader.reset(); } catch(e) {} codeReader = null; }
    const v = document.getElementById('video'); if (v) v.style.display = 'none';
    const b = document.getElementById('stop-scanner'); if (b) b.style.display = 'none';
    // Sans ça, rescanner un code déjà lu est rejeté comme doublon et le champ garde
    // la valeur saisie entre-temps.
    lastScannedEAN = '';
    scanCooldown = false;
}

// Signale un champ manquant : toast + scroll + focus + bordure rouge temporaire
function champManquant(id, titre, msg) {
    const el = document.getElementById(id);
    if (el) {
        el.style.outline = '2px solid #e74c3c';
        el.style.outlineOffset = '1px';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.focus({ preventScroll: true }), 300);
        setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 4000);
    }
    toastError(titre, msg);
}

// Douchette USB : la touche Entrée envoyée après le code ne doit pas soumettre
// un formulaire incomplet — on passe au champ suivant à la place
document.getElementById('ean')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('product-name')?.focus();
    }
});

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

    // Récupération des valeurs
    const ean = document.getElementById('ean').value.trim();
    const nom = document.getElementById('product-name').value.trim();
    const categorie = document.getElementById('categorie').value;
    const etat = document.getElementById('etat').value;
    const prixRevente = parseFloat(document.getElementById('prix-revente').value) || 0;
    const qFba = parseInt(document.getElementById('qte-fba')?.value) || 0;
    const qFbm = parseInt(document.getElementById('qte-fbm')?.value) || 0;
    const qEnt = parseInt(document.getElementById('qte-entrepot')?.value) || 0;
    const totalQte = qFba + qFbm + qEnt;

    // Validation : toast + focus et surbrillance du champ fautif
    if (!ean) return champManquant('ean', 'Champ requis', "L'EAN est obligatoire.");
    if (!nom) return champManquant('product-name', 'Champ requis', 'Le nom du produit est obligatoire.');
    if (!categorie) return champManquant('categorie', 'Champ requis', 'Veuillez sélectionner une catégorie.');
    if (!etat) return champManquant('etat', 'Champ requis', "Veuillez sélectionner l'état du produit.");
    if (totalQte <= 0) return champManquant('qte-entrepot', 'Quantité invalide', 'La quantité totale doit être supérieure à 0.');

    const pr = {
        ean,
        asin: (document.getElementById('asin')?.value || '').trim().toUpperCase(),
        nom,
        categorie,
        etat,
        etat_stock: document.getElementById('etat-stock').value,
        prix_achat: getPrixAchatTTC(),
        prix_revente: prixRevente,
        qte_fba: qFba, qte_fbm: qFbm, qte_entrepot: qEnt,
        quantite: totalQte,
        amazon_fba: document.getElementById('amazon_fba')?.checked || false,
        amazon_fbm: document.getElementById('amazon_fbm')?.checked || false,
        vinted: document.getElementById('vinted')?.checked || false,
        leboncoin: document.getElementById('leboncoin')?.checked || false,
        invendable: document.getElementById('etat-stock').value === 'rebut', vendu: false,
        photos: currentPhotos,
        notes: document.getElementById('notes').value.trim(),
        date_ajout: new Date().toISOString(),
    };
    pr.user_id = getEffectiveUserId();
    
    // Si on ajoute en occasion ou rebut → déduire du stock neuf
    if (pr.etat_stock === 'occasion' || pr.etat_stock === 'rebut') {
        const stockNeuf = products.filter(p => p.ean === pr.ean && !p.vendu && p.etat_stock === 'neuf');
        const stockNeufTotal = stockNeuf.reduce((s, p) => s + (p.qte_entrepot||0) + (p.qte_fba||0) + (p.qte_fbm||0), 0);
        let qteADeduire = totalQte;

        if (qteADeduire > stockNeufTotal) {
            const manque = qteADeduire - stockNeufTotal;
            const msg = stockNeufTotal === 0
                ? `❌ Aucun stock neuf disponible pour l'EAN ${pr.ean}.\n\nImpossible de créer ${totalQte} unité(s) en ${pr.etat_stock} sans stock neuf source.`
                : `⚠️ Stock neuf insuffisant pour l'EAN ${pr.ean}.\n\nStock neuf disponible : ${stockNeufTotal} unité(s)\nQuantité demandée : ${totalQte} unité(s)\nManque : ${manque} unité(s)\n\nVoulez-vous créer quand même (hors conversion) ?`;
            if (stockNeufTotal === 0 || !await srConfirm(msg, 'Confirmer la création', false)) return;
            qteADeduire = stockNeufTotal; // ne déduire que ce qui existe
        }

        for (const sn of stockNeuf) {
            if (qteADeduire <= 0) break;
            const snTotal = (sn.qte_entrepot || 0) + (sn.qte_fba || 0) + (sn.qte_fbm || 0);

            if (snTotal <= qteADeduire) {
                await sb.from('produits').update({
                    qte_entrepot: 0, qte_fba: 0, qte_fbm: 0, quantite: 0, vendu: true,
                    notes: (sn.notes || '') + ' [Transféré en ' + pr.etat_stock + ']'
                }).eq('id', sn.id);
                qteADeduire -= snTotal;
            } else {
                let reste = qteADeduire;
                let newEnt = sn.qte_entrepot || 0;
                let newFbm = sn.qte_fbm || 0;
                let newFba = sn.qte_fba || 0;
                const deductEnt = Math.min(reste, newEnt); newEnt -= deductEnt; reste -= deductEnt;
                const deductFbm = Math.min(reste, newFbm); newFbm -= deductFbm; reste -= deductFbm;
                const deductFba = Math.min(reste, newFba); newFba -= deductFba;
                await sb.from('produits').update({
                    qte_entrepot: newEnt, qte_fbm: newFbm, qte_fba: newFba,
                    quantite: newEnt + newFbm + newFba
                }).eq('id', sn.id);
                qteADeduire = 0;
            }
        }
    }
    
    const { error } = await sb.from('produits').insert([pr]).select();
    if (error) return toastError('Erreur', error.message);
    showSuccess('success-message');
    this.reset();
    document.getElementById('info-achat').style.display = 'none';
    document.getElementById('marge-display').style.display = 'none';
    document.getElementById('prix-achat-conv').style.display = 'none';
    document.getElementById('prix-type-ht').checked = true;
    document.getElementById('total-qte-display').textContent = 'Total : 0 unités';
    currentPhotos = [];
    displayPhotos();
    // Prêt pour le produit suivant : mémoire du scanner effacée, focus sur l'EAN
    lastScannedEAN = '';
    document.getElementById('ean')?.focus();
    await loadProducts();
});

// ═══════ STOCK DISPLAY ═══════
function switchStockView(view) {
    activeStockView = view;
    stockCurrentPage = 1;
    document.querySelectorAll('.stock-pill').forEach(p => p.classList.toggle('active', p.dataset.stock === view));
    displayStock();
}

function stockGoPage(p) {
    const list = getFilteredStock();
    const total = Math.max(1, Math.ceil(list.length / stockPerPage));
    if (p < 1 || p > total) return;
    stockCurrentPage = p;
    displayStock();
}

function stockChangePerPage() {
    const sel = document.getElementById('stock-per-page');
    if (sel) stockPerPage = parseInt(sel.value);
    stockCurrentPage = 1;
    displayStock();
}

function getFilteredStock() {
    const search = (document.getElementById('stock-search')?.value || '').trim().toLowerCase();
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
    else if (activeStockView === 'fba_attente') list = list.filter(p => p.fba_attente === true || (p.statut || '') === 'fba_attente');
    else if (activeStockView === 'fba') list = list.filter(p => (p.qte_fba || 0) > 0 && !p.invendable);
    else if (activeStockView === 'fbm') list = list.filter(p => (p.qte_fbm || 0) > 0 && !p.invendable);
    else if (activeStockView === 'vinted_stock') list = list.filter(p => p.vinted === true && !p.invendable);
    else if (activeStockView === 'rebut') list = list.filter(p => (p.etat_stock || '') === 'rebut' || p.invendable);

    // Recherche étendue (nom, EAN, catégorie, notes, fournisseur)
    if (search) {
        list = list.filter(p => 
            (p.nom||'').toLowerCase().includes(search) || 
            (p.ean||'').toLowerCase().includes(search) ||
            (p.asin||'').toLowerCase().includes(search) ||
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
    else if (emplacement === 'fba_attente') list = list.filter(p => p.fba_attente === true || (p.statut || '') === 'fba_attente');
    else if (emplacement === 'fba') list = list.filter(p => (p.qte_fba || 0) > 0);
    else if (emplacement === 'fbm') list = list.filter(p => (p.qte_fbm || 0) > 0);
    else if (emplacement === 'vinted') list = list.filter(p => p.vinted === true);

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
// Tout changement de recherche / tri / filtre ramene en page 1 :
// sinon on reste au milieu des resultats d'une recherche qu'on vient de lancer.
function stockApplyFilters() {
    stockCurrentPage = 1;
    displayStock();
}

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
    const tri = document.getElementById('stock-sort');
    if (tri) tri.value = 'date-desc';
    stockCurrentPage = 1;
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
        cats.forEach(cat => catSel.innerHTML += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`);
        catSel.value = cur;
    }

    // Populate fournisseurs
    const fournSel = document.getElementById('stock-filter-fournisseur');
    if (fournSel) {
        const fNames = [...new Set(achats.map(a => a.fournisseur_nom).filter(Boolean))];
        const cur = fournSel.value;
        fournSel.innerHTML = '<option value="">Tous</option>';
        fNames.forEach(f => fournSel.innerHTML += `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`);
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

    // — Pagination —
    const totalItems = list.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / stockPerPage));
    if (stockCurrentPage > totalPages) stockCurrentPage = totalPages;
    const startIdx = (stockCurrentPage - 1) * stockPerPage;
    const pageList = list.slice(startIdx, startIdx + stockPerPage);

    const showFbaFbm = ['neuf','all','fba','fbm','fba_attente'].includes(activeStockView);
    let h = `<div id="stock-selection-bar" style="margin-bottom:10px;display:none;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="scan-button" style="padding:6px 14px;font-size:13px;background:#3498db;" onclick="openBulkTransfert()">🔄 Transférer la sélection</button>
        <span id="stock-selected-count" style="font-size:13px;color:var(--text-secondary);"></span>
    </div>`;
    h += '<div class="products-table"><table><thead><tr><th style="width:30px;"><input type="checkbox" id="stock-select-all" onchange="toggleAllStock(this.checked)" title="Tout sélectionner"></th><th>Date</th><th>EAN</th><th>Produit</th><th>Cat.</th><th>Type</th>';
    if (showFbaFbm) h += '<th>FBA</th><th>FBM</th>';
    h += '<th>Entrep.</th><th>Total</th><th>Achat</th><th>Revente</th><th>Marge</th><th>Actions</th></tr></thead><tbody>';

    pageList.forEach(p => {
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

        if ((p.seuil_stock || 0) > 0 && (p.quantite || 0) <= (p.seuil_stock || 0)) {
            riskBadge += (p.quantite || 0) === 0 ? ' <span class="alert-critique">🔴</span>' : ' <span class="alert-bas">🟠</span>';
        }

        let margeDisplay = '-';
        if (marge !== null) {
            const margeColor = marge >= 30 ? 'var(--success)' : marge >= 10 ? 'var(--warning)' : 'var(--danger)';
            margeDisplay = `<span style="color:${margeColor};font-weight:700;">${marge.toFixed(0)}%</span>`;
        }

        h += `<tr style="cursor:pointer" onclick="openProductModal(${p.id})">
            <td onclick="event.stopPropagation()"><input type="checkbox" class="stock-check" data-id="${p.id}" onchange="updateStockSelection()"></td>
            <td>${date}${riskBadge}</td>
            <td>${escapeHtml(p.ean||'')}</td>
            <td><strong>${escapeHtml(p.nom||'')}</strong></td>
            <td>${escapeHtml(p.categorie||'-')}</td>
            <td>${typeBadge}</td>`;
        if (showFbaFbm) h += `<td>${p.qte_fba||0}</td><td>${p.qte_fbm||0}</td>`;
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
    h += '</tbody></table></div>';

    // — Barre de pagination —
    const from = startIdx + 1;
    const to = Math.min(startIdx + stockPerPage, totalItems);

    let pageButtons = `<button class="page-btn" onclick="stockGoPage(${stockCurrentPage - 1})" ${stockCurrentPage === 1 ? 'disabled' : ''}>‹</button>`;
    let pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= stockCurrentPage - 1 && i <= stockCurrentPage + 1)) pages.push(i);
        else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    pages.forEach(pg => {
        if (pg === '…') pageButtons += `<span class="page-btn" style="cursor:default;border:none">…</span>`;
        else pageButtons += `<button class="page-btn ${pg === stockCurrentPage ? 'active' : ''}" onclick="stockGoPage(${pg})">${pg}</button>`;
    });
    pageButtons += `<button class="page-btn" onclick="stockGoPage(${stockCurrentPage + 1})" ${stockCurrentPage === totalPages ? 'disabled' : ''}>›</button>`;

    h += `<div class="pagination-bar">
        <div class="pagination-info">${from}–${to} sur ${totalItems} produits</div>
        <div class="pagination-controls">${pageButtons}</div>
        <div class="per-page-wrap">
            <span class="per-page-label">Lignes par page :</span>
            <select class="per-page-select" id="stock-per-page" onchange="stockChangePerPage()">
                <option value="25" ${stockPerPage === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${stockPerPage === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${stockPerPage === 100 ? 'selected' : ''}>100</option>
            </select>
        </div>
    </div>`;

    c.innerHTML = h;
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
        <p style="color:var(--text-secondary);margin-bottom:20px;">EAN: ${escapeHtml(p.ean||'-')}${p.asin ? ' / ASIN: ' + escapeHtml(p.asin) : ''} · ${typeBadge}</p>
        
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
                        <option value="Livres" ${p.categorie==='Livres'?'selected':''}>Livres</option>
                        <option value="Auto" ${p.categorie==='Auto'?'selected':''}>Auto</option>
                        <option value="Bricolage" ${p.categorie==='Bricolage'?'selected':''}>Bricolage</option>
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
                    <input type="number" min="0" id="edit-qte-fba-${p.id}" value="${p.qte_fba||0}" style="width:70px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--text-color);padding:8px;">
                    <div class="qte-label">Amazon FBA</div>
                </div>
                <div class="qte-card" style="border-top:3px solid #3f51b5;">
                    <input type="number" min="0" id="edit-qte-fbm-${p.id}" value="${p.qte_fbm||0}" style="width:70px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--text-color);padding:8px;">
                    <div class="qte-label">Amazon FBM</div>
                </div>
                <div class="qte-card" style="border-top:3px solid #9c27b0;">
                    <input type="number" min="0" id="edit-qte-entrepot-${p.id}" value="${p.qte_entrepot||0}" style="width:70px;text-align:center;font-size:24px;font-weight:700;border:2px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--text-color);padding:8px;">
                    <div class="qte-label">Entrepôt</div>
                </div>
            </div>
            <h3 style="margin:20px 0 10px;">🛒 Canaux de vente</h3>
            <div style="display:flex;gap:15px;flex-wrap:wrap;margin-bottom:15px;">
                <label><input type="checkbox" id="edit-amazon-fba-${p.id}" ${p.amazon_fba?'checked':''}> Amazon FBA</label>
                <label><input type="checkbox" id="edit-amazon-fbm-${p.id}" ${p.amazon_fbm?'checked':''}> Amazon FBM</label>
                <label><input type="checkbox" id="edit-fba-attente-${p.id}" ${p.fba_attente?'checked':''}> ⏳ FBA en attente</label>
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
            <button class="scan-button" style="background:#3498db;" onclick="openTransfertModal(${p.id}); closeProductModal();">🔄 Transférer</button>
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
    const qFba = parseInt(document.getElementById('edit-qte-fba-' + id)?.value) || 0;
    const qFbm = parseInt(document.getElementById('edit-qte-fbm-' + id)?.value) || 0;
    const qEnt = parseInt(document.getElementById('edit-qte-entrepot-' + id)?.value) || 0;
    const totalQte = qFba + qFbm + qEnt;

    const update = {
        categorie: document.getElementById('edit-categorie-' + id)?.value || '',
        etat_stock: document.getElementById('edit-etat-stock-' + id)?.value || 'neuf',
        prix_achat: parseFloat(document.getElementById('edit-prix-achat-' + id)?.value) || 0,
        prix_revente: parseFloat(document.getElementById('edit-prix-revente-' + id)?.value) || 0,
        qte_fba: qFba,
        qte_fbm: qFbm,
        qte_entrepot: qEnt,
        quantite: totalQte,
        amazon_fba: document.getElementById('edit-amazon-fba-' + id)?.checked || false,
        amazon_fbm: document.getElementById('edit-amazon-fbm-' + id)?.checked || false,
        fba_attente: document.getElementById('edit-fba-attente-' + id)?.checked || false,
        vinted: document.getElementById('edit-vinted-' + id)?.checked || false,
        leboncoin: document.getElementById('edit-leboncoin-' + id)?.checked || false,
        invendable: (document.getElementById('edit-etat-stock-' + id)?.value || '') === 'rebut',
        notes: document.getElementById('edit-notes-' + id)?.value?.trim() || '',
        emplacement: document.getElementById('edit-emplacement-' + id)?.value?.trim() || '',
        seuil_stock: parseInt(document.getElementById('edit-seuil-' + id)?.value) || 0,
    };

    console.log('Saving product', id, 'update:', update);
    const { error } = await sb.from('produits').update(update).eq('id', id);
    if (error) { console.error('Save error:', error); return toastError('Erreur', error.message); }
    
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
    
    // Product info
    const info = document.getElementById('vente-product-info');
    if (info) {
        info.innerHTML = `<strong>${escapeHtml(p.nom)}</strong><br>
            <span style="color:var(--text-secondary);">EAN: ${escapeHtml(p.ean||'-')} · Stock: <strong>${p.quantite||0}</strong> (FBA: ${p.qte_fba||0} · FBM: ${p.qte_fbm||0} · Entrepôt: ${p.qte_entrepot||0}) · Prix achat: ${(p.prix_achat||0).toFixed(2)}€</span>`;
    }
    
    document.getElementById('vente-prix').value = (p.prix_revente || 0).toFixed(2);
    document.getElementById('vente-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('vente-qte').value = 1;
    document.getElementById('vente-qte').max = p.quantite || 1;
    document.getElementById('vente-plateforme').value = '';
    if (p.amazon_fba && !p.amazon_fbm) document.getElementById('vente-plateforme').value = 'Amazon FBA';
    else if (p.amazon_fbm && !p.amazon_fba) document.getElementById('vente-plateforme').value = 'Amazon FBM';
    
    updateVenteTotal();
    document.getElementById('vente-modal').style.display = 'block';
}

function updateVenteTotal() {
    const prix = parseFloat(document.getElementById('vente-prix')?.value) || 0;
    const qte = parseInt(document.getElementById('vente-qte')?.value) || 1;
    const frais = parseFloat(document.getElementById('vente-frais')?.value) || 0;
    const total = prix * qte;
    const p = products.find(x => x.id === currentVenteProductId);
    const marge = p ? (total - (p.prix_achat || 0) * qte - frais) : 0;
    const margeColor = marge > 0 ? 'var(--success)' : marge < 0 ? 'var(--danger)' : 'var(--text-secondary)';
    const disp = document.getElementById('vente-total-display');
    if (disp) disp.innerHTML = `Total : <strong>${total.toFixed(2)}€</strong> · Frais : ${frais.toFixed(2)}€ · <span style="color:${margeColor};">Bénéfice net : ${marge >= 0 ? '+' : ''}${marge.toFixed(2)}€</span>`;
}

// Remove old listeners (replaced by oninput in HTML)
function closeVenteModal() { document.getElementById('vente-modal').style.display = 'none'; currentVenteProductId = null; }

document.getElementById('vente-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentVenteProductId) return;
    const p = products.find(x => x.id === currentVenteProductId);
    if (!p) return;
    const prixVente = parseFloat(document.getElementById('vente-prix').value);
    const qteVendue = parseInt(document.getElementById('vente-qte').value) || 1;
    const canal = document.getElementById('vente-plateforme').value;
    const dateVente = document.getElementById('vente-date').value;
    const frais = parseFloat(document.getElementById('vente-frais')?.value) || 0;
    const notesVente = document.getElementById('vente-notes')?.value?.trim() || '';
    if (isNaN(prixVente) || prixVente <= 0) return toastError('Prix invalide', 'Le prix de vente doit être supérieur à 0.');

    // Validation : quantité vendue ne peut pas dépasser le stock du canal choisi
    const stockCanal = canal === 'Amazon FBA' ? (p.qte_fba || 0)
        : canal === 'Amazon FBM' ? (p.qte_fbm || 0)
        : (p.qte_entrepot || 0);

    if (qteVendue > stockCanal) {
        return toastError("Stock insuffisant", `Quantité demandée: ${qteVendue} · Stock ${canal}: ${stockCanal}`) && undefined;
    }
    if (qteVendue > (p.quantite || 0)) {
        return toastError("Quantité invalide", `Vendue: ${qteVendue} · Stock total: ${p.quantite||0}`) && undefined;
    }

    // 1. Insérer dans la table ventes
    const venteRecord = {
        user_id: getEffectiveUserId(),
        produit_id: p.id,
        produit_ean: p.ean || '',
        produit_nom: p.nom || '',
        canal: canal || 'Autre',
        quantite: qteVendue,
        prix_unitaire: prixVente,
        prix_total: parseFloat((prixVente * qteVendue).toFixed(2)),
        prix_achat_unitaire: p.prix_achat || 0,
        frais: frais,
        benefice: parseFloat(((prixVente - (p.prix_achat || 0)) * qteVendue - frais).toFixed(2)),
        date_vente: dateVente,
        notes: notesVente,
    };
    const { error: venteError } = await sb.from('ventes').insert([venteRecord]);
    if (venteError) return toastError('Erreur vente', venteError.message);

    // 2. Mettre à jour le stock produit
    const newFba = canal === 'Amazon FBA' ? Math.max(0, (p.qte_fba || 0) - qteVendue) : (p.qte_fba || 0);
    const newFbm = canal === 'Amazon FBM' ? Math.max(0, (p.qte_fbm || 0) - qteVendue) : (p.qte_fbm || 0);
    const newEnt = (canal !== 'Amazon FBA' && canal !== 'Amazon FBM') ? Math.max(0, (p.qte_entrepot || 0) - qteVendue) : (p.qte_entrepot || 0);
    const newTotal = newFba + newFbm + newEnt;

    const stockUpdate = {
        qte_fba: newFba, qte_fbm: newFbm, qte_entrepot: newEnt,
        quantite: newTotal,
        vendu: newTotal <= 0,
        // Garder le dernier prix/date/canal pour compatibilité dashboard existant
        prix_vente_reel: prixVente,
        date_vente: dateVente,
        plateforme_vente: canal,
    };
    const { error: stockError } = await sb.from('produits').update(stockUpdate).eq('id', currentVenteProductId);
    if (stockError) return toastError('Erreur stock', stockError.message);

    // 3. Journaliser le mouvement
    await logMouvement(currentVenteProductId, 'vente', qteVendue, canal || 'entrepot', 'vendu', `Vente ${canal} — ${prixVente}€/u`, notesVente);

    closeVenteModal();
    await Promise.all([loadProducts(), loadVentes()]);
    updateDashboard();
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
    navigator.clipboard.writeText(t).then(() => toastSuccess('Copié !', 'Le texte a été copié dans le presse-papiers.')).catch(() => {
        const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toastSuccess('Copié !', 'Texte copié.');
    });
}

window.onclick = e => {
    if (e.target === document.getElementById('product-modal')) closeProductModal();
    if (e.target === document.getElementById('vente-modal')) closeVenteModal();
    if (e.target === document.getElementById('annonce-modal')) closeAnnonceModal();
    if (e.target === document.getElementById('fournisseur-modal')) closeFournisseurModal();
    if (e.target === document.getElementById('bulk-transfert-modal')) closeBulkTransfert();
};

// ═══════ DELETE PRODUCT ═══════
async function deleteProduct(id) {
    const p = products.find(x => x.id === id);
    if (!await srConfirm(`Supprimer "${p?.nom || 'ce produit'}" du stock ?\n\nCette action est irréversible.`, 'Supprimer le produit', true)) return;
    await sb.from('produits').delete().eq('id', id);
    await loadProducts();
    toastSuccess('Produit supprimé');
}

// ═══════ IMPORT GROSSISTE ═══════
let grossisteImportEnCours = false;

// Retourne la ligne de stock neuf active correspondant à cet EAN (ou null)
function grossisteProduitExistant(ean) {
    const e = String(ean || '').trim().toUpperCase();
    if (!e) return null;
    return products.find(p => !p.vendu && !p.invendable
        && (p.etat_stock || 'neuf') === 'neuf'
        && String(p.ean || '').toUpperCase() === e) || null;
}

// Coefficient TVA saisi dans le panneau (20 % par défaut)
function grossisteCoefTva() {
    const t = parseFloat(document.getElementById('grossiste-tva')?.value);
    return 1 + ((isNaN(t) || t < 0) ? 20 : t) / 100;
}

function grossistePrixEstHT() {
    return document.getElementById('grossiste-prix-ttc')?.checked !== true;
}

function previewGrossisteImport(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('grossiste-file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            cancelGrossisteImport(true);
            document.getElementById('grossiste-file-name').textContent = file.name;
            let rows = [];
            if (file.name.endsWith('.csv')) {
                rows = parseCSV(e.target.result);
            } else {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                rows = XLSX.utils.sheet_to_json(sheet);
            }
            if (!rows.length) return toastError('Fichier vide', 'Le fichier ne contient aucune donnée.');

            // Auto-map columns — l'ASIN a désormais sa propre colonne
            const cols = Object.keys(rows[0]);
            const findCol = (keywords) => cols.find(c => keywords.some(k => c.toLowerCase().includes(k)));
            const colAsin = findCol(['asin']);
            const colEan = cols.find(c => ['ean', 'gtin', 'barr', 'upc'].some(k => c.toLowerCase().includes(k)))
                        || cols.find(c => c.toLowerCase().includes('code') && c !== colAsin);
            const colNom = findCol(['nom', 'name', 'title', 'titre', 'produit', 'designation', 'description', 'libelle']);
            const colPrix = findCol(['prix', 'price', 'ht', 'ttc', 'cost', 'cout', 'tarif', 'ppc']);
            const colQte = findCol(['qte', 'quantit', 'qty', 'nb', 'nombre']);
            const colCat = findCol(['cat', 'categor', 'type', 'rayon']);

            if (!colNom && !colEan && !colAsin) return toastError('Colonnes non détectées', 'Impossible de détecter les colonnes. Vérifiez que le fichier contient EAN, ASIN ou Nom.');

            grossisteData = rows.map(r => {
                const ean = String(colEan ? (r[colEan] ?? '') : '').trim();
                const asin = String(colAsin ? (r[colAsin] ?? '') : '').trim().toUpperCase();
                return {
                    ean: ean || asin,          // repli : sans colonne EAN, on utilise l'ASIN comme code
                    eanManquant: !ean && !!asin,
                    asin: asin,
                    nom: String(colNom ? (r[colNom] ?? '') : '').trim(),
                    prix: parseMontantFR(colPrix ? r[colPrix] : 0),
                    quantite: parseInt(r[colQte]) || 1,
                    categorie: String(colCat ? (r[colCat] ?? '') : '').trim(),
                };
            }).filter(r => r.nom || r.ean);

            if (!grossisteData.length) return toastError('Aucune ligne exploitable', 'Aucune ligne ne contient de nom ni de code produit.');

            const dateEl = document.getElementById('grossiste-date');
            if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];

            displayGrossistePreview();
            document.getElementById('grossiste-preview').style.display = 'block';
        } catch (err) { cancelGrossisteImport(true); toastError('Erreur lecture', err.message); }
    };
    if (file.name.endsWith('.csv')) reader.readAsText(file, 'UTF-8');
    else reader.readAsBinaryString(file);
}

function displayGrossistePreview() {
    if (!grossisteData || !grossisteData.length) return;
    const estHT = grossistePrixEstHT();
    const coef = grossisteCoefTva();
    const emplacement = document.getElementById('grossiste-emplacement')?.value || 'entrepot';
    const labelEmp = emplacement === 'fba' ? 'FBA' : emplacement === 'fbm' ? 'FBM' : 'entrepôt';

    let nbFusion = 0, nbNouveau = 0, nbSansEan = 0, totalHT = 0, totalTTC = 0, totalQte = 0;
    const vus = new Set();

    const lignes = grossisteData.map(r => {
        const ttc = estHT ? r.prix * coef : r.prix;
        const ht  = estHT ? r.prix : r.prix / coef;
        const qte = r.quantite || 1;
        const exist = grossisteProduitExistant(r.ean);
        const cle = String(r.ean || r.nom).toUpperCase();
        if (!vus.has(cle)) {
            vus.add(cle);
            if (exist) nbFusion++; else nbNouveau++;
        }
        if (r.eanManquant) nbSansEan++;
        totalHT += ht * qte; totalTTC += ttc * qte; totalQte += qte;
        return { r, ht, ttc, qte, exist };
    });

    const pill = (txt, bg, col) => `<span style="display:inline-block;background:${bg};color:${col};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;margin-right:8px;">${txt}</span>`;
    let resume = pill(`${grossisteData.length} ligne(s)`, 'rgba(52,152,219,.15)', '#2a5d8f')
        + pill(`${totalQte} unité(s) → ${labelEmp}`, 'rgba(39,174,96,.15)', '#1e7a45')
        + pill(`${nbNouveau} nouveau(x) produit(s)`, 'rgba(39,174,96,.15)', '#1e7a45')
        + pill(`${nbFusion} déjà en stock (incrémenté + PMP)`, 'rgba(243,156,18,.18)', '#9a6100')
        + pill(`${totalHT.toFixed(2)}€ HT · ${totalTTC.toFixed(2)}€ TTC`, 'rgba(0,0,0,.06)', 'var(--text-secondary)');
    if (nbSansEan) resume += pill(`⚠️ ${nbSansEan} ligne(s) sans EAN — ASIN utilisé comme code`, 'rgba(231,76,60,.15)', '#b4342b');
    document.getElementById('grossiste-resume').innerHTML = resume;

    let h = '<div class="products-table"><table><thead><tr><th>EAN</th><th>ASIN</th><th>Nom</th><th>Prix HT</th><th>Prix TTC</th><th>Qté</th><th>Catégorie</th><th>Stock actuel</th></tr></thead><tbody>';
    lignes.slice(0, 50).forEach(l => {
        const badge = l.exist
            ? `<span style="color:#9a6100;font-weight:700;">↻ ${l.exist.quantite || 0} u.</span>`
            : '<span style="color:#1e7a45;font-weight:700;">+ nouveau</span>';
        h += `<tr><td>${escapeHtml(l.r.ean)}${l.r.eanManquant ? ' <span style="color:#b4342b;" title="Aucune colonne EAN — ASIN utilisé">⚠️</span>' : ''}</td><td>${escapeHtml(l.r.asin || '-')}</td><td>${escapeHtml(l.r.nom)}</td><td>${l.ht.toFixed(2)}€</td><td>${l.ttc.toFixed(2)}€</td><td>${l.qte}</td><td>${escapeHtml(l.r.categorie)}</td><td>${badge}</td></tr>`;
    });
    if (lignes.length > 50) h += `<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">... et ${lignes.length - 50} de plus</td></tr>`;
    h += '</tbody></table></div>';
    document.getElementById('grossiste-preview-table').innerHTML = h;
    document.getElementById('grossiste-count').textContent = grossisteData.length;
}

async function quickAddFournisseurGrossiste() {
    const nom = prompt('Nom du nouveau fournisseur :');
    if (!nom || !nom.trim()) return;
    const { data, error } = await sb.from('fournisseurs').insert([{ nom: nom.trim(), user_id: getEffectiveUserId() }]).select();
    if (error) return toastError('Erreur', error.message);
    toastSuccess('Fournisseur créé', nom.trim());
    await loadFournisseurs();
    if (data && data[0]) document.getElementById('grossiste-fournisseur').value = data[0].id;
}

async function confirmGrossisteImport() {
    if (!grossisteData || !grossisteData.length) return;
    if (grossisteImportEnCours) return toastWarning('Import en cours', 'Patientez, les lignes sont en train d\'être enregistrées…');

    const emplacement = document.getElementById('grossiste-emplacement').value;
    const fId = document.getElementById('grossiste-fournisseur')?.value || '';
    const fObj = fournisseurs.find(f => String(f.id) === String(fId));
    const dateAchat = document.getElementById('grossiste-date')?.value || new Date().toISOString().split('T')[0];
    const estHT = grossistePrixEstHT();
    const coef = grossisteCoefTva();
    const tauxTva = ((coef - 1) * 100).toFixed(coef * 100 % 1 === 0 ? 0 : 1);

    if (!fId && !await srConfirm("Aucun fournisseur sélectionné.\n\nLes achats seront créés sans fournisseur, et le filtre par fournisseur ne les retrouvera pas.\n\nContinuer quand même ?", 'Fournisseur manquant')) return;

    const champ = emplacement === 'fba' ? 'qte_fba' : emplacement === 'fbm' ? 'qte_fbm' : 'qte_entrepot';
    const labelEmp = emplacement === 'fba' ? 'FBA' : emplacement === 'fbm' ? 'FBM' : 'entrepôt';

    // ── 1. Résolution : une entrée par référence, une ligne d'achat par ligne du fichier
    const cibles = new Map();
    const aCreer = [];
    const lignes = [];

    grossisteData.forEach(r => {
        const qte = r.quantite || 1;
        const prixTTC = +((estHT ? r.prix * coef : r.prix)).toFixed(2);
        const prixHT  = +((estHT ? r.prix : r.prix / coef)).toFixed(2);
        const cle = String(r.ean || r.nom || '').toUpperCase();

        let t = cibles.get(cle);
        if (!t) {
            const exist = grossisteProduitExistant(r.ean);
            t = {
                existantId: exist ? exist.id : null,
                qteCanalBase: exist ? (exist[champ] || 0) : 0,
                stockBase: exist ? (exist.quantite || 0) : 0,
                paBase: exist ? (exist.prix_achat || 0) : 0,
                qteAjoutee: 0, valeurAjoutee: 0,
                creerIndex: null, modele: r, produitId: null,
            };
            if (!exist) { t.creerIndex = aCreer.length; aCreer.push(null); }
            cibles.set(cle, t);
        }
        t.qteAjoutee += qte;
        t.valeurAjoutee += prixTTC * qte;
        lignes.push({ r, cle, qte, prixHT, prixTTC });
    });

    const nbFusion = [...cibles.values()].filter(t => t.creerIndex === null).length;
    const nbNouveau = aCreer.length;

    const msg = `Importer ${lignes.length} ligne(s) ?\n\n`
        + `• ${lignes.length} achat(s) créé(s) et marqué(s) reçus${fObj ? ' — fournisseur : ' + fObj.nom : ''}\n`
        + `• ${nbNouveau} nouveau(x) produit(s) en ${labelEmp}\n`
        + `• ${nbFusion} produit(s) déjà en stock : quantité ajoutée et prix d'achat recalculé en moyenne pondérée\n`
        + `• Prix du fichier lus en ${estHT ? 'HT' : 'TTC'} (TVA ${tauxTva} %)`;
    if (!await srConfirm(msg, 'Importer la commande grossiste')) return;

    grossisteImportEnCours = true;
    const btn = document.getElementById('grossiste-import-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '⏳ Import en cours…'; }

    try {
        const uid = getEffectiveUserId();

        // ── 2. Créer les nouveaux produits (par lots de 100)
        cibles.forEach(t => {
            if (t.creerIndex === null) return;
            const r = t.modele;
            aCreer[t.creerIndex] = {
                user_id: uid,
                ean: r.ean, asin: r.asin || '', nom: r.nom, categorie: r.categorie || '',
                etat: 'Neuf', etat_stock: 'neuf', statut: 'recu', emplacement: '',
                prix_achat: t.qteAjoutee > 0 ? +(t.valeurAjoutee / t.qteAjoutee).toFixed(2) : 0,
                prix_revente: 0,
                qte_fba: emplacement === 'fba' ? t.qteAjoutee : 0,
                qte_fbm: emplacement === 'fbm' ? t.qteAjoutee : 0,
                qte_entrepot: emplacement === 'entrepot' ? t.qteAjoutee : 0,
                quantite: t.qteAjoutee,
                amazon_fba: emplacement === 'fba', amazon_fbm: emplacement === 'fbm',
                vinted: false, leboncoin: false, invendable: false, vendu: false,
                photos: [],
                notes: fObj ? 'Import grossiste — ' + fObj.nom : 'Import grossiste',
                date_ajout: new Date().toISOString(),
            };
        });

        const idsCrees = [];
        for (let i = 0; i < aCreer.length; i += 100) {
            const { data, error } = await sb.from('produits').insert(aCreer.slice(i, i + 100)).select('id');
            if (error) throw new Error('Création des produits : ' + error.message);
            (data || []).forEach(p => idsCrees.push(p.id));
        }
        if (idsCrees.length !== aCreer.length) throw new Error(`Création incomplète : ${idsCrees.length}/${aCreer.length} produits créés. Aucun achat n'a été enregistré, relancez l'import.`);

        // ── 3. Incrémenter les produits existants + prix d'achat moyen pondéré
        let nbMaj = 0;
        for (const t of cibles.values()) {
            if (t.creerIndex !== null) { t.produitId = idsCrees[t.creerIndex]; continue; }
            t.produitId = t.existantId;
            const nouveauStock = t.stockBase + t.qteAjoutee;
            const pmp = nouveauStock > 0
                ? +(((t.stockBase * t.paBase) + t.valeurAjoutee) / nouveauStock).toFixed(2)
                : t.paBase;
            const upd = { prix_achat: pmp, quantite: nouveauStock, vendu: false };
            upd[champ] = t.qteCanalBase + t.qteAjoutee;
            if (emplacement === 'fba') upd.amazon_fba = true;
            if (emplacement === 'fbm') upd.amazon_fbm = true;
            const { error } = await sb.from('produits').update(upd).eq('id', t.existantId);
            if (error) throw new Error('Mise à jour du produit ' + (t.modele.nom || t.existantId) + ' : ' + error.message);
            nbMaj++;
        }

        // ── 4. Créer les achats, déjà reliés à leur produit
        const achatsBatch = lignes.map(l => ({
            user_id: uid,
            ean: l.r.ean, asin: l.r.asin || '', nom: l.r.nom, categorie: l.r.categorie || '',
            fournisseur_id: fId ? parseInt(fId) : null,
            fournisseur_nom: fObj ? fObj.nom : '',
            prix_ht: l.prixHT, prix_ttc: l.prixTTC,
            quantite: l.qte,
            date_achat: dateAchat,
            recu: true,
            produit_genere_id: cibles.get(l.cle).produitId,
            notes: 'Import grossiste',
        }));
        for (let i = 0; i < achatsBatch.length; i += 100) {
            const { error } = await sb.from('achats').insert(achatsBatch.slice(i, i + 100));
            if (error) throw new Error('Création des achats : ' + error.message + ' — le stock a bien été mis à jour, mais les lignes d\'achat sont incomplètes.');
        }

        // ── 5. Journaliser les réceptions
        const mvts = [...cibles.values()].map(t => ({
            user_id: uid, produit_id: t.produitId,
            produit_ean: t.modele.ean || '', produit_nom: t.modele.nom || '',
            type: 'reception', quantite: t.qteAjoutee,
            de_emplacement: 'achat', vers_emplacement: emplacement,
            raison: 'Import grossiste', notes: fObj ? fObj.nom : '',
        }));
        for (let i = 0; i < mvts.length; i += 100) {
            const { error } = await sb.from('mouvements').insert(mvts.slice(i, i + 100));
            if (error) console.warn('Log mouvements import grossiste:', error.message);
        }

        toastSuccess('Import réussi', `${achatsBatch.length} achat(s) · ${nbNouveau} nouveau(x) produit(s) · ${nbMaj} produit(s) incrémenté(s) en ${labelEmp}.`);
        cancelGrossisteImport();
        await Promise.all([loadProducts(), loadAchats(), loadMouvements()]);
        updateDashboard();
        switchTab('stock');
    } catch (e) {
        toastError('Erreur import', e.message);
    } finally {
        grossisteImportEnCours = false;
        const b = document.getElementById('grossiste-import-btn');
        if (b) { b.disabled = false; b.style.opacity = '1'; b.innerHTML = '✅ Importer <span id="grossiste-count">' + (grossisteData ? grossisteData.length : 0) + '</span> lignes'; }
    }
}

function cancelGrossisteImport(garderFichier) {
    grossisteData = null;
    document.getElementById('grossiste-preview').style.display = 'none';
    document.getElementById('grossiste-file-name').textContent = '';
    if (!garderFichier) document.getElementById('grossiste-file-input').value = '';
    const r = document.getElementById('grossiste-resume');
    if (r) r.innerHTML = '';
}

function parseCSV(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
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

// ═══════ IMPORT AMAZON (rapport de commandes) ═══════
let amazonImportData = null;

// Fichier plat Amazon : tabulations (ou ; / , pour un CSV)
function parseFlatFile(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
    const headers = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    return lines.slice(1).map(line => {
        const vals = line.split(sep).map(v => v.replace(/^"|"$/g, '').trim());
        const o = {};
        headers.forEach((h, i) => o[h] = vals[i] || '');
        return o;
    });
}

// Renvoie 'YYYY-MM-DD' en heure LOCALE, ou '' si la date est illisible.
// Avant : "08/31/2026" produisait "2026-31-08" (mois 31, refusé par Postgres),
// une date textuelle devenait la date du jour, et l'offset UTC décalait d'un jour.
function dateLocaleISO(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function normalizeDateAmz(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (!s) return '';

    // ISO, éventuellement horodaté : on repasse par Date pour appliquer l'offset
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        if (/[T ]\d{2}:/.test(s)) {
            const d = new Date(s);
            if (!isNaN(d)) return dateLocaleISO(d);
        }
        return s.split(/[T ]/)[0];
    }

    // jj/mm/aaaa ou mm/jj/aaaa — on lève l'ambiguïté avec la valeur du 1er groupe
    const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (m) {
        const a = parseInt(m[1]), b = parseInt(m[2]), annee = m[3];
        let jour, mois;
        if (a > 12 && b <= 12)      { jour = a; mois = b; }   // forcément jj/mm
        else if (b > 12 && a <= 12) { jour = b; mois = a; }   // forcément mm/jj (format US)
        else                        { jour = a; mois = b; }   // ambigu → jj/mm (rapports FR)
        if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return '';
        return `${annee}-${String(mois).padStart(2,'0')}-${String(jour).padStart(2,'0')}`;
    }

    const d = new Date(s);
    return isNaN(d) ? '' : dateLocaleISO(d);   // '' plutôt que la date du jour : la ligne sera signalée
}

function previewAmazonImport(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('amz-file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            cancelAmazonImport(true);   // repartir de zéro : un aperçu périmé se réimportait tel quel
            document.getElementById('amz-file-name').textContent = file.name;
            const rows = parseFlatFile(e.target.result);
            if (!rows.length) return toastError('Fichier vide', 'Le fichier ne contient aucune commande.');

            const cols = Object.keys(rows[0]);
            const findCol = (kws) => cols.find(c => kws.some(k => c.includes(k)));
            const cOrder = findCol(['amazon-order-id', 'order-id', 'commande']);
            const cItem = findCol(['order-item-id']);
            const cDate = findCol(['purchase-date', 'payments-date', 'date']);
            const cAsin = findCol(['asin']);
            const cSku = cols.find(c => c === 'sku' || c.endsWith('-sku') || c === 'seller-sku');
            const cName = findCol(['product-name', 'title', 'nom du produit']);
            const cQty = findCol(['quantity-purchased', 'quantity-shipped', 'quantity', 'quantit', 'qte']);
            const cPrice = findCol(['item-price', 'item price', 'prix', 'price']);
            // Le port facturé à l'acheteur est encaissé par le vendeur en FBM :
            // sans lui le CA est sous-évalué, alors que les frais Amazon portent sur le total.
            const cShip = cols.find(c => c.includes('shipping-price') || c === 'shipping price');
            const cChannel = findCol(['fulfillment-channel', 'canal']);
            const cStatus = findCol(['item-status', 'order-status', 'statut']);
            const cCurrency = findCol(['currency', 'devise']);

            if (!cOrder || !cQty || (!cAsin && !cSku)) {
                return toastError('Colonnes non reconnues', 'Le fichier doit contenir au minimum le n° de commande, la quantité et l\'ASIN (ou le SKU). Utilisez le rapport « Toutes les commandes » de Seller Central.');
            }

            // Commandes déjà importées (anti-doublon)
            const uid = getEffectiveUserId();
            const { data: existing } = await sb.from('ventes').select('amazon_order_id').eq('user_id', uid).neq('amazon_order_id', '');
            const dejaImporte = new Set((existing || []).map(v => v.amazon_order_id));

            const prixEstUnitaire = document.getElementById('amz-prix-unitaire')?.checked || false;
            const dateDu = document.getElementById('amz-date-du')?.value || '';
            const dateAu = document.getElementById('amz-date-au')?.value || '';

            // Pont ASIN → EAN via les achats (les achats ont souvent l'ASIN que les produits n'ont pas)
            const asinVersEan = {};
            achats.forEach(a => {
                if (a.asin && a.ean) asinVersEan[String(a.asin).toUpperCase()] = a.ean;
            });

            amazonImportData = rows.map(r => {
                const asin = (cAsin ? r[cAsin] : '').toUpperCase();
                const sku = cSku ? r[cSku] : '';
                const qte = parseInt(r[cQty]) || 0;
                const prixBrut = parseMontantFR(cPrice ? r[cPrice] : '');
                const portBrut = parseMontantFR(cShip ? r[cShip] : '');
                const status = (cStatus ? r[cStatus] : '').toLowerCase();
                const canalRaw = (cChannel ? r[cChannel] : '').toLowerCase();
                const canal = (canalRaw.includes('afn') || canalRaw.includes('amazon')) ? 'Amazon FBA' : 'Amazon FBM';
                const cle = r[cOrder] + '|' + ((cItem && r[cItem]) || asin || sku);

                // Rapprochement : ASIN d'abord, puis SKU = EAN ou SKU = ASIN
                let produit = products.find(x => !x.vendu && asin && (x.asin || '').toUpperCase() === asin)
                    || products.find(x => !x.vendu && sku && ((x.ean || '') === sku || (x.asin || '').toUpperCase() === sku.toUpperCase()))
                    || products.find(x => asin && (x.asin || '').toUpperCase() === asin);
                // Plan C : passer par les achats (ASIN → EAN → produit)
                if (!produit && asin && asinVersEan[asin]) {
                    const eanPont = asinVersEan[asin];
                    produit = products.find(x => !x.vendu && x.ean === eanPont)
                        || products.find(x => x.ean === eanPont);
                }

                const dateLigne = normalizeDateAmz(cDate ? r[cDate] : '');
                const devise = (cCurrency ? (r[cCurrency] || '') : '').toUpperCase();

                let etat = 'ok';
                if (status.includes('cancel') || status.includes('annul')) etat = 'annulee';
                else if (!dateLigne) etat = 'ignoree';        // date illisible : on n'invente plus la date du jour
                else if (qte <= 0 || prixBrut <= 0) etat = 'ignoree';
                else if (devise && devise !== 'EUR') etat = 'devise';
                else if ((dateDu && dateLigne < dateDu) || (dateAu && dateLigne > dateAu)) etat = 'hors_periode';
                else if (dejaImporte.has(cle)) etat = 'deja';
                else if (!produit) etat = 'introuvable';

                const totalLigne = prixEstUnitaire ? (prixBrut * (qte || 1) + portBrut) : (prixBrut + portBrut);
                const prixUnit = qte > 0 ? totalLigne / qte : totalLigne;
                return {
                    cle, orderId: cOrder ? r[cOrder] : '',
                    date: dateLigne,
                    asin, sku, nom: cName ? r[cName] : '',
                    qte, prixUnit, canal, etat, produit
                };
            });

            displayAmazonPreview();
        } catch (err) { cancelAmazonImport(true); toastError('Erreur lecture', err.message); }
    };
    reader.readAsText(file, 'UTF-8');
}

function displayAmazonPreview() {
    const list = amazonImportData || [];
    const compte = (etat) => list.filter(l => l.etat === etat).length;
    const nbOk = compte('ok');

    const badges = [
        ['✅ À importer', nbOk, '#27ae60'],
        ['⏭️ Déjà importées', compte('deja'), '#3498db'],
        ['❓ Introuvables dans le stock', compte('introuvable'), '#e67e22'],
        ['📅 Hors période', compte('hors_periode'), '#9b59b6'],
        ['💱 Devise non-EUR (ignorées)', compte('devise'), '#e74c3c'],
        ['🚫 Annulées', compte('annulee'), '#95a5a6'],
        ['➖ Ignorées (qté/prix à 0)', compte('ignoree'), '#95a5a6'],
    ];
    document.getElementById('amz-stats').innerHTML = badges
        .filter(b => b[1] > 0)
        .map(b => `<span style="background:${b[2]};color:white;padding:6px 12px;border-radius:10px;font-size:13px;font-weight:600;">${b[0]} : ${b[1]}</span>`)
        .join('');

    const etatBadge = {
        ok: '<span style="color:#27ae60;font-weight:700;">✅</span>',
        deja: '<span style="color:#3498db;">⏭️</span>',
        introuvable: '<span style="color:#e67e22;font-weight:700;">❓</span>',
        hors_periode: '<span style="color:#9b59b6;">📅</span>',
        devise: '<span style="color:#e74c3c;">💱</span>',
        annulee: '<span style="color:#95a5a6;">🚫</span>',
        ignoree: '<span style="color:#95a5a6;">➖</span>',
    };

    let h = '<div class="products-table"><table><thead><tr><th></th><th>Date</th><th>Commande</th><th>ASIN / SKU</th><th>Produit (rapport)</th><th>Correspondance stock</th><th>Canal</th><th>Qté</th><th>Prix unit.</th></tr></thead><tbody>';
    list.slice(0, 200).forEach(l => {
        h += `<tr style="${l.etat !== 'ok' ? 'opacity:0.55;' : ''}">
            <td>${etatBadge[l.etat] || ''}</td>
            <td>${l.date}</td>
            <td style="font-size:12px;">${escapeHtml(l.orderId)}</td>
            <td style="font-size:12px;">${escapeHtml(l.asin || l.sku || '-')}</td>
            <td style="font-size:12px;">${escapeHtml((l.nom || '').substring(0, 50))}</td>
            <td>${l.produit ? '<strong>' + escapeHtml(l.produit.nom) + '</strong>' : '<span style="color:#e67e22;">non trouvé</span>'}</td>
            <td>${l.canal === 'Amazon FBA' ? '📦 FBA' : '🏠 FBM'}</td>
            <td style="font-weight:700;">${l.qte}</td>
            <td>${l.prixUnit.toFixed(2)}€</td>
        </tr>`;
    });
    if (list.length > 200) h += `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);">... et ${list.length - 200} de plus</td></tr>`;
    h += '</tbody></table></div>';

    document.getElementById('amz-preview-table').innerHTML = h;
    document.getElementById('amz-count').textContent = nbOk;
    document.getElementById('amz-preview').style.display = 'block';
}

let amazonImportEnCours = false;

async function confirmAmazonImport() {
    if (amazonImportEnCours) return toastWarning('Import en cours', 'Patientez, les ventes sont en train d\'être enregistrées…');
    let lignes = (amazonImportData || []).filter(l => l.etat === 'ok' && l.produit);
    if (!lignes.length) return toastError('Rien à importer', 'Aucune ligne valide (vérifiez que vos produits ont bien leur ASIN renseigné).');

    const fraisPct = parseFloat(document.getElementById('amz-frais-pct')?.value) || 0;
    const msg = `Importer ${lignes.length} vente(s) Amazon ?\n\n- Le stock FBA/FBM sera décrémenté\n- Les ventes seront ajoutées à l'historique\n- Frais estimés : ${fraisPct}% du prix de vente\n\nL'import prend environ 1 seconde par vente — laissez la page ouverte jusqu'au message de fin.`;
    if (!await srConfirm(msg, 'Importer les ventes Amazon')) return;

    amazonImportEnCours = true;
    const btn = document.getElementById('amz-import-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

    try {
    // Re-vérifier les commandes déjà en base juste avant d'écrire (anti double-clic / autre appareil)
    const { data: existants } = await sb.from('ventes').select('amazon_order_id').eq('user_id', getEffectiveUserId()).neq('amazon_order_id', '');
    const dejaEnBase = new Set((existants || []).map(v => v.amazon_order_id));
    lignes = lignes.filter(l => !dejaEnBase.has(l.cle));
    if (!lignes.length) { toastInfo('Déjà importé', 'Toutes ces commandes sont déjà dans l\'historique.'); return; }

    let ok = 0, erreurs = 0, i = 0;
    for (const l of lignes) {
        i++;
        if (btn) btn.innerHTML = `⏳ Import en cours… ${i} / ${lignes.length}`;
        const p = l.produit;
        const prixUnit = parseFloat(l.prixUnit.toFixed(2));
        const prixTotal = parseFloat((prixUnit * l.qte).toFixed(2));
        const frais = parseFloat((prixTotal * fraisPct / 100).toFixed(2));

        const vente = {
            user_id: getEffectiveUserId(),
            produit_id: p.id,
            produit_ean: p.ean || '',
            produit_nom: p.nom || l.nom || '',
            canal: l.canal,
            quantite: l.qte,
            prix_unitaire: prixUnit,
            prix_total: prixTotal,
            prix_achat_unitaire: p.prix_achat || 0,
            frais: frais,
            benefice: parseFloat(((prixUnit - (p.prix_achat || 0)) * l.qte - frais).toFixed(2)),
            date_vente: l.date,
            notes: 'Import Amazon',
            amazon_order_id: l.cle,
        };
        const { error } = await sb.from('ventes').insert([vente]);
        if (error) { erreurs++; console.warn('Import vente:', error.message); continue; }

        const isFba = l.canal === 'Amazon FBA';
        const newFba = isFba ? Math.max(0, (p.qte_fba || 0) - l.qte) : (p.qte_fba || 0);
        const newFbm = !isFba ? Math.max(0, (p.qte_fbm || 0) - l.qte) : (p.qte_fbm || 0);
        const newTotal = newFba + newFbm + (p.qte_entrepot || 0);
        await sb.from('produits').update({
            qte_fba: newFba, qte_fbm: newFbm, quantite: newTotal,
            vendu: newTotal <= 0,
            prix_vente_reel: prixUnit, date_vente: l.date, plateforme_vente: l.canal,
        }).eq('id', p.id);
        // Mettre à jour l'objet local : plusieurs lignes peuvent concerner le même produit
        p.qte_fba = newFba; p.qte_fbm = newFbm; p.quantite = newTotal;

        await logMouvement(p.id, 'vente', l.qte, isFba ? 'fba' : 'fbm', 'vendu', 'Vente Amazon ' + l.orderId, '');
        ok++;
    }

    toastSuccess('Import terminé', `${ok} vente(s) importée(s)` + (erreurs ? ` · ${erreurs} erreur(s)` : ''));
    cancelAmazonImport();
    await Promise.all([loadProducts(), loadVentes(), loadMouvements()]);
    updateDashboard();
    if (ok > 0) switchTab('ventes');
    } finally {
        amazonImportEnCours = false;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '✅ Importer <span id="amz-count">0</span> vente(s)'; }
    }
}

function cancelAmazonImport(garderFichier) {
    amazonImportData = null;
    document.getElementById('amz-preview').style.display = 'none';
    document.getElementById('amz-file-name').textContent = '';
    if (!garderFichier) document.getElementById('amz-file-input').value = '';
}

// ═══════ PRÉCISION DES FRAIS (rapport de transactions Amazon) ═══════
let fraisImportData = null;
let fraisImportEnCours = false;

// CSV avec champs entre guillemets (les descriptions contiennent des virgules)
function parseCSVQuoted(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
            if (ch === '"') {
                if (text[i + 1] === '"') { cur += '"'; i++; }
                else inQ = false;
            } else cur += ch;
        } else {
            if (ch === '"') inQ = true;
            else if (ch === ',') { row.push(cur); cur = ''; }
            else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(cur); cur = '';
                if (row.length > 1 || (row[0] || '').trim() !== '') rows.push(row);
                row = [];
            } else cur += ch;
        }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
}

// Montants FR ("1 234,56") ET EN ("1,234.56"), espaces insécables et symboles inclus.
// Avant : .replace(',', '.') ne remplaçait que la PREMIÈRE virgule, donc
// "-1,234.56" devenait -1.234 — un frais de 1 234,56 € enregistré à 1,23 €.
function parseMontantFR(s) {
    if (s === null || s === undefined || s === '') return 0;
    if (typeof s === 'number') return isFinite(s) ? s : 0;
    let t = String(s).replace(/[\s\u00a0\u202f]/g, '').replace(/[\u20ac$\u00a3]/g, '').trim();
    if (!t) return 0;
    const negatif = /^\(.*\)$/.test(t);          // "(12,34)" = montant négatif en comptabilité
    if (negatif) t = t.slice(1, -1);
    const derVirgule = t.lastIndexOf(','), derPoint = t.lastIndexOf('.');
    if (derVirgule > -1 && derPoint > -1) {
        // Le séparateur décimal est le dernier des deux, l'autre sépare les milliers
        if (derVirgule > derPoint) t = t.replace(/\./g, '').replace(',', '.');
        else t = t.replace(/,/g, '');
    } else if (derVirgule > -1) {
        // Une seule virgule : décimale si 1 ou 2 chiffres derrière, sinon séparateur de milliers
        t = (t.length - derVirgule - 1) <= 2 ? t.replace(',', '.') : t.replace(/,/g, '');
    }
    const v = parseFloat(t);
    if (!isFinite(v)) return 0;
    return negatif ? -Math.abs(v) : v;
}

function previewFraisImport(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('frais-file-name').textContent = file.name;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            cancelFraisImport(true);
            document.getElementById('frais-file-name').textContent = file.name;
            const all = parseCSVQuoted(e.target.result);
            // Les rapports FR commencent par ~9 lignes d'explications avant l'en-tête
            const hIdx = all.findIndex(r => r.length > 5 && r.some(c => (c || '').toLowerCase().includes('date/heure') || (c || '').toLowerCase().includes('date/time')));
            if (hIdx === -1) return toastError('Format non reconnu', 'Utilisez le rapport « Transaction » de Seller Central (Paiements → Rapports de la plage de dates).');

            const headers = all[hIdx].map(h => (h || '').toLowerCase().trim());
            const col = (kws) => headers.findIndex(h => kws.some(k => h.includes(k)));
            const cType = col(['type']);
            const cOrder = col(['numéro de la commande', 'numero de la commande', 'order id']);
            const cSku = col(['sku']);
            const cQty = col(['quantité', 'quantite', 'quantity']);
            const cFraisVente = col(['frais de vente', 'selling fees']);
            // "expédié" ne matchait pas l'intitulé réel "frais d'expédition par amazon" :
            // toute la part FBA des frais était silencieusement omise.
            const cFraisFba = col(['expédition par amazon', 'expedition par amazon', 'expédié par amazon', 'expedie par amazon', 'fba fees', 'fba']);
            const cFraisAutres = col(['autres frais', 'other transaction']);
            const cTotal = col(['total']);
            if (cOrder === -1 || cType === -1 || cFraisVente === -1) {
                return toastError('Colonnes non trouvées', 'Le fichier ne ressemble pas au rapport de transactions Amazon.');
            }

            // Agréger les transactions par commande + SKU (une commande peut être expédiée en plusieurs fois)
            const transactions = {};
            let remboursements = 0, montantRemb = 0;
            for (let i = hIdx + 1; i < all.length; i++) {
                const r = all[i];
                if (r.length < headers.length - 3) continue;
                const type = (r[cType] || '').toLowerCase();
                const oid = (r[cOrder] || '').trim();
                if (type.includes('remboursement') || type.includes('refund')) {
                    remboursements++;
                    montantRemb += parseMontantFR(cTotal > -1 ? r[cTotal] : 0);
                    continue;
                }
                if (!(type.includes('commande') || type.includes('order')) || !oid) continue;
                const frais = Math.abs(parseMontantFR(r[cFraisVente]))
                    + (cFraisFba > -1 ? Math.abs(parseMontantFR(r[cFraisFba])) : 0)
                    + (cFraisAutres > -1 ? Math.abs(parseMontantFR(r[cFraisAutres])) : 0);
                const key = oid + '|' + (cSku > -1 ? (r[cSku] || '') : '');
                if (!transactions[key]) transactions[key] = { oid, sku: cSku > -1 ? (r[cSku] || '') : '', qte: 0, frais: 0 };
                transactions[key].qte += cQty > -1 ? (parseInt(r[cQty]) || 1) : 1;
                transactions[key].frais += frais;
            }

            // Ventes Amazon groupées par n° de commande
            const parOrder = {};
            ventes.forEach(v => {
                if (!v.amazon_order_id) return;
                const oid = String(v.amazon_order_id).split('|')[0];
                (parOrder[oid] = parOrder[oid] || []).push(v);
            });

            // Rapprochement en 3 passes. Avant, le SKU était calculé puis jamais utilisé :
            // sur une commande à 2 articles de quantité 1, les frais de l'un partaient sur l'autre.
            const norm = x => String(x || '').trim().toUpperCase();
            const prises = new Set();
            const transacTriees = Object.values(transactions);
            const resolu = new Map();

            const rapprocher = (choisir) => {
                transacTriees.forEach(t => {
                    if (resolu.has(t)) return;
                    const candidates = (parOrder[t.oid] || []).filter(v => !prises.has(v.id));
                    if (!candidates.length) return;
                    const v = choisir(t, candidates);
                    if (v) { prises.add(v.id); resolu.set(t, v); }
                });
            };
            // 1. SKU du rapport = EAN ou ASIN de la vente (identification certaine)
            rapprocher((t, c) => {
                const sku = norm(t.sku);
                if (!sku) return null;
                return c.find(v => norm(v.produit_ean) === sku)
                    || c.find(v => norm(String(v.amazon_order_id).split('|')[1]) === sku)
                    || null;
            });
            // 2. à défaut, la quantité
            rapprocher((t, c) => c.find(v => (v.quantite || 1) === t.qte) || null);
            // 3. en dernier recours, la première ligne libre de la commande
            rapprocher((t, c) => c[0]);

            fraisImportData = transacTriees.map(t => ({ ...t, frais: parseFloat(t.frais.toFixed(2)), vente: resolu.get(t) || null }));

            const avec = fraisImportData.filter(l => l.vente);
            const stats = [
                ['✅ Correspondances trouvées', avec.length, '#27ae60'],
                ['❓ Sans correspondance', fraisImportData.length - avec.length, '#e67e22'],
                ['💶 Frais réels à appliquer', avec.reduce((s, l) => s + l.frais, 0).toFixed(2) + '€', '#3498db'],
            ];
            if (remboursements > 0) stats.push(['↩️ Remboursements (info, non traités)', remboursements + ' (' + montantRemb.toFixed(2) + '€)', '#95a5a6']);
            if (cFraisFba === -1) stats.push(['⚠️ Colonne frais FBA introuvable', 'frais sous-évalués', '#e74c3c']);
            document.getElementById('frais-stats').innerHTML = stats
                .map(b => `<span style="background:${b[2]};color:white;padding:6px 12px;border-radius:10px;font-size:13px;font-weight:600;">${b[0]} : ${b[1]}</span>`)
                .join('');

            if (!avec.length) {
                document.getElementById('frais-preview-table').innerHTML = '<p style="color:#e67e22;font-weight:600;">Aucune commande de ce rapport ne correspond à vos ventes importées. Vérifiez que la période du rapport couvre bien celle de vos ventes Amazon.</p>';
            } else {
                let h = '<div class="products-table"><table><thead><tr><th>Commande</th><th>Produit</th><th>Qté</th><th>Frais estimés</th><th>Frais réels</th><th>Nouveau bénéfice</th></tr></thead><tbody>';
                avec.slice(0, 100).forEach(l => {
                    const v = l.vente;
                    const benef = (v.prix_total || 0) - (v.prix_achat_unitaire || 0) * (v.quantite || 1) - l.frais;
                    h += `<tr>
                        <td style="font-size:12px;">${escapeHtml(l.oid)}</td>
                        <td><strong>${escapeHtml(v.produit_nom || '-')}</strong></td>
                        <td>${v.quantite || 1}</td>
                        <td style="color:var(--text-secondary);">${(v.frais || 0).toFixed(2)}€</td>
                        <td style="font-weight:700;">${l.frais.toFixed(2)}€</td>
                        <td style="font-weight:700;color:${benef >= 0 ? 'var(--success)' : 'var(--danger)'};">${benef >= 0 ? '+' : ''}${benef.toFixed(2)}€</td>
                    </tr>`;
                });
                if (avec.length > 100) h += `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">... et ${avec.length - 100} de plus</td></tr>`;
                h += '</tbody></table></div>';
                document.getElementById('frais-preview-table').innerHTML = h;
            }
            document.getElementById('frais-count').textContent = avec.length;
            document.getElementById('frais-preview').style.display = 'block';
        } catch (err) { cancelFraisImport(true); toastError('Erreur lecture', err.message); }
    };
    reader.readAsText(file, 'UTF-8');
}

async function confirmFraisImport() {
    if (fraisImportEnCours) return toastWarning('En cours', 'L\'application des frais est déjà en train de tourner.');
    const lignes = (fraisImportData || []).filter(l => l.vente);
    if (!lignes.length) return toastError('Rien à appliquer', 'Aucune correspondance entre le rapport et vos ventes.');

    const totalFrais = lignes.reduce((s, l) => s + l.frais, 0);
    if (!await srConfirm(`Appliquer les frais réels Amazon à ${lignes.length} vente(s) ?\n\nTotal des frais réels : ${totalFrais.toFixed(2)}€\nLes frais estimés seront remplacés et le bénéfice recalculé.\n\n(Réappliquer le même rapport plus tard est sans risque : les frais sont remplacés, pas additionnés.)`, 'Appliquer les frais réels')) return;

    fraisImportEnCours = true;
    const btn = document.getElementById('frais-apply-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

    try {
        let ok = 0, erreurs = 0, i = 0;
        for (const l of lignes) {
            i++;
            if (btn) btn.innerHTML = `⏳ Application… ${i} / ${lignes.length}`;
            const v = l.vente;
            const benefice = parseFloat(((v.prix_total || 0) - (v.prix_achat_unitaire || 0) * (v.quantite || 1) - l.frais).toFixed(2));
            const notes = (v.notes || '').includes('frais réels') ? v.notes : ((v.notes || '') + ' · frais réels').trim();
            const { error } = await sb.from('ventes').update({ frais: l.frais, benefice, notes }).eq('id', v.id);
            if (error) { erreurs++; console.warn('Frais réels:', error.message); continue; }
            ok++;
        }
        toastSuccess('Frais appliqués', `${ok} vente(s) mise(s) à jour avec les frais réels` + (erreurs ? ` · ${erreurs} erreur(s)` : ''));
        cancelFraisImport();
        await loadVentes();
        updateDashboard();
    } finally {
        fraisImportEnCours = false;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '✅ Appliquer les frais réels à <span id="frais-count">0</span> vente(s)'; }
    }
}

function cancelFraisImport(garderFichier) {
    fraisImportData = null;
    document.getElementById('frais-preview').style.display = 'none';
    document.getElementById('frais-file-name').textContent = '';
    if (!garderFichier) document.getElementById('frais-file-input').value = '';
}

// ═══════ EXPORT EXCEL ═══════
async function exportStockExcel() {
    const list = getFilteredStock();
    if (!list.length) return toastError('Aucune donnée', 'Aucun produit à exporter.');

    const viewLabel = {all:'Tout',neuf:'Neuf',occasion:'Occasion',entrepot:'Entrepot',fba:'FBA',fbm:'FBM',rebut:'Rebut'}[activeStockView] || 'Stock';
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
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    el('dash-total-produits', enStock.reduce((s,p)=>s+(p.quantite||0),0));
    el('dash-total-vendus', ventes.reduce((s,v)=>s+(v.quantite||0),0));
    const valStockAchat = enStock.reduce((s,p) => s + ((p.prix_achat||0)*(p.quantite||0)), 0);
    el('dash-valeur-stock', valStockAchat.toFixed(2) + '€');
    const valEntrepot = enStock.reduce((s,p) => s + ((p.prix_achat||0)*(p.qte_entrepot||0)), 0);
    el('dash-valeur-entrepot', valEntrepot.toFixed(2) + '€');

    // CA et bénéfice depuis la vraie table ventes
    const ca = ventes.reduce((s,v) => s + (v.prix_total || 0), 0);
    el('dash-ca-realise', ca.toFixed(2) + '€');
    const benefice = ventes.reduce((s,v) => s + (v.benefice || 0), 0);
    el('dash-benefice', benefice.toFixed(2) + '€');
    const marges = ventes.filter(v => v.prix_achat_unitaire > 0).map(v => {
        const totalAchat = (v.prix_achat_unitaire || 0) * (v.quantite || 1);
        return totalAchat > 0 ? ((v.prix_total - totalAchat) / totalAchat * 100) : 0;
    });
    el('dash-marge-moyenne', (marges.length ? (marges.reduce((a,b)=>a+b,0)/marges.length) : 0).toFixed(1) + '%');

    // Bénéfice potentiel avec explication
    const valRevente = enStock.reduce((s,p) => s + ((p.prix_revente||0)*(p.quantite||0)), 0);
    const benefPot = valRevente - valStockAchat;
    const sansRevente = enStock.filter(p => !p.prix_revente || p.prix_revente <= 0);
    el('dash-benefice-potentiel', benefPot.toFixed(2) + '€');
    const benefCard = document.getElementById('dash-benef-potentiel-card');
    const benefDetail = document.getElementById('dash-benef-detail');
    if (benefCard) {
        benefCard.style.borderLeft = benefPot < 0 ? '4px solid #e74c3c' : benefPot > 0 ? '4px solid #27ae60' : '';
    }
    if (benefDetail) {
        if (sansRevente.length > 0) {
            benefDetail.innerHTML = `⚠️ ${sansRevente.length} produit${sansRevente.length>1?'s':''} sans prix de revente`;
        } else {
            benefDetail.textContent = '';
        }
    }

    // Sub-stats
    el('dash-qte-fba', enStock.reduce((s,p)=>s+(p.qte_fba||0),0));
    el('dash-qte-fbm', enStock.reduce((s,p)=>s+(p.qte_fbm||0),0));
    el('dash-qte-entrepot', enStock.reduce((s,p)=>s+(p.qte_entrepot||0),0));
    el('dash-qte-rebut', products.filter(p => !p.vendu && ((p.etat_stock||'')==='rebut' || p.invendable)).reduce((s,p)=>s+(p.quantite||0),0));

    // Dashboard alerts
    const alertsDiv = document.getElementById('dash-alerts');
    if (alertsDiv) {
        let alerts = '';
        
        // Achats en attente
        const enAttente = achats.filter(a => !a.recu);
        if (enAttente.length > 0) {
            const montantAttente = enAttente.reduce((s,a) => s + ((a.prix_ttc||0)*(a.quantite||1)), 0);
            alerts += `<div class="dash-alert warning" onclick="switchTab('achats')">
                <span class="dash-alert-icon">📦</span>
                <div class="dash-alert-text"><strong>${enAttente.length} achat${enAttente.length>1?'s':''} en attente de réception</strong>Montant : ${montantAttente.toFixed(2)}€ TTC</div>
                <span class="dash-alert-action">→</span>
            </div>`;
        }

        // Produits sans prix de revente
        if (sansRevente.length > 0) {
            alerts += `<div class="dash-alert danger" onclick="switchTab('stock')">
                <span class="dash-alert-icon">💰</span>
                <div class="dash-alert-text"><strong>${sansRevente.length} produit${sansRevente.length>1?'s':''} sans prix de revente</strong>Le bénéfice potentiel est faussé — renseignez les prix pour un calcul fiable</div>
                <span class="dash-alert-action">→</span>
            </div>`;
        }

        // Produits sans seuil d'alerte
        const sansSeuil = enStock.filter(p => !p.seuil_stock || p.seuil_stock <= 0);
        if (sansSeuil.length > 0) {
            alerts += `<div class="dash-alert info" onclick="switchTab('alertes')">
                <span class="dash-alert-icon">🔔</span>
                <div class="dash-alert-text"><strong>${sansSeuil.length} produit${sansSeuil.length>1?'s':''} sans seuil d'alerte stock</strong>Configurez les seuils pour être alerté en cas de rupture</div>
                <span class="dash-alert-action">→</span>
            </div>`;
        }

        // Stock critique (quantité = 0 mais pas vendu)
        const critique = enStock.filter(p => (p.quantite||0) === 0);
        if (critique.length > 0) {
            alerts += `<div class="dash-alert danger" onclick="switchTab('alertes')">
                <span class="dash-alert-icon">🔴</span>
                <div class="dash-alert-text"><strong>${critique.length} produit${critique.length>1?'s':''} en rupture de stock</strong>Quantité à zéro — réapprovisionnement nécessaire</div>
                <span class="dash-alert-action">→</span>
            </div>`;
        }

        // Factures en retard
        const today = new Date().toISOString().split('T')[0];
        const facturesRetard = (typeof factures !== 'undefined' ? factures : []).filter(f => !f.payee && f.date_echeance && f.date_echeance < today);
        if (facturesRetard.length > 0) {
            const montantRetard = facturesRetard.reduce((s,f) => s + (f.montant_ttc||0), 0);
            alerts += `<div class="dash-alert danger" onclick="switchTab('factures')">
                <span class="dash-alert-icon">🧾</span>
                <div class="dash-alert-text"><strong>${facturesRetard.length} facture${facturesRetard.length>1?'s':''} en retard</strong>Montant dû : ${montantRetard.toFixed(2)}€</div>
                <span class="dash-alert-action">→</span>
            </div>`;
        }

        // Stock vieillissant (> 60 jours sans vente)
        const oldStock = enStock.filter(p => {
            if (!p.date_ajout) return false;
            return (Date.now() - new Date(p.date_ajout)) / 86400000 > 60;
        });
        if (oldStock.length > 5) {
            alerts += `<div class="dash-alert warning" onclick="switchTab('stock')">
                <span class="dash-alert-icon">⏰</span>
                <div class="dash-alert-text"><strong>${oldStock.length} produit${oldStock.length>1?'s':''} en stock depuis plus de 60 jours</strong>Pensez à ajuster les prix ou changer de canal de vente</div>
                <span class="dash-alert-action">→</span>
            </div>`;
        }

        alertsDiv.innerHTML = alerts;
    }

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
    if (c1) charts.evolution = new Chart(c1, { type:'bar', data:{labels:mLabels, datasets:[{label:'Unités ajoutées',data:mLabels.map(m=>months[m]),backgroundColor:'rgba(45,90,39,0.75)'}]}, options:{responsive:true,plugins:{legend:{display:false}}} });

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
    if (c3) charts.categories = new Chart(c3, { type:'bar', data:{labels:sortedCats.map(c=>c[0]),datasets:[{label:'Unités',data:sortedCats.map(c=>c[1]),backgroundColor:'rgba(45,90,39,0.65)'}]}, options:{responsive:true,indexAxis:'y',plugins:{legend:{display:false}}} });

    // CA par canal (depuis la vraie table ventes)
    const canaux = {};
    ventes.forEach(v => { const c = v.canal || 'Autre'; canaux[c] = (canaux[c]||0) + (v.prix_total||0); });
    if (charts.canaux) charts.canaux.destroy();
    const c4 = document.getElementById('chartCanaux');
    if (c4) charts.canaux = new Chart(c4, { type:'doughnut', data:{labels:Object.keys(canaux),datasets:[{data:Object.values(canaux),backgroundColor:['#ff9900','#3f51b5','#00b4b6','#f56b2a','#95a5a6']}]}, options:{responsive:true} });
}

// ═══════ UTILS ═══════
function showSuccess(id) {
    toastSuccess('Enregistré', `L'opération a été effectuée avec succès.`);
    const m = document.getElementById(id);
    if (m) { m.style.display = 'block'; setTimeout(() => m.style.display = 'none', 3000); }
}

function downloadCSV(csv, name) {
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
}

function openSellerAmp(code) {
    if (!code) return toastError('Code manquant', 'Aucun ASIN ou EAN pour ce produit.');
    window.open('https://sas.selleramp.com/sas/lookup?search_term=' + encodeURIComponent(code), '_blank');
}

function openSellerCentral(asin) {
    if (!asin) return toastError('ASIN manquant', "Renseignez l'ASIN de l'achat pour créer l'offre Amazon.");
    window.open('https://sellercentral.amazon.fr/abis/listing/syh/offer?_encoding=UTF8&mons_sel_best_mkid=amzn1.mp.o.A13V1IB3VIYZZH&ld=AMZUDP&coliid=&asin=' + encodeURIComponent(asin) + '&colid=&qid=&sr=#offer', '_blank');
}

function searchPrice(platform) {
    const ean = document.getElementById('ean')?.value.trim();
    if (!ean) return toastError('EAN manquant', 'Saisissez un EAN avant de rechercher.');
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
        user_id: getEffectiveUserId(),
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

// ═══════ VENTES ═══════
function displayVentes() {
    const c = document.getElementById('ventes-container');
    if (!c) return;

    const q = (document.getElementById('ventes-search')?.value || '').trim().toLowerCase();
    const canal = document.getElementById('ventes-filter-canal')?.value || '';
    const dateFrom = document.getElementById('ventes-filter-from')?.value || '';
    const dateTo = document.getElementById('ventes-filter-to')?.value || '';

    let list = [...ventes];
    if (q) list = list.filter(v => (v.produit_nom||'').toLowerCase().includes(q) || (v.produit_ean||'').includes(q) || (v.canal||'').toLowerCase().includes(q));
    if (canal) list = list.filter(v => v.canal === canal);
    if (dateFrom) list = list.filter(v => v.date_vente >= dateFrom);
    if (dateTo) list = list.filter(v => v.date_vente <= dateTo);

    // Stats
    const totalCA = list.reduce((s, v) => s + (v.prix_total || 0), 0);
    const totalBenefice = list.reduce((s, v) => s + (v.benefice || 0), 0);
    const totalQte = list.reduce((s, v) => s + (v.quantite || 0), 0);
    const totalFrais = list.reduce((s, v) => s + (v.frais || 0), 0);
    const statsEl = document.getElementById('ventes-stats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="stat-card"><div class="stat-number">${list.length}</div><div class="stat-label">Ventes</div></div>
            <div class="stat-card"><div class="stat-number">${totalQte}</div><div class="stat-label">Unités vendues</div></div>
            <div class="stat-card"><div class="stat-number" style="color:var(--brand);">${totalCA.toFixed(2)}€</div><div class="stat-label">CA total</div></div>
            <div class="stat-card"><div class="stat-number" style="color:${totalBenefice>=0?"var(--success)":"var(--danger)"};">${totalBenefice>=0?'+':''}${totalBenefice.toFixed(2)}€</div><div class="stat-label">Bénéfice net</div></div>
            <div class="stat-card"><div class="stat-number">${totalFrais.toFixed(2)}€</div><div class="stat-label">Frais totaux</div></div>
            <div class="stat-card"><div class="stat-number">${list.length > 0 ? (totalCA / list.length).toFixed(2) : '0.00'}€</div><div class="stat-label">Panier moyen</div></div>
        `;
    }

    if (!list.length) {
        c.innerHTML = '<div class="empty-state"><h3>Aucune vente</h3><p>Les ventes apparaîtront ici après chaque enregistrement.</p></div>';
        return;
    }

    let h = '<div class="products-table"><table><thead><tr><th>Date</th><th>Produit</th><th>EAN</th><th>Canal</th><th>Qté</th><th>Prix unit.</th><th>Total</th><th>Frais</th><th>Bénéfice</th><th>Notes</th></tr></thead><tbody>';
    list.forEach(v => {
        const benef = v.benefice || 0;
        const benefColor = benef > 0 ? 'var(--success)' : benef < 0 ? 'var(--danger)' : 'var(--text-secondary)';
        h += `<tr>
            <td style="font-size:12px;color:var(--text-secondary);">${v.date_vente || '-'}</td>
            <td><strong>${escapeHtml(v.produit_nom || '-')}</strong></td>
            <td style="font-size:12px;color:var(--text-secondary);">${escapeHtml(v.produit_ean || '-')}</td>
            <td><span class="badge badge-neuf" style="font-size:11px;">${escapeHtml(v.canal || 'Autre')}</span></td>
            <td style="text-align:center;font-weight:700;">${v.quantite || 1}</td>
            <td>${(v.prix_unitaire || 0).toFixed(2)}€</td>
            <td style="font-weight:700;">${(v.prix_total || 0).toFixed(2)}€</td>
            <td style="color:var(--text-secondary);">${(v.frais || 0).toFixed(2)}€</td>
            <td style="font-weight:700;color:${benefColor};">${benef >= 0 ? '+' : ''}${benef.toFixed(2)}€</td>
            <td style="font-size:12px;color:var(--text-secondary);">${escapeHtml(v.notes || '')}</td>
        </tr>`;
    });
    h += '</tbody></table></div>';
    c.innerHTML = h;
}

async function exportVentes() {
    if (!ventes.length) return toastError('Aucune donnée', 'Aucune vente à exporter.');
    const rows = ventes.map(v => ({
        'Date': v.date_vente || '',
        'Produit': v.produit_nom || '',
        'EAN': v.produit_ean || '',
        'Canal': v.canal || '',
        'Quantité': v.quantite || 1,
        'Prix unitaire (€)': (v.prix_unitaire || 0).toFixed(2),
        'Total (€)': (v.prix_total || 0).toFixed(2),
        'Prix achat unit. (€)': (v.prix_achat_unitaire || 0).toFixed(2),
        'Frais (€)': (v.frais || 0).toFixed(2),
        'Bénéfice (€)': (v.benefice || 0).toFixed(2),
        'Notes': v.notes || '',
    }));
    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Ventes');
        XLSX.writeFile(wb, `stock-radar-ventes-${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
        const csv = [Object.keys(rows[0]).join(';'), ...rows.map(r => Object.values(r).join(';'))].join('\n');
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
        a.download = `stock-radar-ventes-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    }
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
            <td><span style="color:${color};font-weight:700;">${icon} ${escapeHtml(m.type)}</span></td>
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
let transfertProductId = null;
let transfertFrom = null;
let transfertTo = null;

function openTransfertModal(productId) {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    transfertProductId = productId;
    transfertFrom = null;
    transfertTo = null;

    // Product info
    document.getElementById('transfert-product-info').innerHTML = 
        `<strong>${escapeHtml(p.nom)}</strong><br>
        <span style="color:var(--text-secondary);">Stock total : <strong>${p.quantite||0}</strong> · Entrepôt: ${p.qte_entrepot||0} · FBA: ${p.qte_fba||0} · FBM: ${p.qte_fbm||0}</span>`;

    // Set quantities on FROM buttons
    document.getElementById('tf-from-entrepot').textContent = (p.qte_entrepot||0) + ' u.';
    document.getElementById('tf-from-fba').textContent = (p.qte_fba||0) + ' u.';
    document.getElementById('tf-from-fbm').textContent = (p.qte_fbm||0) + ' u.';

    // Reset selections
    document.querySelectorAll('#transfert-from-btns .transfert-loc-btn').forEach(b => {
        b.classList.remove('selected', 'disabled');
        const loc = b.dataset.loc;
        const qty = loc === 'entrepot' ? (p.qte_entrepot||0) : loc === 'fba' ? (p.qte_fba||0) : (p.qte_fbm||0);
        if (qty === 0) b.classList.add('disabled');
    });
    document.querySelectorAll('#transfert-to-btns .transfert-loc-btn').forEach(b => {
        b.classList.remove('selected', 'disabled');
    });

    document.getElementById('transfert-qte').value = 1;
    document.getElementById('transfert-summary').style.display = 'none';
    document.getElementById('transfert-confirm-btn').disabled = true;
    document.getElementById('transfert-confirm-btn').style.opacity = '0.5';
    document.getElementById('transfert-modal').style.display = 'block';
}

function closeTransfertModal() {
    document.getElementById('transfert-modal').style.display = 'none';
    transfertProductId = null;
}

function selectTransfertFrom(loc) {
    transfertFrom = loc;
    document.querySelectorAll('#transfert-from-btns .transfert-loc-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.loc === loc);
    });
    // Disable same location in TO
    document.querySelectorAll('#transfert-to-btns .transfert-loc-btn').forEach(b => {
        b.classList.remove('selected', 'disabled');
        if (b.dataset.loc === loc) b.classList.add('disabled');
    });
    transfertTo = null;
    // Set max quantity
    const p = products.find(x => x.id === transfertProductId);
    if (p) {
        const champs = { entrepot: 'qte_entrepot', fba: 'qte_fba', fbm: 'qte_fbm' };
        const max = p[champs[loc]] || 0;
        document.getElementById('transfert-qte').max = max;
        document.getElementById('transfert-qte').value = Math.min(parseInt(document.getElementById('transfert-qte').value)||1, max);
    }
    updateTransfertSummary();
}

function selectTransfertTo(loc) {
    if (loc === transfertFrom) return;
    transfertTo = loc;
    document.querySelectorAll('#transfert-to-btns .transfert-loc-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.loc === loc);
    });
    updateTransfertSummary();
}

function adjustTransfertQte(delta) {
    const input = document.getElementById('transfert-qte');
    const newVal = Math.max(1, (parseInt(input.value)||1) + delta);
    const max = parseInt(input.max) || 999;
    input.value = Math.min(newVal, max);
    updateTransfertSummary();
}

function setTransfertQteMax() {
    const input = document.getElementById('transfert-qte');
    input.value = input.max || 1;
    updateTransfertSummary();
}

function updateTransfertSummary() {
    const summary = document.getElementById('transfert-summary');
    const btn = document.getElementById('transfert-confirm-btn');
    const qte = parseInt(document.getElementById('transfert-qte').value) || 0;
    const labels = { entrepot: '🏭 Entrepôt', fba: '📦 FBA', fbm: '🏠 FBM' };

    if (transfertFrom && transfertTo && qte > 0) {
        summary.innerHTML = `${labels[transfertFrom]} → <strong>${qte}</strong> unité${qte > 1 ? 's' : ''} → ${labels[transfertTo]}`;
        summary.style.display = 'block';
        btn.disabled = false;
        btn.style.opacity = '1';
    } else {
        summary.style.display = 'none';
        btn.disabled = true;
        btn.style.opacity = '0.5';
    }
}

// Listen to qte input changes
document.getElementById('transfert-qte')?.addEventListener('input', updateTransfertSummary);

async function confirmTransfert() {
    if (!transfertProductId || !transfertFrom || !transfertTo) return;
    const p = products.find(x => x.id === transfertProductId);
    if (!p) return;

    const qte = parseInt(document.getElementById('transfert-qte').value) || 0;
    if (qte <= 0) return;

    const champs = { entrepot: 'qte_entrepot', fba: 'qte_fba', fbm: 'qte_fbm' };
    const qteDe = p[champs[transfertFrom]] || 0;
    if (qte > qteDe) return toastError('Stock insuffisant', `Stock insuffisant en ${transfertFrom} (${qteDe} disponible)`);

    const newFrom = qteDe - qte;
    const newTo = (p[champs[transfertTo]] || 0) + qte;

    const update = {};
    update[champs[transfertFrom]] = newFrom;
    update[champs[transfertTo]] = newTo;
    
    // Recalculer quantite totale
    const allQtes = { qte_entrepot: p.qte_entrepot ?? 0, qte_fba: p.qte_fba ?? 0, qte_fbm: p.qte_fbm ?? 0 };
    allQtes[champs[transfertFrom]] = newFrom;
    allQtes[champs[transfertTo]] = newTo;
    update.quantite = allQtes.qte_entrepot + allQtes.qte_fba + allQtes.qte_fbm;

    const { error } = await sb.from('produits').update(update).eq('id', transfertProductId);
    if (error) return toastError('Erreur', error.message);

    await logMouvement(transfertProductId, 'transfert', qte, transfertFrom, transfertTo, 'Transfert manuel', '');
    closeTransfertModal();
    await loadProducts();
}

// ═══════ TRANSFERT EN LOT ═══════
let bulkSelectedIds = [];
let bulkTransfertEnCours = false;
const BULK_LABELS = { entrepot: '🏭 Entrepôt', fba: '📦 FBA', fbm: '🏠 FBM' };
const BULK_CHAMPS = { entrepot: 'qte_entrepot', fba: 'qte_fba', fbm: 'qte_fbm' };

function toggleAllStock(checked) {
    document.querySelectorAll('.stock-check').forEach(cb => cb.checked = checked);
    updateStockSelection();
}

function updateStockSelection() {
    const n = document.querySelectorAll('.stock-check:checked').length;
    const bar = document.getElementById('stock-selection-bar');
    if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
    const c = document.getElementById('stock-selected-count');
    if (c) c.textContent = n > 0 ? `${n} produit${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}` : '';
}

function openBulkTransfert() {
    bulkSelectedIds = [...document.querySelectorAll('.stock-check:checked')].map(cb => parseInt(cb.dataset.id));
    if (!bulkSelectedIds.length) return toastError('Sélection vide', 'Cochez au moins un produit dans le tableau.');
    document.getElementById('bulk-from').value = 'entrepot';
    document.getElementById('bulk-to').value = 'fba';
    document.getElementById('bulk-fba-attente').checked = false;
    renderBulkTransfertList();
    document.getElementById('bulk-transfert-modal').style.display = 'block';
}

function closeBulkTransfert() {
    document.getElementById('bulk-transfert-modal').style.display = 'none';
}

function renderBulkTransfertList() {
    const from = document.getElementById('bulk-from').value;
    const to = document.getElementById('bulk-to').value;
    const c = document.getElementById('bulk-transfert-list');
    const attWrap = document.getElementById('bulk-fba-attente-wrap');
    if (attWrap) attWrap.style.display = to === 'fba' ? 'block' : 'none';

    if (from === to) {
        c.innerHTML = '<p style="color:#e74c3c;font-weight:600;text-align:center;">Choisissez deux emplacements différents.</p>';
        updateBulkSummary();
        return;
    }

    let rows = '';
    bulkSelectedIds.forEach(id => {
        const p = products.find(x => x.id === id);
        if (!p) return;
        const max = p[BULK_CHAMPS[from]] || 0;
        rows += `<tr style="${max === 0 ? 'opacity:0.45;' : ''}">
            <td><strong>${escapeHtml(p.nom)}</strong><br><span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(p.ean || '')}</span></td>
            <td style="text-align:center;font-weight:700;">${max}</td>
            <td style="text-align:center;"><input type="number" class="bulk-qty" data-id="${p.id}" min="0" max="${max}" value="${max}" ${max === 0 ? 'disabled' : ''} style="width:70px;padding:6px;text-align:center;font-weight:700;border:2px solid var(--input-border);border-radius:8px;background:var(--input-bg);color:var(--text-color);" oninput="updateBulkSummary()"></td>
        </tr>`;
    });
    c.innerHTML = `<div class="products-table" style="max-height:320px;overflow-y:auto;"><table><thead><tr><th>Produit</th><th>Dispo ${BULK_LABELS[from]}</th><th>À transférer</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    updateBulkSummary();
}

function bulkToutMax() {
    document.querySelectorAll('.bulk-qty').forEach(i => { if (!i.disabled) i.value = i.max; });
    updateBulkSummary();
}

function bulkToutZero() {
    document.querySelectorAll('.bulk-qty').forEach(i => { if (!i.disabled) i.value = 0; });
    updateBulkSummary();
}

function updateBulkSummary() {
    const from = document.getElementById('bulk-from').value;
    const to = document.getElementById('bulk-to').value;
    let total = 0, nb = 0;
    document.querySelectorAll('.bulk-qty').forEach(i => {
        const q = parseInt(i.value) || 0;
        if (q > 0) { total += q; nb++; }
    });
    const s = document.getElementById('bulk-summary');
    const btn = document.getElementById('bulk-confirm-btn');
    const ok = total > 0 && from !== to;
    if (s) s.innerHTML = ok ? `${BULK_LABELS[from]} → <strong>${total}</strong> unité${total > 1 ? 's' : ''} (${nb} produit${nb > 1 ? 's' : ''}) → ${BULK_LABELS[to]}` : '';
    if (btn) { btn.disabled = !ok; btn.style.opacity = ok ? '1' : '0.5'; }
}

async function confirmBulkTransfert() {
    if (bulkTransfertEnCours) return;
    const from = document.getElementById('bulk-from').value;
    const to = document.getElementById('bulk-to').value;
    if (from === to) return;
    const marquerAttente = to === 'fba' && document.getElementById('bulk-fba-attente')?.checked;

    const lignes = [...document.querySelectorAll('.bulk-qty')]
        .map(i => ({ id: parseInt(i.dataset.id), qte: Math.min(parseInt(i.value) || 0, parseInt(i.max) || 0) }))
        .filter(l => l.qte > 0);
    if (!lignes.length) return toastError('Rien à transférer', 'Toutes les quantités sont à zéro.');

    bulkTransfertEnCours = true;
    const btn = document.getElementById('bulk-confirm-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }

    try {
        let ok = 0, erreurs = 0, i = 0;
        for (const l of lignes) {
            i++;
            if (btn) btn.innerHTML = `⏳ Transfert… ${i} / ${lignes.length}`;
            const p = products.find(x => x.id === l.id);
            if (!p) continue;
            const dispo = p[BULK_CHAMPS[from]] || 0;
            const q = Math.min(l.qte, dispo);
            if (q <= 0) continue;

            const update = {};
            update[BULK_CHAMPS[from]] = dispo - q;
            update[BULK_CHAMPS[to]] = (p[BULK_CHAMPS[to]] || 0) + q;
            if (marquerAttente) update.fba_attente = true;

            const { error } = await sb.from('produits').update(update).eq('id', p.id);
            if (error) { erreurs++; console.warn('Transfert lot:', error.message); continue; }
            p[BULK_CHAMPS[from]] = update[BULK_CHAMPS[from]];
            p[BULK_CHAMPS[to]] = update[BULK_CHAMPS[to]];
            await logMouvement(p.id, 'transfert', q, from, to, 'Transfert en lot', '');
            ok++;
        }
        closeBulkTransfert();
        toastSuccess('Transfert terminé', `${ok} produit${ok > 1 ? 's' : ''} transféré${ok > 1 ? 's' : ''} ${BULK_LABELS[from]} → ${BULK_LABELS[to]}` + (erreurs ? ` · ${erreurs} erreur(s)` : ''));
        await loadProducts();
        updateDashboard();
    } finally {
        bulkTransfertEnCours = false;
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '✅ Transférer'; }
    }
}

// ═══════ FOURNITURES & FRAIS ═══════
let fournitures = [];

async function loadFournitures() {
    let query = sb.from('fournitures').select('*').order('date_achat', { ascending: false });
    const uid = getUserFilter();
    if (uid) query = query.eq('user_id', uid);
    const { data, error } = await query;
    if (error) console.warn('Erreur fournitures:', error.message);
    fournitures = data || [];
    displayFournitures();
    updateFournituresSelect();
}

function updateFournituresSelect() {
    const sel = document.getElementById('four-fournisseur');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">--</option>';
    fournisseurs.forEach(f => sel.innerHTML += `<option value="${f.id}">${escapeHtml(f.nom)}</option>`);
    sel.value = cur;
}

function toggleFournitureForm() {
    const section = document.getElementById('fourniture-form-section');
    if (section.style.display === 'none' || !section.style.display) {
        document.getElementById('fourniture-form').reset();
        document.getElementById('four-date').value = new Date().toISOString().split('T')[0];
        editingFournitureId = null;
        const btn = document.querySelector('#fourniture-form .submit-button');
        if (btn) btn.innerHTML = '💾 Enregistrer';
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

let editingFournitureId = null;

function editFourniture(id) {
    const f = fournitures.find(x => x.id === id);
    if (!f) return;
    editingFournitureId = id;
    document.getElementById('four-nom').value = f.nom || '';
    document.getElementById('four-categorie').value = f.categorie || '';
    document.getElementById('four-fournisseur').value = f.fournisseur_id || '';
    document.getElementById('four-qte').value = f.quantite || 1;
    document.getElementById('four-prix-ht').value = f.prix_ht || '';
    document.getElementById('four-prix-ttc').value = f.prix_ttc || '';
    document.getElementById('four-date').value = f.date_achat ? f.date_achat.split('T')[0] : '';
    document.getElementById('four-recurrent').value = f.recurrent || '';
    document.getElementById('four-notes').value = f.notes || '';
    const btn = document.querySelector('#fourniture-form .submit-button');
    if (btn) btn.innerHTML = '💾 Modifier';
    document.getElementById('fourniture-form-section').style.display = 'block';
    document.getElementById('fourniture-form-section').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('fourniture-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const fId = document.getElementById('four-fournisseur').value;
    const fObj = fournisseurs.find(f => f.id == fId);
    const f = {
        nom: document.getElementById('four-nom').value.trim(),
        categorie: document.getElementById('four-categorie').value,
        fournisseur_id: fId ? parseInt(fId) : null,
        fournisseur_nom: fObj ? fObj.nom : '',
        quantite: parseInt(document.getElementById('four-qte').value) || 1,
        prix_ht: parseFloat(document.getElementById('four-prix-ht').value) || 0,
        prix_ttc: parseFloat(document.getElementById('four-prix-ttc').value) || 0,
        date_achat: document.getElementById('four-date').value || new Date().toISOString().split('T')[0],
        recurrent: document.getElementById('four-recurrent').value,
        notes: document.getElementById('four-notes').value.trim(),
    };
    if (!f.nom) return toastError('Champ requis', 'La désignation est obligatoire.');
    f.user_id = getEffectiveUserId();

    if (editingFournitureId) {
        const { error } = await sb.from('fournitures').update(f).eq('id', editingFournitureId);
        if (error) return toastError('Erreur', error.message);
    } else {
        const { error } = await sb.from('fournitures').insert([f]);
        if (error) return toastError('Erreur', error.message);
    }
    editingFournitureId = null;
    this.reset();
    document.getElementById('fourniture-form-section').style.display = 'none';
    await loadFournitures();
});

async function deleteFourniture(id) {
    if (!await srConfirm('Supprimer cette fourniture ?', 'Supprimer', true)) return;
    await sb.from('fournitures').delete().eq('id', id);
    await loadFournitures();
    toastSuccess('Fourniture supprimée');
}

function displayFournitures() {
    const c = document.getElementById('fournitures-container');
    if (!c) return;

    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('four-total', fournitures.length);
    el('four-montant', fournitures.reduce((s, f) => s + ((f.prix_ttc || 0) * (f.quantite || 1)), 0).toFixed(2) + '€');
    const now = new Date();
    const moisCourant = fournitures.filter(f => {
        if (!f.date_achat) return false;
        const d = new Date(f.date_achat);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    el('four-mois', moisCourant.reduce((s, f) => s + ((f.prix_ttc || 0) * (f.quantite || 1)), 0).toFixed(2) + '€');

    if (!fournitures.length) { c.innerHTML = '<div class="empty-state"><h3>Aucune fourniture</h3><p>Ajoutez vos frais d\'emballage, d\'expédition et consommables.</p></div>'; return; }

    let h = '<div class="products-table"><table><thead><tr><th>Date</th><th>Désignation</th><th>Catégorie</th><th>Fournisseur</th><th>Qté</th><th>Prix HT</th><th>Prix TTC</th><th>Total TTC</th><th>Actions</th></tr></thead><tbody>';
    fournitures.forEach(f => {
        const d = f.date_achat ? new Date(f.date_achat).toLocaleDateString('fr-FR') : '-';
        const catBadge = f.categorie ? `<span style="background:var(--filter-bg);padding:2px 8px;border-radius:8px;font-size:11px;">${escapeHtml(f.categorie)}</span>` : '-';
        const total = ((f.prix_ttc || 0) * (f.quantite || 1)).toFixed(2);
        const recBadge = f.recurrent ? ` <span style="background:#3498db;color:white;padding:1px 6px;border-radius:6px;font-size:10px;">🔄 ${f.recurrent}</span>` : '';
        h += `<tr style="cursor:pointer" onclick="editFourniture(${f.id})">
            <td>${d}</td>
            <td><strong>${escapeHtml(f.nom)}</strong>${recBadge}</td>
            <td>${catBadge}</td>
            <td>${escapeHtml(f.fournisseur_nom||'-')}</td>
            <td>${f.quantite||1}</td>
            <td>${(f.prix_ht||0).toFixed(2)}€</td>
            <td>${(f.prix_ttc||0).toFixed(2)}€</td>
            <td><strong>${total}€</strong></td>
            <td onclick="event.stopPropagation()"><button class="btn-small btn-delete" onclick="deleteFourniture(${f.id})">🗑️</button></td>
        </tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
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
    if (error) return toastError('Erreur', error.message);
    await loadProducts();
    displayAlertes();
}

async function configurerSeuilsEnLot() {
    const seuil = prompt('Définir un seuil minimum pour TOUS les produits qui n\'en ont pas encore :', '2');
    if (seuil === null) return;
    const val = parseInt(seuil) || 0;
    if (val <= 0) return;
    
    const sansSeuil = products.filter(p => !p.vendu && !p.invendable && !(p.seuil_stock > 0));
    if (!sansSeuil.length) return toastInfo('Déjà configuré', 'Tous les produits ont déjà un seuil.');
    
    if (!await srConfirm(`Mettre le seuil à ${val} pour ${sansSeuil.length} produits ?`, 'Configurer les seuils')) return;
    
    for (const p of sansSeuil) {
        await sb.from('produits').update({ seuil_stock: val }).eq('id', p.id);
    }
    toastSuccess('Seuil configuré', `Seuil de ${val} appliqué à ${sansSeuil.length} produits.`);
    await loadProducts();
    displayAlertes();
}

// ═══════ INVENTAIRE / COMPTAGE ═══════
let inventaireData = []; // { id, ean, nom, theorique, compte, ecart }
let inventaireActif = false;
let invCodeReader = null;
let inventaireFilter = 'all';

async function startInventaire() {
    if (inventaireActif && !await srConfirm('Un inventaire est déjà en cours.\nRecommencer et perdre les comptages en cours ?', 'Recommencer')) return;
    
    const enStock = products.filter(p => !p.vendu && !p.invendable);
    // Un même EAN peut exister sur plusieurs fiches : il faut le savoir au moment du scan,
    // sinon tout le comptage part sur la première fiche trouvée.
    const parEan = {};
    enStock.forEach(p => { const e = String(p.ean || '').trim(); if (e) parEan[e] = (parEan[e] || 0) + 1; });

    inventaireData = enStock.map(p => ({
        id: p.id,
        ean: p.ean || '',
        nom: p.nom || '',
        categorie: p.categorie || '',
        emplacement: p.emplacement || '',
        theorique: p.quantite || 0,
        theoriqueEntrepot: p.qte_entrepot || 0,
        horsSite: (p.qte_fba || 0) + (p.qte_fbm || 0),
        eanPartage: (parEan[String(p.ean || '').trim()] || 0) > 1,
        compte: null,
        ecart: null
    }));

    const partages = new Set(inventaireData.filter(i => i.eanPartage).map(i => i.ean));
    if (partages.size) {
        toastWarning('Codes en double', `${partages.size} EAN existent sur plusieurs fiches. Le scan vous demandera sur laquelle imputer le comptage.`);
    }
    
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
    
    const correspondances = inventaireData.filter(i => i.ean === ean);
    const item = correspondances.length === 1 ? correspondances[0] : null;
    const feedback = document.getElementById('inv-scan-feedback');
    
    if (correspondances.length > 1) {
        // Avant : tout le comptage allait sur la première fiche, les autres restaient
        // non comptées et donc ignorées à la validation.
        playSound('doublon');
        if (feedback) {
            const detail = correspondances.map(i => `« ${escapeHtml(i.nom)} » (théorique ${i.theorique})`).join(' · ');
            feedback.innerHTML = `⚠️ ${correspondances.length} fiches partagent l'EAN ${escapeHtml(ean)} : ${detail}.<br>Saisissez la quantité à la main sur la bonne ligne.`;
            feedback.style.color = '#e67e22'; feedback.style.display = 'block';
        }
        inventaireFilter = 'all';
        displayInventaire();
    } else if (!item) {
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
    if (typeof ZXing === 'undefined') {
        toastError('Scanner non disponible', 'Vérifiez votre connexion internet.');
        return;
    }
    if (invCodeReader) return;           // un 2e clic créait un lecteur en double → comptage x2
    stopAllScanners('inventaire');
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
    } catch (e) { stopInventaireScanner(); toastError('Erreur caméra', e.message); }
}

function stopInventaireScanner() {
    if (invCodeReader) { try { invCodeReader.reset(); } catch(e) {} invCodeReader = null; }
    const v = document.getElementById('inv-video'); if (v) v.style.display = 'none';
    const b = document.getElementById('inv-stop-scanner'); if (b) b.style.display = 'none';
}

async function validerInventaire() {
    stopInventaireScanner();
    const comptes = inventaireData.filter(i => i.compte !== null);
    if (!comptes.length) return toastError('Aucun comptage', 'Aucun produit compté.');

    // Le comptage physique fait foi : on ÉCRIT la valeur comptée, on n'ajoute plus
    // un écart calculé sur un instantané qui a pu vieillir pendant le comptage.
    const aAppliquer = [], conflits = [], impossibles = [], disparus = [];

    comptes.forEach(item => {
        const p = products.find(x => x.id === item.id);
        if (!p) { disparus.push(item); return; }

        const stockActuel = p.quantite || 0;
        const horsSite = (p.qte_fba || 0) + (p.qte_fbm || 0);
        const nouvelEntrepot = item.compte - horsSite;

        if (stockActuel !== item.theorique) {
            // Le stock a bougé depuis le début de l'inventaire (vente, réception, autre appareil)
            conflits.push({ item, p, stockActuel, nouvelEntrepot, horsSite });
            return;
        }
        if (nouvelEntrepot < 0) {
            // Le comptage est inférieur au stock déporté (FBA/FBM), qui n'est pas comptable en rayon.
            // Avant : Math.max(0, …) écrasait l'écart en silence tout en annonçant un ajustement.
            impossibles.push({ item, horsSite });
            return;
        }
        if (stockActuel === item.compte) return;   // rien à faire
        aAppliquer.push({ item, p, nouvelEntrepot, horsSite });
    });

    let messages = [];
    if (conflits.length) messages.push(`⚠️ ${conflits.length} produit(s) ont bougé depuis le début du comptage.`);
    if (impossibles.length) messages.push(`⚠️ ${impossibles.length} comptage(s) inférieurs au stock FBA/FBM, non applicables en entrepôt.`);
    if (disparus.length) messages.push(`⚠️ ${disparus.length} produit(s) ne sont plus dans la liste.`);

    const resume = `Résumé de l'inventaire :\n`
        + `• ${comptes.length} produits comptés\n`
        + `• ${comptes.length - aAppliquer.length - conflits.length - impossibles.length - disparus.length} déjà conformes\n`
        + `• ${aAppliquer.length} ajustement(s) à appliquer\n`
        + (messages.length ? `\n${messages.join('\n')}\nCes lignes ne seront PAS modifiées.\n` : '')
        + `\nLa quantité comptée remplacera la quantité en entrepôt. Le stock FBA/FBM n'est pas modifié.\n\nValider ?`;

    if (!aAppliquer.length && !conflits.length && !impossibles.length) {
        return toastSuccess('Inventaire conforme', 'Aucun écart : tous les comptages correspondent au stock.');
    }
    if (!await srConfirm(resume, `Valider l'inventaire`)) return;

    let ok = 0, echecs = 0;
    for (const a of aAppliquer) {
        const nouveauTotal = a.nouvelEntrepot + a.horsSite;
        const delta = nouveauTotal - (a.p.quantite || 0);
        const { error } = await sb.from('produits').update({
            qte_entrepot: a.nouvelEntrepot,
            quantite: nouveauTotal,
            vendu: nouveauTotal <= 0
        }).eq('id', a.item.id);
        if (error) { echecs++; console.warn('Inventaire, produit ' + a.item.id + ' :', error.message); continue; }
        await logMouvement(a.item.id, 'ajustement', Math.abs(delta),
            'inventaire', 'entrepot',
            `Inventaire: ${delta > 0 ? '+' : ''}${delta} (théo: ${a.item.theorique}, compté: ${a.item.compte})`,
            '');
        ok++;
    }

    // Message honnête : on n'annonce que ce qui a réellement été écrit
    const detailIgnore = [];
    if (conflits.length) detailIgnore.push(`${conflits.length} en conflit`);
    if (impossibles.length) detailIgnore.push(`${impossibles.length} non applicables`);
    if (disparus.length) detailIgnore.push(`${disparus.length} introuvables`);
    if (echecs) detailIgnore.push(`${echecs} en erreur`);

    if (ok) toastSuccess('Inventaire validé', `${ok} ajustement(s) appliqué(s)` + (detailIgnore.length ? ` · ignorés : ${detailIgnore.join(', ')}` : '') + '.');
    else toastWarning('Aucun ajustement appliqué', detailIgnore.join(', ') + '. Le comptage est conservé pour que vous puissiez le reprendre.');

    if (ok && !detailIgnore.length) {
        // Tout est passé : on peut clore l'inventaire
        inventaireActif = false;
        inventaireData = [];
        document.getElementById('inventaire-mode').style.display = 'none';
        document.getElementById('inventaire-vide').style.display = 'block';
        document.getElementById('btn-export-inventaire').style.display = 'none';
    } else {
        // Des lignes restent à traiter : on garde l'écran ouvert plutôt que de perdre le comptage
        aAppliquer.forEach(a => { if (a.item) { a.item.theorique = a.item.compte; a.item.ecart = 0; } });
    }
    await loadProducts();
    if (inventaireActif) displayInventaire();
}

async function annulerInventaire() {
    if (!await srConfirm('Annuler l\'inventaire en cours ?\nTous les comptages seront perdus.', 'Annuler l\'inventaire', true)) return;
    stopInventaireScanner();
    inventaireActif = false;
    inventaireData = [];
    document.getElementById('inventaire-mode').style.display = 'none';
    document.getElementById('inventaire-vide').style.display = 'block';
    document.getElementById('btn-export-inventaire').style.display = 'none';
}

function exportInventaire() {
    if (!inventaireData.length) return toastError('Aucun inventaire', 'Aucun inventaire en cours.');
    
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

    if (!data.length) return toastError('Aucune donnée', 'Aucune donnée à exporter.');

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
            csv += headers.map(h => `"${String(row[h] ?? '').replace(/"/g,'""')}"`).join(';') + '\n';
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
// Les 7 tables sauvegardées. L'ordre d'insertion respecte les dépendances,
// l'ordre de suppression est son inverse.
const BACKUP_TABLES = ['fournisseurs', 'achats', 'produits', 'factures', 'fournitures', 'ventes', 'mouvements'];
const BACKUP_ORDRE_SUPPRESSION = ['ventes', 'fournitures', 'factures', 'mouvements', 'produits', 'achats', 'fournisseurs'];

// Nettoyeurs : transforment une ligne du fichier en ligne insérable pour le compte uid
const BACKUP_NETTOYEURS = {
    fournisseurs: uid => f => ({
        user_id: uid, nom: f.nom, contact: f.contact||'', email: f.email||'', tel: f.tel||'', adresse: f.adresse||'',
        site_web: f.site_web||'', siret: f.siret||'', tva_intra: f.tva_intra||'',
        conditions_paiement: f.conditions_paiement||'', delai_livraison: f.delai_livraison||'',
        moq: f.moq||0, franco: f.franco||0, categorie_fournisseur: f.categorie_fournisseur||'',
        notes: f.notes||''
    }),
    achats: uid => a => ({
        user_id: uid, ean: a.ean, asin: a.asin||'', nom: a.nom, categorie: a.categorie||'',
        fournisseur_nom: a.fournisseur_nom||'', prix_ht: a.prix_ht||0, prix_ttc: a.prix_ttc||0,
        quantite: a.quantite||1, recu: a.recu||false, notes: a.notes||'', date_achat: a.date_achat
    }),
    produits: uid => p => ({
        user_id: uid,
        ean: p.ean, asin: p.asin||'', nom: p.nom, categorie: p.categorie||'', etat: p.etat||'Neuf', etat_stock: p.etat_stock||'neuf',
        prix_achat: p.prix_achat||0, prix_revente: p.prix_revente||0,
        qte_fba: p.qte_fba ?? 0, qte_fbm: p.qte_fbm ?? 0, qte_entrepot: p.qte_entrepot ?? 0, quantite: p.quantite ?? 0,
        amazon_fba: p.amazon_fba ?? false, amazon_fbm: p.amazon_fbm ?? false,
        vinted: p.vinted||false, leboncoin: p.leboncoin||false,
        invendable: p.invendable||false, vendu: p.vendu||false,
        date_vente: p.date_vente||null, prix_vente_reel: p.prix_vente_reel||0,
        plateforme_vente: p.plateforme_vente||null,
        statut: p.statut||'recu', emplacement: p.emplacement||'',
        seuil_stock: p.seuil_stock ?? 0,
        fba_attente: p.fba_attente||false,
        photos: p.photos||[], notes: p.notes||'', date_ajout: p.date_ajout
    }),
    factures: uid => fa => ({
        user_id: uid,
        numero: fa.numero, fournisseur_id: null, fournisseur_nom: fa.fournisseur_nom||'',
        date_facture: fa.date_facture, date_echeance: fa.date_echeance,
        montant_ht: fa.montant_ht||0, montant_ttc: fa.montant_ttc||0,
        payee: fa.payee||false, date_paiement: fa.date_paiement||null, notes: fa.notes||''
    }),
    fournitures: uid => fo => ({
        user_id: uid,
        nom: fo.nom, categorie: fo.categorie||'', fournisseur_nom: fo.fournisseur_nom||'',
        quantite: fo.quantite||1, prix_ht: fo.prix_ht||0, prix_ttc: fo.prix_ttc||0,
        date_achat: fo.date_achat, recurrent: fo.recurrent||'', notes: fo.notes||''
    }),
    ventes: uid => v => ({
        user_id: uid, produit_id: null,
        produit_ean: v.produit_ean||'', produit_nom: v.produit_nom||'',
        canal: v.canal||'Autre', quantite: v.quantite||1,
        prix_unitaire: v.prix_unitaire||0, prix_total: v.prix_total||0,
        prix_achat_unitaire: v.prix_achat_unitaire||0,
        frais: v.frais||0, benefice: v.benefice||0,
        date_vente: v.date_vente||null, notes: v.notes||''
    }),
    mouvements: uid => m => ({
        user_id: uid, produit_id: null,
        produit_ean: m.produit_ean||'', produit_nom: m.produit_nom||'',
        type: m.type||'', quantite: m.quantite||0,
        de_emplacement: m.de_emplacement||'', vers_emplacement: m.vers_emplacement||'',
        raison: m.raison||'', notes: m.notes||'',
        created_at: m.created_at||new Date().toISOString()
    }),
};

// Lit une table ENTIÈRE depuis la base, par pages de 1000 (limite PostgREST).
// On ne se sert plus des tableaux affichés à l'écran : `mouvements` y est plafonné à 200.
async function lireTableComplete(table, uid) {
    const PAS = 1000;
    const lignes = [];
    for (let debut = 0; ; debut += PAS) {
        const { data, error } = await sb.from(table).select('*')
            .eq('user_id', uid)
            .order('id', { ascending: true })
            .range(debut, debut + PAS - 1);
        if (error) throw new Error(`Lecture de la table "${table}" : ${error.message}`);
        lignes.push(...(data || []));
        if (!data || data.length < PAS) break;
    }
    return lignes;
}

async function construireSnapshot(uid, email) {
    const snap = { version: 'stock-radar-v2', date: new Date().toISOString(), user_id: uid, user_email: email };
    for (const t of BACKUP_TABLES) snap[t] = await lireTableComplete(t, uid);
    return snap;
}

function telechargerJSON(obj, nomFichier) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomFichier;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
}

function backupNomCompte() {
    return isAdmin && viewingUserId !== currentUser?.id
        ? (allUsers.find(u => u.user_id === viewingUserId)?.email || viewingUserId)
        : currentUser?.email;
}

async function backupData() {
    // Bloquer le backup en mode admin "Tous les comptes" — données mélangées non fiables
    if (isAdmin && !viewingUserId) {
        toastError('Backup impossible', 'Sélectionnez un compte spécifique avant de lancer le backup.');
        return;
    }
    const uid = getEffectiveUserId();
    if (!uid) return toastError('Non connecté', 'Vous devez être connecté pour sauvegarder.');
    const email = backupNomCompte();

    try {
        toastInfo('Sauvegarde en cours', 'Lecture complète des données depuis la base…');
        const snap = await construireSnapshot(uid, email);
        const safeName = (email || 'compte').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        telechargerJSON(snap, `stock-radar-backup-${safeName}-${new Date().toISOString().split('T')[0]}.json`);
        const detail = BACKUP_TABLES.map(t => `${snap[t].length} ${t}`).join(' · ');
        toastSuccess('Sauvegarde téléchargée', detail);
    } catch (e) {
        toastError('Sauvegarde échouée', e.message + " — aucun fichier n'a été produit.");
        console.error(e);
    }
}

// Télécharge l'état actuel du compte AVANT toute restauration.
// Si ce filet échoue, la restauration est abandonnée : mieux vaut ne rien faire
// que de supprimer des données sans pouvoir les récupérer.
async function filetDeSecurite(uid, email) {
    toastInfo('Filet de sécurité', 'Téléchargement de vos données actuelles avant remplacement…');
    const snap = await construireSnapshot(uid, email);
    const safeName = (email || 'compte').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-').split('T');
    telechargerJSON(snap, `AVANT-RESTAURATION-${safeName}-${horodatage[0]}-${horodatage[1].slice(0,8)}.json`);
    return snap;
}

// Décrit ce qu'un fichier de sauvegarde va remplacer, et ce qu'il va laisser intact
function analyserBackup(backup) {
    const presentes = BACKUP_TABLES.filter(t => Array.isArray(backup[t]));
    const absentes = BACKUP_TABLES.filter(t => !presentes.includes(t));
    const total = presentes.reduce((s, t) => s + backup[t].length, 0);
    return { presentes, absentes, total };
}

// Applique un objet backup (fichier manuel ou sauvegarde auto) sur le compte uid.
// Règle de sécurité : une table ABSENTE du fichier n'est ni supprimée ni touchée.
async function appliquerBackup(backup, uid) {
    const { presentes, absentes } = analyserBackup(backup);
    if (!presentes.length) {
        throw new Error("Ce fichier ne contient aucune table exploitable. Rien n'a été supprimé.");
    }

    // 1. Préparer toutes les lignes AVANT la moindre suppression :
    //    si le fichier est mal formé, on échoue sans avoir rien détruit.
    const aInserer = {};
    for (const t of presentes) {
        try {
            aInserer[t] = backup[t].map(BACKUP_NETTOYEURS[t](uid));
        } catch (e) {
            throw new Error(`Le fichier est illisible sur la table "${t}" (${e.message}). Rien n'a été supprimé.`);
        }
    }

    // 2. Supprimer, uniquement les tables présentes dans le fichier
    for (const t of BACKUP_ORDRE_SUPPRESSION) {
        if (!presentes.includes(t)) continue;
        const { error } = await sb.from(t).delete().eq('user_id', uid);
        if (error) throw new Error(`Échec de la suppression dans "${t}" : ${error.message}`);
    }

    // 3. Réinsérer par lots de 50, en contrôlant CHAQUE lot
    for (const t of BACKUP_TABLES) {
        if (!presentes.includes(t)) continue;
        const lignes = aInserer[t];
        for (let i = 0; i < lignes.length; i += 50) {
            const { error } = await sb.from(t).insert(lignes.slice(i, i + 50));
            if (error) {
                throw new Error(`Échec de l'insertion dans "${t}" (lignes ${i + 1} à ${Math.min(i + 50, lignes.length)}) : ${error.message}`);
            }
        }
    }

    return { presentes, absentes };
}

// Message de confirmation commun aux deux chemins de restauration
function messageRestauration(backup, entete) {
    const { presentes, absentes } = analyserBackup(backup);
    let msg = entete + '\n\nSERONT REMPLACÉES :\n'
        + presentes.map(t => `• ${backup[t].length} ${t}`).join('\n');
    if (absentes.length) {
        msg += '\n\nABSENTES DU FICHIER, donc CONSERVÉES telles quelles :\n'
            + absentes.map(t => `• ${t}`).join('\n');
    }
    const sansPhotos = Array.isArray(backup.produits) && backup.produits.length
        && !backup.produits.some(p => Array.isArray(p.photos) && p.photos.length);
    if (sansPhotos) msg += '\n\n⚠️ Ce fichier ne contient aucune photo produit.';
    msg += '\n\nUne copie de vos données actuelles sera téléchargée avant remplacement.';
    return msg;
}

// Exécute la restauration avec filet de sécurité + messages d'erreur exploitables
async function executerRestauration(backup, uid, email) {
    let filet = null;
    try {
        filet = await filetDeSecurite(uid, email);
    } catch (e) {
        toastError('Restauration annulée', 'Impossible de sauvegarder vos données actuelles (' + e.message + "). Rien n'a été modifié.");
        return false;
    }
    try {
        const { presentes, absentes } = await appliquerBackup(backup, uid);
        const resume = presentes.join(', ') + (absentes.length ? ` · conservées : ${absentes.join(', ')}` : '');
        toastSuccess('Restauration terminée', resume + ' — rechargement…');
        setTimeout(() => location.reload(), 1200);
        return true;
    } catch (e) {
        console.error(e);
        toastError('Restauration interrompue',
            e.message + ' — Vos données d\'avant restauration sont dans le fichier AVANT-RESTAURATION téléchargé il y a un instant. Rechargez-le pour revenir en arrière.');
        return false;
    }
}

async function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        if (!currentUser?.id) {
            return toastError('Non connecté', 'Vous devez être connecté pour effectuer une restauration.');
        }
        // Même règle que le backup : pas de restauration en mode "Tous les comptes",
        // sinon on écrirait sur le compte de l'admin en croyant viser celui affiché.
        if (isAdmin && !viewingUserId) {
            return toastError('Restauration impossible', 'Sélectionnez un compte spécifique avant de restaurer.');
        }
        const uid = getEffectiveUserId();
        const email = backupNomCompte();

        const text = await file.text();
        let backup;
        try { backup = JSON.parse(text); }
        catch { return toastError('Fichier illisible', "Ce fichier n'est pas un JSON valide."); }

        if (!backup.version || !String(backup.version).startsWith('stock-radar')) {
            return toastError('Fichier invalide', 'Format de sauvegarde non reconnu.');
        }

        const { presentes, total } = analyserBackup(backup);
        if (!presentes.length) {
            return toastError('Fichier vide', "Ce fichier ne contient aucune des 7 tables attendues. Rien n'a été modifié.");
        }

        if (backup.user_id && backup.user_id !== uid) {
            const qui = backup.user_email ? ` (${backup.user_email})` : '';
            if (!await srConfirm(`Ce fichier appartient à un autre compte${qui}.\n\nRestaurer quand même sur ${email || 'ce compte'} ?`, 'Compte différent', false)) return;
        }

        const entete = `Sauvegarde du ${backup.date ? new Date(backup.date).toLocaleString('fr-FR') : 'date inconnue'} — ${total} lignes.`;
        if (!await srConfirm(messageRestauration(backup, entete), 'Confirmer la restauration', true)) return;

        await executerRestauration(backup, uid, email);
    } catch (e) {
        toastError('Erreur restauration', e.message);
        console.error(e);
    } finally {
        // Toujours réinitialisé : sans ça, re-sélectionner le même fichier ne déclenche
        // plus l'événement 'change' et il ne se passe plus rien.
        event.target.value = '';
    }
}

// ═══════ SAUVEGARDES AUTOMATIQUES ═══════
let sauvegardesList = [];

async function loadSauvegardes() {
    const c = document.getElementById('sauvegardes-auto-container');
    if (!c) return;
    const uid = getEffectiveUserId();
    if (!uid) return;
    const { data, error } = await sb.from('sauvegardes')
        .select('id, created_at, taille_octets')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) {
        c.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">⚠️ Sauvegardes automatiques non configurées. Exécutez <strong>migration-sauvegardes-auto.sql</strong> dans le SQL Editor de Supabase.</p>';
        return;
    }
    sauvegardesList = data || [];
    if (!sauvegardesList.length) {
        c.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">Aucune sauvegarde automatique pour le moment. La première sera créée cette nuit à 3h.</p>';
        return;
    }
    let h = '';
    sauvegardesList.forEach(s => {
        const d = new Date(s.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const ko = Math.max(1, Math.round((s.taille_octets || 0) / 1024));
        h += `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;background:var(--filter-bg);border-radius:8px;">
            <span style="font-size:13px;">🗓️ ${d} <span style="color:var(--text-secondary);">· ${ko} Ko</span></span>
            <span style="display:flex;gap:6px;">
                <button class="btn-small" style="background:#3498db;color:white;padding:4px 10px;border-radius:6px;" onclick="telechargerSauvegarde(${s.id})" title="Télécharger">⬇️</button>
                <button class="btn-small btn-delete" style="padding:4px 10px;border-radius:6px;" onclick="restaurerSauvegarde(${s.id})" title="Restaurer">🔄</button>
            </span>
        </div>`;
    });
    c.innerHTML = `<div style="display:grid;gap:6px;">${h}</div>`;
}

async function fetchSauvegarde(id) {
    const { data, error } = await sb.from('sauvegardes').select('donnees').eq('id', id).single();
    if (error || !data) { toastError('Erreur', error?.message || 'Sauvegarde introuvable.'); return null; }
    return data.donnees;
}

async function telechargerSauvegarde(id) {
    const donnees = await fetchSauvegarde(id);
    if (!donnees) return;
    const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stock-radar-auto-${String(donnees.date || '').split('T')[0] || 'sauvegarde'}.json`;
    a.click();
}

async function restaurerSauvegarde(id) {
    if (isAdmin && !viewingUserId) {
        return toastError('Restauration impossible', 'Sélectionnez un compte spécifique avant de restaurer.');
    }
    const uid = getEffectiveUserId();
    if (!uid) return toastError('Non connecté', 'Vous devez être connecté pour restaurer.');
    const donnees = await fetchSauvegarde(id);
    if (!donnees) return;

    const { presentes } = analyserBackup(donnees);
    if (!presentes.length) {
        return toastError('Sauvegarde inexploitable', "Cette sauvegarde ne contient aucune des 7 tables attendues. Rien n'a été modifié.");
    }

    const s = sauvegardesList.find(x => x.id === id);
    const d = s ? new Date(s.created_at).toLocaleString('fr-FR') : '?';
    const entete = `Restaurer la sauvegarde automatique du ${d} ?`;
    if (!await srConfirm(messageRestauration(donnees, entete), 'Restaurer la sauvegarde', true)) return;

    await executerRestauration(donnees, uid, backupNomCompte());
}

// ═══════ AIDE ACCORDÉON ═══════
function toggleHelp(header) {
    const body = header.nextElementSibling;
    const isOpen = header.classList.contains('open');
    header.classList.toggle('open');
    body.classList.toggle('open');
}

// ═══════ QUICK SCAN (MOBILE) ═══════
let quickScanReader = null;
let quickScanLastEAN = '';
let quickScanCooldown = false;
let quickScanHistory = [];

function openQuickScan() {
    stopAllScanners('quick');            // sinon le scanner "Nouveau produit" continue de remplir le formulaire
    const overlay = document.getElementById('quick-scan-overlay');
    overlay.classList.add('active');
    document.getElementById('quick-scan-result').textContent = 'Démarrage de la caméra...';
    document.getElementById('quick-scan-result').className = 'quick-scan-result';
    quickScanLastEAN = '';
    quickScanHistory = [];               // sinon on retrouve les scans de la session précédente
    const hist = document.getElementById('quick-scan-history');
    if (hist) hist.innerHTML = '';
    startQuickScanner();
}

function closeQuickScan() {
    stopQuickScanner();
    document.getElementById('quick-scan-overlay').classList.remove('active');
}

async function startQuickScanner() {
    if (typeof ZXing === 'undefined') {
        document.getElementById('quick-scan-result').textContent = '❌ Scanner non chargé. Vérifiez votre connexion internet.';
        document.getElementById('quick-scan-result').className = 'quick-scan-result ko';
        return;
    }
    if (quickScanReader) return;
    try {
        quickScanReader = new ZXing.BrowserMultiFormatReader();
        const video = document.getElementById('quick-scan-video');
        const devices = await quickScanReader.listVideoInputDevices();
        const back = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('arrière') || d.label.toLowerCase().includes('environment')) || devices[0];

        quickScanReader.decodeFromVideoDevice(back?.deviceId, 'quick-scan-video', (result) => {
            if (result && !quickScanCooldown) {
                const ean = result.getText();
                quickScanCooldown = true;
                setTimeout(() => { quickScanCooldown = false; }, 1500);

                quickScanLastEAN = ean;
                const existant = products.find(p => p.ean === ean && !p.vendu);
                const resultEl = document.getElementById('quick-scan-result');

                if (existant) {
                    playSound('doublon');
                    resultEl.textContent = '📦 En stock : ' + existant.nom + ' (qté: ' + existant.quantite + ')';
                    resultEl.className = 'quick-scan-result doublon';
                } else {
                    playSound('ok');
                    resultEl.textContent = '✅ Scanné : ' + ean + ' (pas en stock)';
                    resultEl.className = 'quick-scan-result ok';
                }

                // Vibrer si supporté
                if (navigator.vibrate) navigator.vibrate(100);

                // Historique
                quickScanHistory.unshift({
                    ean: ean,
                    nom: existant ? existant.nom : 'Nouveau',
                    enStock: !!existant,
                    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                });
                if (quickScanHistory.length > 10) quickScanHistory.pop();
                displayQuickScanHistory();
            }
        });

        document.getElementById('quick-scan-result').textContent = 'Pointez la caméra vers un code-barres...';
    } catch (e) {
        playSound('ko');
        stopQuickScanner();
        document.getElementById('quick-scan-result').textContent = '❌ Erreur caméra : ' + e.message;
        document.getElementById('quick-scan-result').className = 'quick-scan-result ko';
    }
}

function stopQuickScanner() {
    if (quickScanReader) { try { quickScanReader.reset(); } catch(e) {} quickScanReader = null; }
}

function displayQuickScanHistory() {
    const c = document.getElementById('quick-scan-history');
    if (!c || !quickScanHistory.length) return;
    c.innerHTML = quickScanHistory.map(h =>
        `<div class="quick-scan-history-item">
            <span>${h.enStock ? '📦' : '🆕'} ${h.ean} ${h.nom ? '— ' + h.nom : ''}</span>
            <span style="opacity:0.6;">${h.time}</span>
        </div>`
    ).join('');
}

function quickScanAction(action) {
    if (!quickScanLastEAN) return toastWarning('Scanner', `Scannez d'abord un code-barres.`);
    closeQuickScan();

    if (action === 'nouveau') {
        switchTab('nouveau-produit');
        document.getElementById('ean').value = quickScanLastEAN;
        checkPurchaseHistory();
    } else if (action === 'stock') {
        switchTab('stock');
        const input = document.getElementById('stock-search');
        if (input) {
            input.value = quickScanLastEAN;
            stockCurrentPage = 1;
            displayStock();
        }
    } else if (action === 'inventaire') {
        switchTab('inventaire');
        if (inventaireActif) {
            document.getElementById('inv-scan-ean').value = quickScanLastEAN;
            inventaireScanEAN();
        } else {
            // Avant : le code scanné était perdu sans le moindre message
            const champ = document.getElementById('inv-scan-ean');
            if (champ) champ.value = quickScanLastEAN;
            toastWarning('Aucun inventaire en cours', `Lancez « Nouvel inventaire » — le code ${quickScanLastEAN} est déjà prêt dans le champ de saisie.`);
        }
    }
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
    
    const cleanQuery = (query || '').trim();
    if (cleanQuery.length < 2) {
        dropdown.style.display = 'none';
        return;
    }

    searchTimeout = setTimeout(() => {
        const q = cleanQuery.toLowerCase();
        let results = [];
        
        // Chercher dans les produits
        products.filter(p => !p.vendu).forEach(p => {
            if ((p.nom||'').toLowerCase().includes(q) || (p.ean||'').toLowerCase().includes(q) || 
                (p.asin||'').toLowerCase().includes(q) ||
                (p.categorie||'').toLowerCase().includes(q) || (p.notes||'').toLowerCase().includes(q)) {
                results.push({ type: 'stock', id: p.id, nom: p.nom, detail: `EAN: ${p.ean||'-'}${p.asin ? ' · ASIN: '+p.asin : ''} · ${p.quantite||0} unités · ${(p.prix_revente||0).toFixed(2)}€`, badge: p.etat_stock || 'neuf' });
            }
        });
        
        // Chercher dans les achats
        achats.forEach(a => {
            if ((a.nom||'').toLowerCase().includes(q) || (a.ean||'').toLowerCase().includes(q) || 
                (a.asin||'').toLowerCase().includes(q) ||
                (a.fournisseur_nom||'').toLowerCase().includes(q)) {
                results.push({ type: 'achat', id: a.id, nom: a.nom, detail: `EAN: ${a.ean||'-'} · ASIN: ${a.asin||'-'} · ${a.fournisseur_nom||'?'} · ${(a.prix_ttc||0).toFixed(2)}€`, badge: a.recu ? 'Reçu' : 'Attente' });
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
            dropdown.innerHTML = '<div class="search-result-item" style="color:var(--text-secondary);">Aucun résultat pour "' + escapeHtml(cleanQuery) + '"</div>';
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
