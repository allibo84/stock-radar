// ═══════════════════════════════════════════════
// STOCK RADAR V2 - app-cloud.js
// ═══════════════════════════════════════════════

// sb est créé dans config.js
let fournisseurs = [], achats = [], products = [];
let currentPhotos = [], currentVenteProductId = null;
let activeStockView = 'all';
let charts = {};
let achatsFiltersInit = false, grossisteData = null;

// ═══════ DATA LOADING ═══════
async function loadAllData() {
    try {
        await Promise.all([
            loadFournisseurs().catch(e => console.warn('Fournisseurs:', e)),
            loadAchats().catch(e => console.warn('Achats:', e)),
            loadProducts().catch(e => console.warn('Produits:', e)),
        ]);
    } catch (e) { console.error('Erreur chargement:', e); }
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    updateDashboard();
    setupRealtimeSync();
}

async function loadFournisseurs() {
    const { data, error } = await sb.from('fournisseurs').select('*').order('nom');
    if (error) console.warn('Erreur fournisseurs:', error.message);
    fournisseurs = data || [];
    displayFournisseurs();
    updateFournisseursSelect();
}

async function loadAchats() {
    const { data, error } = await sb.from('achats').select('*').order('date_achat', { ascending: false });
    if (error) console.warn('Erreur achats:', error.message);
    achats = data || [];
    displayAchats();
    populateAchatsFilters();
    updateAchatsStats();
}

async function loadProducts() {
    const { data, error } = await sb.from('produits').select('*').order('date_ajout', { ascending: false });
    if (error) console.warn('Erreur produits:', error.message);
    products = (data || []).map(p => ({
        ...p,
        etat_stock: p.etat_stock || 'neuf',
        qte_fba: p.qte_fba || 0,
        qte_fbm: p.qte_fbm || 0,
        qte_entrepot: p.qte_entrepot || (p.quantite || 1),
        quantite: p.quantite || 1,
        amazon_fba: p.amazon_fba || false,
        amazon_fbm: p.amazon_fbm || false,
    }));
    displayStock();
    updateDashboard();
}

function setupRealtimeSync() {
    sb.channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'produits' }, () => loadProducts())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'achats' }, () => loadAchats())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fournisseurs' }, () => loadFournisseurs())
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
function displayFournisseurs() {
    const c = document.getElementById('fournisseurs-container');
    if (!c) return;
    if (!fournisseurs.length) { c.innerHTML = '<div class="empty-state"><h3>Aucun fournisseur</h3></div>'; return; }
    let h = '<div class="products-table"><table><thead><tr><th>Nom</th><th>Contact</th><th>Email</th><th>Tél</th><th>Actions</th></tr></thead><tbody>';
    fournisseurs.forEach(f => {
        h += `<tr><td><strong>${escapeHtml(f.nom)}</strong></td><td>${escapeHtml(f.contact||'')}</td><td>${escapeHtml(f.email||'')}</td><td>${escapeHtml(f.tel||'')}</td><td><button class="btn-small btn-delete" onclick="deleteFournisseur(${f.id})">🗑️</button></td></tr>`;
    });
    c.innerHTML = h + '</tbody></table></div>';
}

document.getElementById('fournisseur-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const f = { nom: document.getElementById('f-nom').value.trim(), contact: document.getElementById('f-contact').value.trim(), email: document.getElementById('f-email').value.trim(), tel: document.getElementById('f-tel').value.trim(), adresse: document.getElementById('f-adresse').value.trim(), notes: document.getElementById('f-notes').value.trim() };
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
    if (ttcEl) ttcEl.value = (ht * 1.20).toFixed(2);
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
    const found = achats.filter(a => a.ean === ean);
    if (found.length) {
        const last = found[0];
        infoEl.style.display = 'block';
        infoText.textContent = `Déjà acheté : ${last.nom} — ${(last.prix_ttc||0).toFixed(2)}€ TTC chez ${last.fournisseur_nom||'?'}`;
        if (!document.getElementById('product-name').value) document.getElementById('product-name').value = last.nom;
        if (!document.getElementById('categorie').value && last.categorie) document.getElementById('categorie').value = last.categorie;
    } else { infoEl.style.display = 'none'; }
}

let codeReader = null;
async function startScanner() {
    try {
        codeReader = new ZXing.BrowserMultiFormatReader();
        const video = document.getElementById('video');
        video.style.display = 'block';
        document.getElementById('stop-scanner').style.display = 'inline-flex';
        const devices = await codeReader.listVideoInputDevices();
        const back = devices.find(d => d.label.toLowerCase().includes('back')) || devices[0];
        codeReader.decodeFromVideoDevice(back?.deviceId, 'video', (result) => {
            if (result) {
                document.getElementById('ean').value = result.getText();
                checkPurchaseHistory();
                stopScanner();
            }
        });
    } catch (e) { alert('Erreur caméra: ' + e.message); }
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
    // Show FBA/FBM filter only on neuf
    const canalFilter = document.getElementById('stock-filter-canal');
    if (canalFilter) canalFilter.style.display = (view === 'neuf') ? 'block' : 'none';
    displayStock();
}

