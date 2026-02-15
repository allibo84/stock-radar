// Gestion de l'authentification
let currentUser = null;
let isAdmin = false;
let viewingUserId = null; // null = admin voit tout, sinon = user_id ciblé
let allUsers = [];

// Auto-créer le profil si absent
async function ensureUserProfile() {
    if (!currentUser) return;
    try {
        const { data } = await sb.from('user_profiles').select('id').eq('user_id', currentUser.id).maybeSingle();
        if (!data) {
            await sb.from('user_profiles').insert({ user_id: currentUser.id, email: currentUser.email });
        }
    } catch (e) { console.warn('Profil auto:', e); }
}

async function checkAuth() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) { showLogin(); return; }
        if (session) {
            currentUser = session.user;
            await checkIfAdmin();
            showApp();
        } else {
            showLogin();
        }
    } catch (e) { console.error('Erreur checkAuth:', e); showLogin(); }
}

async function checkIfAdmin() {
    if (!currentUser) return;
    try {
        const { data, error } = await sb.from('app_admins').select('*').eq('user_id', currentUser.id).maybeSingle();
        isAdmin = !error && !!data;
    } catch (e) { isAdmin = false; }
}

// Charger la liste des utilisateurs (admin)
async function loadUsersList() {
    if (!isAdmin) return;
    try {
        const { data: profiles } = await sb.from('user_profiles').select('*');
        if (profiles && profiles.length) {
            allUsers = profiles.map(p => ({
                user_id: p.user_id,
                email: p.email || p.user_id.substring(0, 8) + '...',
                isMe: p.user_id === currentUser.id
            }));
        } else {
            // Fallback : récupérer les user_id distincts depuis les tables
            const { data: prodUsers } = await sb.from('produits').select('user_id');
            const ids = new Set();
            (prodUsers || []).forEach(r => { if (r.user_id) ids.add(r.user_id); });
            
            const { data: admins } = await sb.from('app_admins').select('user_id, email');
            const adminMap = {};
            (admins || []).forEach(a => { adminMap[a.user_id] = a.email; });
            
            allUsers = [...ids].map(uid => ({
                user_id: uid,
                email: adminMap[uid] || uid.substring(0, 8) + '...',
                isMe: uid === currentUser.id
            }));
        }
        displayUserSwitcher();
    } catch (e) { console.warn('Erreur chargement users:', e); }
}

function displayUserSwitcher() {
    const container = document.getElementById('admin-switcher');
    if (!container || !isAdmin) return;
    container.style.display = 'flex';
    
    const myProfile = allUsers.find(u => u.isMe);
    const myEmail = myProfile ? myProfile.email : currentUser.email;
    const others = allUsers.filter(u => !u.isMe);
    
    let html = '<select id="user-switch-select" onchange="switchViewUser(this.value)" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.3);background:rgba(255,255,255,0.1);color:white;font-size:13px;max-width:280px;">';
    html += `<option value="${currentUser.id}" ${!viewingUserId || viewingUserId === currentUser.id ? 'selected' : ''}>📌 ${myEmail}</option>`;
    
    others.forEach(u => {
        const selected = viewingUserId === u.user_id ? 'selected' : '';
        html += `<option value="${u.user_id}" ${selected}>👤 ${u.email}</option>`;
    });
    
    if (others.length > 0) {
        html += `<option value="" ${!viewingUserId ? 'selected' : ''}>👁️ Tous les comptes (${allUsers.length})</option>`;
    }
    
    html += '</select>';
    container.innerHTML = html;
}

async function switchViewUser(userId) {
    viewingUserId = userId || null;
    const indicator = document.getElementById('viewing-indicator');
    if (indicator) {
        if (viewingUserId && viewingUserId !== currentUser.id) {
            const u = allUsers.find(x => x.user_id === viewingUserId);
            indicator.textContent = '👁️ ' + (u ? u.email : '...');
            indicator.style.display = 'inline-block';
        } else if (!viewingUserId) {
            indicator.textContent = '👁️ Tous';
            indicator.style.display = 'inline-block';
        } else {
            indicator.style.display = 'none';
        }
    }
    await loadAllData();
}

// Filtre user_id pour les requêtes
function getUserFilter() {
    if (isAdmin && !viewingUserId) return null; // admin voit tout
    if (isAdmin && viewingUserId) return viewingUserId;
    return currentUser?.id || null;
}

function showLogin() {
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'flex';
}

function showApp() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    if (currentUser?.email) {
        document.getElementById('user-email').textContent = currentUser.email;
    }
    if (isAdmin) {
        const badge = document.getElementById('admin-badge');
        if (badge) badge.style.display = 'inline-block';
        loadUsersList();
    }
    // Par défaut l'admin voit son propre compte
    if (isAdmin && viewingUserId === null) viewingUserId = currentUser.id;
    loadAllData();
}

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    errorDiv.style.display = 'none';
    
    if (!email || !password) {
        errorDiv.textContent = '❌ Veuillez remplir tous les champs';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        viewingUserId = null;
        await checkIfAdmin();
        // Créer/mettre à jour le profil utilisateur
        await ensureUserProfile();
        showApp();
    } catch (error) {
        let message = 'Email ou mot de passe incorrect';
        if (error.message) {
            if (error.message.includes('Invalid login')) message = 'Email ou mot de passe incorrect';
            else if (error.message.includes('Email not confirmed')) message = 'Veuillez confirmer votre email';
            else if (error.message.includes('network')) message = 'Erreur réseau, vérifiez votre connexion';
            else message = error.message;
        }
        errorDiv.textContent = '❌ ' + message;
        errorDiv.style.display = 'block';
    }
});

async function logout() {
    if (confirm('Se déconnecter ?')) {
        try { await sb.auth.signOut(); } catch (e) {}
        currentUser = null;
        isAdmin = false;
        viewingUserId = null;
        allUsers = [];
        showLogin();
    }
}

checkAuth();

sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) { currentUser = session.user; }
    else if (event === 'SIGNED_OUT') { currentUser = null; isAdmin = false; viewingUserId = null; showLogin(); }
});
