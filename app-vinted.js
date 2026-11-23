// ═══════════════════════════════════════════════════════════════════
// STOCK RADAR — Vinted / Leboncoin
// Liste de travail des articles à revendre : à mettre en ligne → en ligne → vendu.
// Un retour remis en stock « Vinted » arrive ici tout seul ; un produit marqué Vinted
// ou Leboncoin sur sa fiche peut y être ajouté d'un clic.
// La vente crée la ligne dans « Mes ventes », retire le stock du local et de l'étagère.
// ═══════════════════════════════════════════════════════════════════

let annonces = [], annoncesTableAbsente = false, annoncesCanal = '';
const POURCENT_CONSEIL = { neuf: 0.60, abime: 0.40 };

async function loadAnnonces() {
    const uid = getUserFilter();
    let q = sb.from('annonces').select('*').order('created_at', { ascending: false }).limit(5000);
    if (uid) q = q.eq('user_id', uid);
    const { data, error } = await q;
    annoncesTableAbsente = !!error;
    annonces = data || [];
    if (document.getElementById('vinted')?.classList.contains('active')) displayVinted();
}

// Prix Amazon de référence : prix de revente de la fiche, sinon dernière vente Amazon de ce produit
function prixReference(p) {
    if (!p) return 0;
    if (p.prix_revente > 0) return p.prix_revente;
    const v = ventes.filter(x => x.produit_id === p.id && String(x.canal || '').startsWith('Amazon') && x.prix_unitaire > 0)
        .sort((a, b) => String(b.date_vente || '').localeCompare(String(a.date_vente || '')))[0];
    return v ? v.prix_unitaire : 0;
}
function prixConseille(p, etat) {
    const ref = prixReference(p);
    return ref > 0 ? Math.round(ref * (POURCENT_CONSEIL[etat] || 0.6)) : 0;
}

// Création d'une annonce (appelée aussi par « Remettre en stock » des retours)
async function creerAnnonce(produitId, { canal = 'Vinted', etat = 'neuf', quantite = 1, retourId = null, silencieux = false } = {}) {
    if (annoncesTableAbsente) { if (!silencieux) toastWarning('Migration à exécuter', 'Exécutez migration-annonces.sql dans Supabase.'); return null; }
    const p = products.find(x => x.id === produitId);
    const a = { user_id: getEffectiveUserId(), produit_id: produitId, retour_id: retourId, canal, etat, quantite, statut: 'a_mettre', prix_conseille: prixConseille(p, etat) };
    const { data, error } = await sb.from('annonces').insert([a]).select('*').single();
    if (error) { if (!silencieux) toastError('Annonce non créée', error.message); return null; }
    annonces.unshift(data);
    if (!silencieux) { toastSuccess('Ajouté à Vinted / Leboncoin', `${p?.nom || 'Produit'} est dans « À mettre en ligne ».`); displayVinted(); }
    return data;
}

function setAnnoncesCanal(v) { annoncesCanal = v; displayVinted(); }

