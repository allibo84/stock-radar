// ═══════════════════════════════════════════════════════════════════
// STOCK RADAR — Conversion des devises en euros
// Taux de référence quotidiens de la Banque centrale européenne (API publique data-api.ecb.europa.eu).
// Dirham (AED) et riyal (SAR) sont ancrés au dollar : on passe par le taux EUR/USD.
// ═══════════════════════════════════════════════════════════════════

let tauxBce = null;            // { GBP: [['2026-01-02', 0.86], …] trié par date, … }
let tauxBceChargement = null;
const ANCRAGE_USD = { AED: 3.6725, SAR: 3.75 };
const DEVISE_MARKETPLACE = { 'co.uk': 'GBP', 'pl': 'PLN', 'se': 'SEK', 'ae': 'AED', 'sa': 'SAR', 'com.tr': 'TRY', 'com': 'USD', 'ca': 'CAD', 'co.jp': 'JPY', 'com.au': 'AUD', 'eg': 'EGP', 'sg': 'SGD' };

function deviseDeMarketplace(m) {
    const t = String(m || '').trim().toLowerCase().replace(/^.*amazon\./, '');
    if (!t) return '';
    return DEVISE_MARKETPLACE[t] || 'EUR';
}

async function chargerTauxBce() {
    if (tauxBce) return tauxBce;
    if (tauxBceChargement) return tauxBceChargement;
    tauxBceChargement = (async () => {
        const aujourdHui = dateLocaleISO(new Date());
        try {
            const cache = JSON.parse(localStorage.getItem('sr-taux-bce') || 'null');
            if (cache && cache.jour === aujourdHui && cache.taux) { tauxBce = cache.taux; return tauxBce; }
        } catch (e) { /* pas de cache */ }
        try {
            const r = await fetch('https://data-api.ecb.europa.eu/service/data/EXR/D.GBP+PLN+SEK+USD+TRY+CAD+JPY+AUD+SGD.EUR.SP00.A?startPeriod=2024-01-01&format=csvdata');
            if (!r.ok) throw new Error('BCE ' + r.status);
            const lignes = (await r.text()).trim().split('\n');
            const h = lignes[0].split(',');
            const ic = h.indexOf('CURRENCY'), ip = h.indexOf('TIME_PERIOD'), iv = h.indexOf('OBS_VALUE');
            const taux = {};
            lignes.slice(1).forEach(l => {
                const x = l.split(',');
                const v = parseFloat(x[iv]);
                if (x[ic] && x[ip] && v > 0) (taux[x[ic]] = taux[x[ic]] || []).push([x[ip], v]);
            });
            Object.values(taux).forEach(a => a.sort((p, q) => p[0].localeCompare(q[0])));
            tauxBce = taux;
            try { localStorage.setItem('sr-taux-bce', JSON.stringify({ jour: aujourdHui, taux })); } catch (e) { /* trop gros ou indisponible */ }
        } catch (e) {
            console.warn('Taux BCE indisponibles :', e.message);
            tauxBce = {};
        }
        return tauxBce;
    })();
    return tauxBceChargement;
}

// Unités de la devise pour 1 € à la date (dernier taux publié à cette date ou avant)
function unitesParEuro(devise, dateISO) {
    if (!devise || devise === 'EUR') return 1;
    if (!tauxBce) return null;
    if (ANCRAGE_USD[devise]) { const usd = unitesParEuro('USD', dateISO); return usd ? usd * ANCRAGE_USD[devise] : null; }
    const serie = tauxBce[devise];
    if (!serie || !serie.length) return null;
    const d = String(dateISO || '').slice(0, 10) || serie[serie.length - 1][0];
    let lo = 0, hi = serie.length - 1, res = null;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (serie[mid][0] <= d) { res = serie[mid][1]; lo = mid + 1; } else hi = mid - 1; }
    return res || serie[0][1];
}
// Montant en euros, ou null si le taux est inconnu
function versEur(montant, devise, dateISO) {
    const k = unitesParEuro(devise, dateISO);
    return k ? montant / k : null;
}
