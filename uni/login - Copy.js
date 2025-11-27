// login.js

// Assuming CLIENT_ID and SCOPES are defined in main.js
// If main.js is loaded after login.js, we might have issues.
// But viewer.html loads main.js before login.js (in my plan).

// let tokenClient;
const TRIAL_URL = "http://127.0.0.1:5500/uni/viewer.html?token=ackWUeRd8dfIIESDa7loqjg0Bu1PQCgppu9UKXACIQFc155L3xo5BEHDc-yvPZKBi80ykaMsBCGBZnbHBaaUXXIOxs4";

function gisLoaded() {
    // Ensure google object and CLIENT_ID are available
    if (typeof google === 'undefined' || typeof CLIENT_ID === 'undefined') {
        setTimeout(gisLoaded, 100);
        return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
                const rememberMe = document.getElementById('rememberMe')?.checked;
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                try {
                    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
                    });
                    if (userInfoResponse.ok) {
                        const userInfo = await userInfoResponse.json();
                        sessionStorage.setItem('google_auth_email_hint', userInfo.email);
                        localStorage.setItem('google_login_hint', userInfo.email);
                    }
                } catch (error) {
                    console.error('Failed to fetch user info:', error);
                }
                sessionStorage.removeItem('logout_flag');

                // Reload to start app cleanly
                window.location.reload();

            } else {
                console.error('Failed to get access token');
                alert(_('authFailed'));
            }
        },
        error_callback: (error) => {
            console.error("GSI Error:", error);
            alert(_('authFailed') + `\n\nError: ${error.type}`);
        }
    });

    const loginBox = document.querySelector('.login-box');
    const loginHint = localStorage.getItem('google_login_hint');
    const rememberMe = document.getElementById('rememberMe');

    if (loginHint && rememberMe && rememberMe.checked) {
        tokenClient.requestAccessToken({
            prompt: 'none', login_hint: loginHint, error_callback: () => {
                // if (loginBox) loginBox.style.display = 'block'; // Controlled by 's' cache check
                const authBtn = document.getElementById('authorize_button');
                if (authBtn) authBtn.disabled = false;
            }
        });
    } else {
        // if (loginBox) loginBox.style.display = 'block'; // Controlled by 's' cache check
        const authBtn = document.getElementById('authorize_button');
        if (authBtn) authBtn.disabled = false;
    }
}

function handleAuthClick() {
    if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'select_account' });
    } else {
        console.error('Token client not initialized');
        alert(_('gapiNotReady'));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const authBtn = document.getElementById('authorize_button');
    if (authBtn) authBtn.addEventListener('click', handleAuthClick);

    const trialBtn = document.getElementById("trialBtn");
    if (trialBtn) {
        trialBtn.addEventListener("click", () => {
            window.location.href = TRIAL_URL;
        });
    }

    const rememberMeCheckbox = document.getElementById('rememberMe');
    if (rememberMeCheckbox) {
        rememberMeCheckbox.checked = localStorage.getItem('rememberMe') === 'true';
        rememberMeCheckbox.addEventListener('change', () => {
            localStorage.setItem('rememberMe', rememberMeCheckbox.checked);
        });
    }

    // Check for 's' cache
    (async () => {
        try {
            // Only manipulate login UI if the login-container is visible
            // (meaning checkAuth failed and we need to show login options)
            const loginContainer = document.getElementById('login-container');
            if (!loginContainer || loginContainer.style.display === 'none') {
                // Auth succeeded, don't show login UI
                return;
            }

            const cache = await caches.open('app-cache');
            const cachedResponse = await cache.match('s');
            const urlToken = localStorage.getItem('urlToken');
            if (cachedResponse || urlToken) {
                const loginBox = document.querySelector('.login-box');
                if (loginBox) loginBox.style.display = 'block';
                if (trialBtn) trialBtn.style.display = 'none';
            } else {
                // First start: 's' is missing AND no urlToken
                if (trialBtn) trialBtn.style.display = 'block';
                const loginBox = document.querySelector('.login-box');
                if (loginBox) loginBox.style.display = 'none';
            }
        } catch (e) {
            console.log('Cache check failed', e);
        }
    })();

    // Bind language buttons if they exist in header
    const langBg = document.getElementById('lang-bg');
    const langEn = document.getElementById('lang-en');
    if (langBg) langBg.addEventListener('click', () => setLanguage('bg'));
    if (langEn) langEn.addEventListener('click', () => setLanguage('en'));
});
