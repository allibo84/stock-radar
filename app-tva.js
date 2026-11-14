// ═══════════════════════════════════════════════════════════════════
// STOCK RADAR — TVA à reverser par pays de vente
// Estimation : prix de vente TTC × taux / (1 + taux), moins la TVA des remboursements clients.
// Le pays est celui de la place de marché Amazon (amazon.de → Allemagne…) ;
// les ventes hors Amazon (Vinted, Leboncoin, saisie manuelle) sont comptées en France.
// ═══════════════════════════════════════════════════════════════════

const TVA_PAYS = {
    FR: ['France', 20], DE: ['Allemagne', 19], IT: ['Italie', 22], ES: ['Espagne', 21], NL: ['Pays-Bas', 21],
    BE: ['Belgique', 21], PL: ['Pologne', 23], SE: ['Suède', 25], IE: ['Irlande', 23], UK: ['Royaume-Uni', 20],
};
let tvaPeriode = '';

function tauxTva(code) {
    try {
        const perso = JSON.parse(localStorage.getItem('sr-tva-taux') || '{}');
        if (perso[code] != null && !isNaN(perso[code])) return Number(perso[code]);
    } catch (e) { /* stockage indisponible : taux standard */ }
    return TVA_PAYS[code] ? TVA_PAYS[code][1] : 20;
}
function setTauxTva(code, valeur) {
    const v = parseFloat(String(valeur).replace(',', '.'));
    try {
        const perso = JSON.parse(localStorage.getItem('sr-tva-taux') || '{}');
        if (isNaN(v) || v === (TVA_PAYS[code] || [])[1]) delete perso[code]; else perso[code] = v;
        localStorage.setItem('sr-tva-taux', JSON.stringify(perso));
    } catch (e) { /* tant pis : le taux vaut pour cet affichage seulement */ }
    displayTva();
}

// Pays de TVA d'une vente : place de marché Amazon, sinon France
function paysTvaVente(v) {
    const c = typeof paysDeMarketplace === 'function' ? paysDeMarketplace(v.marketplace) : '';
    if (c) return c;
    return String(v.canal || '').startsWith('Amazon') && !v.marketplace ? 'FR?' : 'FR';
}

// Périodes proposées : mois, trimestres et années des ventes présentes
function periodesTva() {
    const mois = new Set();
    ventes.forEach(v => { const m = String(v.date_vente || '').slice(0, 7); if (m) mois.add(m); });
    const tri = [...mois].sort().reverse();
    const out = [];
    const annees = [...new Set(tri.map(m => m.slice(0, 4)))];
    annees.forEach(a => {
        out.push(['A' + a, 'Année ' + a]);
        [4, 3, 2, 1].forEach(t => { if (tri.some(m => m.startsWith(a) && Math.ceil(+m.slice(5) / 3) === t)) out.push([`T${a}-${t}`, `${t}${t === 1 ? 'er' : 'e'} trimestre ${a}`]); });
        tri.filter(m => m.startsWith(a)).forEach(m => out.push(['M' + m, new Date(+a, +m.slice(5) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })]));
    });
    return out;
}
function bornesTva(code) {
    if (code.startsWith('A')) { const a = code.slice(1); return [a + '-01-01', a + '-12-31']; }
    if (code.startsWith('T')) {
        const [a, t] = code.slice(1).split('-').map(Number);
        const fin = new Date(a, t * 3, 0);
        return [`${a}-${String(t * 3 - 2).padStart(2, '0')}-01`, dateLocaleISO(fin)];
    }
    const [a, m] = code.slice(1).split('-').map(Number);
    return [`${a}-${String(m).padStart(2, '0')}-01`, dateLocaleISO(new Date(a, m, 0))];
}
function trimestreEnCours() {
    const d = new Date();
    return `T${d.getFullYear()}-${Math.ceil((d.getMonth() + 1) / 3)}`;
}