function carteAnnonce(a) {
    const p = products.find(x => x.id === a.produit_id);
    const nom = escapeHtml(p?.nom || 'Produit supprimé');
    const jours = a.date_en_ligne ? Math.floor((Date.now() - new Date(a.date_en_ligne + 'T12:00:00')) / 86400000) : 0;
    const etag = typeof chipsRangement === 'function' && p ? chipsRangement(p.id, '<span class="sous-prix">pas rangé</span>') : '';
    let bas = '';
    if (a.statut === 'a_mettre') bas = `<div class="sous-prix">Prix conseillé : <strong>${a.prix_conseille ? fmtEur(a.prix_conseille) : '–'}</strong>${a.prix_conseille ? ` (${Math.round(POURCENT_CONSEIL[a.etat] * 100)} % du prix Amazon)` : ''}</div>
        <div class="annonce-actions"><button type="button" class="pill-btn" onclick="openAnnonce(${a.id},'en_ligne')">Mettre en ligne</button><button type="button" class="pill-btn" onclick="openAnnonce(${a.id},'vendu')">Vendu</button></div>`;
    else if (a.statut === 'en_ligne') bas = `<div class="sous-prix">${fmtEur(a.prix_annonce)} · en ligne depuis ${jours} j${jours >= 21 ? ' <span class="pill pill-warn">baisser le prix ?</span>' : ''}</div>
        <div class="annonce-actions">${a.lien ? `<a class="pill-btn" href="${escapeHtml(a.lien)}" target="_blank" rel="noopener">Annonce</a>` : ''}<button type="button" class="pill-btn" onclick="openAnnonce(${a.id},'en_ligne')">Modifier</button><button type="button" class="pill-btn" onclick="openAnnonce(${a.id},'vendu')">Vendu</button></div>`;
    else bas = `<div class="sous-prix">Vendu ${fmtEur(a.prix_vente)} le ${a.date_vente ? new Date(a.date_vente + 'T12:00:00').toLocaleDateString('fr-FR') : '-'}</div>`;
    return `<div class="annonce-carte">
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;"><span class="pill ${a.canal === 'Leboncoin' ? 'pill-warn' : 'pill-info'}">${escapeHtml(a.canal)}</span><span class="pill ${a.etat === 'abime' ? 'pill-danger' : 'pill-ok'}">${a.etat === 'abime' ? 'Abîmé' : 'Neuf'}</span>${a.retour_id ? '<span class="pill pill-neutre">Retour client</span>' : ''}${a.quantite > 1 ? `<span class="pill pill-neutre">× ${a.quantite}</span>` : ''}</div>
        <div class="achat-nom">${nom}</div>
        ${p?.ean ? `<div class="achat-codes"><span class="code-copiable">${boutonCopier(p.ean, 'EAN')}<span class="code-lib">EAN</span><span>${escapeHtml(p.ean)}</span></span></div>` : ''}
        <div style="margin:4px 0;">${etag}</div>
        ${bas}
    </div>`;
}

function displayVinted() {
    const c = document.getElementById('vinted-container');
    if (!c) return;
    if (annoncesTableAbsente) { c.innerHTML = '<div class="retours-aide" style="display:block;">Exécutez <strong>migration-annonces.sql</strong> dans Supabase (SQL Editor), puis rechargez la page.</div>'; return; }
    const liste = annonces.filter(a => a.statut !== 'retire' && (!annoncesCanal || a.canal === annoncesCanal));
    const col = (s) => liste.filter(a => a.statut === s);
    const moisDebut = dateLocaleISO(new Date()).slice(0, 8) + '01';
    const venduMois = liste.filter(a => a.statut === 'vendu' && String(a.date_vente || '') >= moisDebut);
    const enAttente = [...col('a_mettre'), ...col('en_ligne')];
    const valeur = enAttente.reduce((s, a) => s + ((a.statut === 'en_ligne' ? a.prix_annonce : a.prix_conseille) || 0) * (a.quantite || 1), 0);
    document.getElementById('vinted-canal').innerHTML = pastillesHtml([['', 'Tous'], ['Vinted', 'Vinted'], ['Leboncoin', 'Leboncoin']], annoncesCanal, 'setAnnoncesCanal');
    // Produits marqués Vinted / Leboncoin, avec du stock au local, sans annonce en cours
    const actifs = new Set(annonces.filter(a => a.statut === 'a_mettre' || a.statut === 'en_ligne').map(a => a.produit_id));
    const sansAnnonce = products.filter(p => (p.vinted || p.leboncoin) && !p.vendu && ((p.qte_entrepot || 0) + (p.qte_fbm || 0)) > 0 && !actifs.has(p.id));
    const vendus = col('vendu').sort((a, b) => String(b.date_vente || '').localeCompare(String(a.date_vente || ''))).slice(0, 30);
    c.innerHTML = `
        <div class="retours-bilan">
            <div><span>À mettre en ligne</span><strong>${col('a_mettre').length}</strong></div>
            <div><span>En ligne</span><strong>${col('en_ligne').length}</strong><small>${col('en_ligne').filter(a => a.date_en_ligne && (Date.now() - new Date(a.date_en_ligne)) / 86400000 >= 21).length} depuis plus de 3 semaines</small></div>
            <div><span>Valeur en attente</span><strong>${fmtEur(valeur)}</strong><small>prix affichés ou conseillés</small></div>
            <div><span>Vendu ce mois-ci</span><strong class="pos">${fmtEur(venduMois.reduce((s, a) => s + (a.prix_vente || 0), 0))}</strong><small>${venduMois.length} article(s)</small></div>
        </div>
        <div class="annonces-colonnes">
            <div class="annonces-col"><h3>À mettre en ligne · ${col('a_mettre').length}</h3>${col('a_mettre').map(carteAnnonce).join('') || '<p class="sous-prix">Rien à mettre en ligne.</p>'}</div>
            <div class="annonces-col"><h3>En ligne · ${col('en_ligne').length}</h3>${col('en_ligne').sort((a, b) => String(a.date_en_ligne || '').localeCompare(String(b.date_en_ligne || ''))).map(carteAnnonce).join('') || '<p class="sous-prix">Aucune annonce en ligne.</p>'}</div>
            <div class="annonces-col"><h3>Vendu (récents)</h3>${vendus.map(carteAnnonce).join('') || '<p class="sous-prix">Aucune vente.</p>'}</div>
        </div>
        ${sansAnnonce.length ? `<h3 style="font-size:15px;margin:22px 0 6px;">Produits marqués Vinted / Leboncoin sans annonce (${sansAnnonce.length})</h3>
        <div class="products-table"><table class="achats-table"><tbody>${sansAnnonce.slice(0, 100).map(p => `<tr style="cursor:default;"><td><div class="achat-nom">${escapeHtml(p.nom || '-')}</div><div class="sous-prix">${escapeHtml(p.ean || '')} · ${(p.qte_entrepot || 0) + (p.qte_fbm || 0)} u. au local</div></td><td style="text-align:right;white-space:nowrap;"><button type="button" class="pill-btn" onclick="creerAnnonce(${p.id},{canal:'${p.leboncoin && !p.vinted ? 'Leboncoin' : 'Vinted'}'})">Ajouter</button></td></tr>`).join('')}</tbody></table></div>` : ''}`;
}

