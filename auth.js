// Gestion de l'authentification
let currentUser = null;

// Vérifier si l'utilisateur est connecté au chargement
async function checkAuth() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();
        
        if (error) {
            console.error('Erreur session:', error);
            showLogin();
            return;
        }
        
        if (session) {
            currentUser = session.user;
            showApp();
        } else {
            showLogin();
        }
    } catch (e) {
        console.error('Erreur checkAuth:', e);
        showLogin();
    }
}

// Afficher l'écran de connexion
function showLogin() {
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-container').style.display = 'flex';
}

// Afficher l'application
function showApp() {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    if (currentUser && currentUser.email) {
        document.getElementById('user-email').textContent = currentUser.email;
    }
    
    // Charger les données
    loadAllData();
}

// Connexion
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
        const { data, error } = await sb.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) throw error;
        
        currentUser = data.user;
        showApp();
    } catch (error) {
        console.error('Erreur connexion:', error);
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

// Déconnexion
async function logout() {
    if (confirm('Se déconnecter ?')) {
        try {
            await sb.auth.signOut();
        } catch (e) {
            console.error('Erreur déconnexion:', e);
        }
        currentUser = null;
        showLogin();
    }
}

// Initialiser l'authentification
checkAuth();

// Écouter les changements d'authentification
sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        showLogin();
    }
});