function calculTva(debut, fin) {
    const lignes = {};
    const ligne = (code) => lignes[code] = lignes[code] || { code, ventesTtc: 0, nb: 0, rembTtc: 0, nbRemb: 0, parMois: {} };
    ventes.forEach(v => {
        const d = String(v.date_vente || '').slice(0, 10);
        if (!d || d < debut || d > fin) return;
        const x = ligne(paysTvaVente(v));
        x.ventesTtc += Number(v.prix_total) || 0; x.nb++;
        const m = d.slice(0, 7); x.parMois[m] = (x.parMois[m] || 0) + (Number(v.prix_total) || 0);
    });
    retours.forEach(r => {
        const d = String(r.date_retour || '').slice(0, 10);
        if (!d || d < debut || d > fin) return;
        const c = (typeof paysDeMarketplace === 'function' ? paysDeMarketplace(r.marketplace) : '') || 'FR';
        const x = ligne(c);
        const montant = Math.abs(Number(r.montant_produit) || 0);
        x.rembTtc += montant; x.nbRemb++;
        const m = d.slice(0, 7); x.parMois[m] = (x.parMois[m] || 0) - montant;
    });
    return Object.values(lignes).map(x => {
        const code = x.code === 'FR?' ? 'FR' : x.code;
        const t = tauxTva(code) / 100;
        const baseTtc = x.ventesTtc - x.rembTtc;
        const tva = baseTtc * t / (1 + t);
        const parMoisTva = {};
        Object.entries(x.parMois).forEach(([m, ttc]) => { parMoisTva[m] = ttc * t / (1 + t); });
        return { ...x, codeTaux: code, taux: t * 100, baseHt: baseTtc - tva, tva, parMoisTva };
    }).sort((a, b) => b.tva - a.tva);
}

