// ================================================================================
// III. GOOGLE DRIVE АВТЕНТИКАЦИЯ И API
// ================================================================================

function checkAuth() {
    const storedTokenString = sessionStorage.getItem('google_auth_token');
    if (!storedTokenString) {
        window.location.href = 'login.html';
        return null; // Stop execution
    }
    const tokenData = JSON.parse(storedTokenString);
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);
    if (isExpired) {
        console.log("Token expired. Redirecting to login for re-authentication.");
        sessionStorage.removeItem('google_auth_token');
        // Redirect to login page with a parameter to trigger re-auth automatically
        window.location.href = 'login.html?reauth=true';
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
    window.location.href = 'login.html';
}