// Tiroir : mettre en ligne / modifier, ou vendre
function openAnnonce(id, action) {
    const a = annonces.find(x => x.id === id);
    if (!a) return;
    const p = products.find(x => x.id === a.produit_id);
    document.getElementById('sr-annonce')?.remove();
    const m = document.createElement('div');
    m.id = 'sr-annonce';
    m.className = 'sr-tiroir';
    const titre = action === 'vendu' ? 'Article vendu' : (a.statut === 'en_ligne' ? 'Modifier l\'annonce' : 'Mettre en ligne');
    m.innerHTML = `<div role="dialog" aria-modal="true" aria-label="${titre}" class="sr-tiroir-panneau">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div><div class="tiroir-sur">${escapeHtml(a.canal)}</div><div class="tiroir-titre">${escapeHtml(p?.nom || '')}</div></div>
            <button type="button" class="ico-btn ico-voir" onclick="document.getElementById('sr-annonce').remove()" aria-label="Fermer">${ICO('<path d="M6 6l12 12M18 6L6 18"/>')}</button>
        </div>
        <h3 style="font-size:15px;margin:12px 0 8px;">${titre}</h3>
        <div class="devenir-revente" style="display:flex;">
            <label>Site <select id="ann-canal" class="search-input"><option ${a.canal === 'Vinted' ? 'selected' : ''}>Vinted</option><option ${a.canal === 'Leboncoin' ? 'selected' : ''}>Leboncoin</option></select></label>
            ${action === 'vendu' ? `
            <label>Prix encaissé (€) <input type="number" id="ann-prix" class="search-input" min="0" step="0.01" inputmode="decimal" value="${a.prix_annonce || a.prix_conseille || ''}"></label>
            <label>Frais (port payé, commission…) (€) <input type="number" id="ann-frais" class="search-input" min="0" step="0.01" inputmode="decimal" value="0"></label>
            <label>Date de vente <input type="date" id="ann-date" class="search-input" value="${dateLocaleISO(new Date())}"></label>
            <p class="sous-prix">La vente est ajoutée à « Mes ventes », l'unité est retirée du stock au local et de son étagère.</p>` : `
            <label>État <select id="ann-etat" class="search-input"><option value="neuf" ${a.etat === 'neuf' ? 'selected' : ''}>Neuf</option><option value="abime" ${a.etat === 'abime' ? 'selected' : ''}>Abîmé / incomplet</option></select></label>
            <label>Prix affiché (€) <input type="number" id="ann-prix" class="search-input" min="0" step="0.01" inputmode="decimal" value="${a.prix_annonce || a.prix_conseille || ''}"><small class="sous-prix">Conseillé : ${a.prix_conseille ? fmtEur(a.prix_conseille) : 'prix Amazon inconnu'}</small></label>
            <label>Lien de l'annonce (facultatif) <input type="url" id="ann-lien" class="search-input" value="${escapeHtml(a.lien || '')}" placeholder="https://www.vinted.fr/items/…"></label>`}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:14px;">
            <button type="button" class="scan-button" id="ann-ok" onclick="${action === 'vendu' ? `vendreAnnonce(${a.id})` : `mettreEnLigne(${a.id})`}">${action === 'vendu' ? 'Enregistrer la vente' : 'Enregistrer'}</button>
            ${action !== 'vendu' ? `<button type="button" class="scan-button export" onclick="retirerAnnonce(${a.id})" title="Ne plus le vendre sur ces sites (le stock ne change pas)">Retirer de la liste</button>` : ''}
            <button type="button" class="scan-button export" onclick="document.getElementById('sr-annonce').remove()">Annuler</button>
        </div>
    </div>`;
    m.addEventListener('click', (e) => { if (e.target === m) m.remove(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(m);
}

async function majAnnonce(a, maj) {
    const { error } = await sb.from('annonces').update(maj).eq('id', a.id);
    if (error) { toastError('Enregistrement impossible', error.message); return false; }
    Object.assign(a, maj);
    return true;
}
async function mettreEnLigne(id) {
    const a = annonces.find(x => x.id === id);
    if (!a) return;
    const prix = parseFloat(String(document.getElementById('ann-prix')?.value || '').replace(',', '.')) || 0;
    if (!(prix > 0)) return toastError('Prix manquant', 'Indiquez le prix affiché sur l\'annonce.');
    const etat = document.getElementById('ann-etat')?.value || a.etat;
    const p = products.find(x => x.id === a.produit_id);
    const maj = { canal: document.getElementById('ann-canal')?.value || a.canal, etat, prix_annonce: prix, lien: (document.getElementById('ann-lien')?.value || '').trim(), statut: 'en_ligne', date_en_ligne: a.date_en_ligne || dateLocaleISO(new Date()), prix_conseille: prixConseille(p, etat) || a.prix_conseille };
    if (!await majAnnonce(a, maj)) return;
    document.getElementById('sr-annonce')?.remove();
    toastSuccess('Annonce en ligne', `${p?.nom || ''} · ${fmtEur(prix)} sur ${maj.canal}`);
    displayVinted();
}
async function retirerAnnonce(id) {
    const a = annonces.find(x => x.id === id);
    if (!a || !await srConfirm('Retirer cet article de la liste Vinted / Leboncoin ?\n\nLe stock ne change pas.', 'Retirer')) return;
    if (!await majAnnonce(a, { statut: 'retire' })) return;
    document.getElementById('sr-annonce')?.remove();
    displayVinted();
}
async function vendreAnnonce(id) {
    const a = annonces.find(x => x.id === id);
    if (!a) return;
    const p = products.find(x => x.id === a.produit_id);
    if (!p) return toastError('Fiche introuvable', 'Le produit de cette annonce n\'existe plus.');
    const prix = parseFloat(String(document.getElementById('ann-prix')?.value || '').replace(',', '.'));
    if (!(prix >= 0)) return toastError('Prix manquant', 'Indiquez le prix encaissé.');
    const frais = parseFloat(String(document.getElementById('ann-frais')?.value || '0').replace(',', '.')) || 0;
    const canal = document.getElementById('ann-canal')?.value || a.canal;
    const date = document.getElementById('ann-date')?.value || dateLocaleISO(new Date());
    const q = a.quantite || 1;
    const btn = document.getElementById('ann-ok');
    if (btn) btn.disabled = true;
    try {
        const pa = p.prix_achat || 0;
        const vente = {
            user_id: getEffectiveUserId(), produit_id: p.id, produit_ean: p.ean || '', produit_nom: p.nom || '', canal,
            quantite: q, prix_unitaire: +(prix / q).toFixed(2), prix_total: +prix.toFixed(2), prix_achat_unitaire: pa, frais: +frais.toFixed(2),
            benefice: pa > 0 ? +(prix - pa * q - frais).toFixed(2) : 0, date_vente: date,
            notes: `Vente ${canal}${a.retour_id ? ' · retour client remis en vente' : ''}`,
        };
        const { data: v, error } = await sb.from('ventes').insert([vente]).select('*').single();
        if (error) return toastError('Vente non enregistrée', error.message);
        ventes.unshift(v);
        // Stock : on retire du local (entrepôt d'abord, puis FBM)
        let reste = q;
        const maj = { qte_entrepot: p.qte_entrepot || 0, qte_fbm: p.qte_fbm || 0 };
        for (const k of ['qte_entrepot', 'qte_fbm']) { const t = Math.min(maj[k], reste); maj[k] -= t; reste -= t; }
        maj.quantite = (p.qte_fba || 0) + maj.qte_entrepot + maj.qte_fbm;
        const { error: e2 } = await sb.from('produits').update(maj).eq('id', p.id);
        if (e2) toastWarning('Vente enregistrée, stock non modifié', e2.message);
        else Object.assign(p, maj);
        // Journal (retire aussi l'unité de son étagère et indique où la prendre)
        await logMouvement(p.id, 'vente', q, 'entrepot', 'vendu', `Vente ${canal} — ${fmtEur(prix)}`, '');
        await majAnnonce(a, { statut: 'vendu', canal, prix_vente: +prix.toFixed(2), date_vente: date, vente_id: v.id });
        if (a.retour_id) {
            const r = (typeof retours !== 'undefined' ? retours : []).find(x => x.id === a.retour_id);
            const note = `${r?.note_devenir ? r.note_devenir + ' · ' : ''}vendu sur ${canal} ${fmtEur(prix)} le ${new Date(date + 'T12:00:00').toLocaleDateString('fr-FR')}`;
            const { error: e3 } = await sb.from('retours').update({ note_devenir: note, canal_revente: canal }).eq('id', a.retour_id);
            if (!e3 && r) Object.assign(r, { note_devenir: note, canal_revente: canal });
        }
        document.getElementById('sr-annonce')?.remove();
        toastSuccess('Vente enregistrée', `${p.nom} · ${fmtEur(prix)} sur ${canal}`);
        displayVinted();
        if (typeof displayVentes === 'function') displayVentes();
        if (typeof displayStock === 'function') displayStock();
        if (typeof updateDashboard === 'function') updateDashboard();
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Ligne « À faire » de l'accueil
function lignesAFaireVinted(ligne) {
    try {
        const n = annonces.filter(a => a.statut === 'a_mettre').length;
        if (n) ligne(n, 'warn', `Article${n > 1 ? 's' : ''} à mettre en ligne sur Vinted / Leboncoin`, 'Prenez les photos et publiez l\'annonce', 'Voir', "switchTab('vinted')");
        const vieux = annonces.filter(a => a.statut === 'en_ligne' && a.date_en_ligne && (Date.now() - new Date(a.date_en_ligne)) / 86400000 >= 21).length;
        if (vieux) ligne(vieux, 'warn', `Annonce${vieux > 1 ? 's' : ''} en ligne depuis plus de 3 semaines`, 'Baissez le prix ou republiez', 'Voir', "switchTab('vinted')");
    } catch (e) { console.warn('À faire (Vinted):', e); }
}