function displayTva() {
    const c = document.getElementById('tva-container');
    if (!c) return;
    const periodes = periodesTva();
    if (!tvaPeriode || !periodes.some(p => p[0] === tvaPeriode)) tvaPeriode = periodes.some(p => p[0] === trimestreEnCours()) ? trimestreEnCours() : (periodes[0] || [''])[0];
    const sel = document.getElementById('tva-periode');
    if (sel) sel.innerHTML = periodes.map(([v, l]) => `<option value="${v}" ${v === tvaPeriode ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
    if (!tvaPeriode) { c.innerHTML = '<div class="empty-state"><h3>Aucune vente</h3></div>'; return; }
    const [debut, fin] = bornesTva(tvaPeriode);
    const lignes = calculTva(debut, fin);
    const total = lignes.reduce((s, x) => s + x.tva, 0);
    const ttc = lignes.reduce((s, x) => s + x.ventesTtc - x.rembTtc, 0);
    const resume = document.getElementById('tva-resume');
    if (resume) resume.textContent = `Du ${new Date(debut + 'T12:00:00').toLocaleDateString('fr-FR')} au ${new Date(fin + 'T12:00:00').toLocaleDateString('fr-FR')} · ${fmtEur(ttc)} encaissés TTC (remboursements déduits) · TVA estimée : ${fmtEur(total)}`;
    const nomPays = (code) => code === 'FR?' ? 'France ?' : (TVA_PAYS[code] ? TVA_PAYS[code][0] : code);
    let h = `<div class="products-table"><table class="achats-table tva-table"><thead><tr><th>Pays</th><th class="num">Taux</th><th class="num">Ventes TTC</th><th class="num">Remboursements TTC</th><th class="num">Base HT</th><th class="num">TVA à reverser</th></tr></thead><tbody>`;
    lignes.forEach(x => {
        const perso = x.taux !== (TVA_PAYS[x.codeTaux] || [])[1];
        h += `<tr style="cursor:default;">
            <td data-l="Pays"><strong>${escapeHtml(nomPays(x.code))}</strong>${x.code === 'FR?' ? '<div class="sous-prix">ventes Amazon sans pays connu, comptées au taux français</div>' : ''}${x.code === 'FR' ? '<div class="sous-prix">amazon.fr + Vinted, Leboncoin et ventes saisies à la main</div>' : ''}</td>
            <td class="num" data-l="Taux"><input type="number" class="tva-taux${perso ? ' perso' : ''}" value="${x.taux}" min="0" max="30" step="0.1" aria-label="Taux de TVA ${escapeHtml(nomPays(x.code))}" title="${perso ? 'Taux modifié par vous' : 'Taux normal du pays'}" onchange="setTauxTva('${x.codeTaux}', this.value)"> %</td>
            <td class="num" data-l="Ventes TTC">${fmtEur(x.ventesTtc)}<div class="sous-prix">${x.nb} vente(s)</div></td>
            <td class="num" data-l="Remboursements">${x.rembTtc ? '−' + fmtEur(x.rembTtc) : '–'}${x.nbRemb ? `<div class="sous-prix">${x.nbRemb} retour(s)</div>` : ''}</td>
            <td class="num" data-l="Base HT">${fmtEur(x.baseHt)}</td>
            <td class="num" data-l="TVA" style="font-weight:700;">${fmtEur(x.tva)}</td>
        </tr>`;
    });
    h += `<tr class="tva-total"><td colspan="5"><strong>Total</strong></td><td class="num"><strong>${fmtEur(total)}</strong></td></tr></tbody></table></div>`;

    // Détail par mois (utile pour les déclarations mensuelles)
    const mois = [...new Set(lignes.flatMap(x => Object.keys(x.parMoisTva)))].sort();
    if (mois.length > 1) {
        h += `<h3 style="margin:22px 0 8px;font-size:15px;">TVA par mois</h3><div class="products-table"><table class="achats-table"><thead><tr><th>Pays</th>${mois.map(m => `<th class="num">${new Date(+m.slice(0, 4), +m.slice(5) - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}</th>`).join('')}</tr></thead><tbody>`;
        lignes.forEach(x => { h += `<tr style="cursor:default;"><td>${escapeHtml(nomPays(x.code))}</td>${mois.map(m => `<td class="num">${x.parMoisTva[m] ? fmtEur(x.parMoisTva[m]) : '–'}</td>`).join('')}</tr>`; });
        h += `<tr class="tva-total"><td><strong>Total</strong></td>${mois.map(m => `<td class="num"><strong>${fmtEur(lignes.reduce((s, x) => s + (x.parMoisTva[m] || 0), 0))}</strong></td>`).join('')}</tr></tbody></table></div>`;
    }
    h += `<div class="retours-aide" style="display:block;margin-top:18px;">
        <strong>À vérifier avec votre comptable</strong> — c'est une estimation à partir des prix TTC enregistrés dans Stock Radar :
        <ul style="margin:6px 0 0 18px;padding:0;">
            <li>Le pays retenu est celui du site Amazon, pas toujours celui du client (un client autrichien peut commander sur amazon.de).</li>
            <li>Les taux sont les taux normaux. Modifiez-les si une partie de vos produits relève d'un taux réduit (livres, alimentaire…).</li>
            <li>Les ventes à des professionnels avec n° de TVA (Amazon Business) et la TVA déjà collectée par Amazon ne sont pas reconnues.</li>
            <li>La TVA récupérable sur vos achats n'est pas déduite ici.</li>
        </ul></div>`;
    c.innerHTML = h;
}
function setTvaPeriode(v) { tvaPeriode = v; displayTva(); }

function exportTva() {
    if (!tvaPeriode) return;
    const [debut, fin] = bornesTva(tvaPeriode);
    const num = (n) => String((n || 0).toFixed(2)).replace('.', ',');
    let csv = '﻿Pays;Taux;Ventes TTC;Nombre de ventes;Remboursements TTC;Base HT;TVA à reverser\n';
    calculTva(debut, fin).forEach(x => { csv += [x.code === 'FR?' ? 'France (pays inconnu)' : (TVA_PAYS[x.code] || [x.code])[0], num(x.taux), num(x.ventesTtc), x.nb, num(x.rembTtc), num(x.baseHt), num(x.tva)].join(';') + '\n'; });
    downloadCSV(csv, `tva-${debut}-${fin}.csv`);
}