function getFilteredStock() {
    const search = (document.getElementById('stock-search')?.value || '').toLowerCase();
    const sort = document.getElementById('stock-sort')?.value || 'date-desc';
    const canal = document.getElementById('stock-filter-canal')?.value || '';
    const cat = document.getElementById('stock-filter-cat')?.value || '';

    let list = products.filter(p => !p.vendu);

    // Filtre sous-catégorie
    if (activeStockView === 'neuf') list = list.filter(p => (p.etat_stock || 'neuf') === 'neuf' && !p.invendable);
    else if (activeStockView === 'occasion') list = list.filter(p => (p.etat_stock || '') === 'occasion' && !p.invendable);
    else if (activeStockView === 'entrepot') list = list.filter(p => (p.qte_entrepot || 0) > 0 && !p.invendable);
    else if (activeStockView === 'rebut') list = list.filter(p => (p.etat_stock || '') === 'rebut' || p.invendable);
    // 'all' = tout non-vendu

    // Recherche
    if (search) list = list.filter(p => (p.nom||'').toLowerCase().includes(search) || (p.ean||'').toLowerCase().includes(search));

    // Canal FBA/FBM
    if (canal === 'fba') list = list.filter(p => (p.qte_fba || 0) > 0);
    else if (canal === 'fbm') list = list.filter(p => (p.qte_fbm || 0) > 0);

    // Catégorie
    if (cat) list = list.filter(p => p.categorie === cat);

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
            default: return 0;
        }
    });
    return list;
}

function displayStock() {
    const c = document.getElementById('stock-container');
    if (!c) return;

    // Populate categories
    const catSel = document.getElementById('stock-filter-cat');
    if (catSel) {
        const cats = [...new Set(products.map(p => p.categorie).filter(Boolean))];
        const cur = catSel.value;
        catSel.innerHTML = '<option value="">Toutes catégories</option>';
        cats.forEach(cat => catSel.innerHTML += `<option value="${cat}">${cat}</option>`);
        catSel.value = cur;
    }

    const list = getFilteredStock();

    // Stats
    const totalQte = list.reduce((s, p) => s + (p.quantite || 0), 0);
    const valeur = list.reduce((s, p) => s + ((p.prix_revente || 0) * (p.quantite || 0)), 0);
    const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    el('stock-total', list.length);
    el('stock-qte-total', totalQte);
    el('stock-valeur', valeur.toFixed(2) + '€');
    el('stock-prix-moy', list.length ? (valeur / totalQte).toFixed(2) + '€' : '0€');

    if (!list.length) { c.innerHTML = '<div class="empty-state"><h3>Aucun produit</h3><p>Ajoutez des produits depuis le menu</p></div>'; return; }

    let h = '<div class="products-table"><table><thead><tr><th>Date</th><th>EAN</th><th>Produit</th><th>Cat.</th><th>Type</th>';
    if (activeStockView === 'neuf' || activeStockView === 'all') h += '<th>FBA</th><th>FBM</th>';
    h += '<th>Entrepôt</th><th>Total</th><th>Achat</th><th>Revente</th><th>Actions</th></tr></thead><tbody>';

    list.forEach(p => {
        const date = p.date_ajout ? new Date(p.date_ajout).toLocaleDateString('fr-FR') : '-';
        const typeBadge = p.invendable ? '<span class="badge badge-rebut">Rebut</span>'
            : (p.etat_stock === 'occasion') ? '<span class="badge badge-occasion">Occasion</span>'
            : (p.etat_stock === 'rebut') ? '<span class="badge badge-rebut">Rebut</span>'
            : '<span class="badge badge-neuf">Neuf</span>';

        h += `<tr style="cursor:pointer" onclick="openProductModal(${p.id})">
            <td>${date}</td>
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
        ${p.notes ? `<div class="detail-item" style="margin-bottom:15px;"><div class="detail-label">Notes</div><div class="detail-value">${escapeHtml(p.notes)}</div></div>` : ''}
        ${photos}
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;">
            <button class="scan-button" onclick="openVenteModal(${p.id}); closeProductModal();">💰 Vendre</button>
            ${p.vinted ? `<button class="scan-button" style="background:#00b4b6;" onclick="generateAnnonce(${p.id},'vinted')">Vinted</button>` : ''}
            ${p.leboncoin ? `<button class="scan-button" style="background:#f56b2a;" onclick="generateAnnonce(${p.id},'leboncoin')">Leboncoin</button>` : ''}
            <button class="scan-button danger" onclick="deleteProduct(${p.id}); closeProductModal();">🗑️ Supprimer</button>
        </div>
    `;
    document.getElementById('product-modal').style.display = 'block';
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
    el('dash-valeur-stock', enStock.reduce((s,p) => s + ((p.prix_revente||0)*(p.quantite||0)), 0).toFixed(2) + '€');

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

// ═══════ INIT ═══════
if (localStorage.getItem('darkMode') === 'true') { document.body.classList.add('dark-theme'); }
updateDarkModeIcon();
const dateEl = document.getElementById('a-date');
if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
