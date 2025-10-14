// ================================================================================
// III. GOOGLE DRIVE АВТЕНТИКАЦИЯ И API
// ================================================================================

function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.style.display = 'flex';
        // We assume setLoginLanguage is available globally from viewer-l.html
        if (typeof setLoginLanguage === 'function') {
            setLoginLanguage(localStorage.getItem('language') || 'bg');
        }
    }
}

function checkAuth() {
    const storedTokenString = sessionStorage.getItem('google_auth_token');
    if (!storedTokenString) {
        showLoginModal();
        return null; // Stop execution
    }
    const tokenData = JSON.parse(storedTokenString);
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);
    if (isExpired) {
        console.log("Token expired. Showing login modal for re-authentication.");
        sessionStorage.removeItem('google_auth_token');
        showLoginModal();
        return null; // Stop execution
    }
    return tokenData; // Token is valid
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    });
}

function handleSignoutClick() {
    sessionStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_email_hint');
    window.location.reload();
}
