function gisLoaded() {
    // Задаваме езика преди да се покаже login box-а
    setLanguage(currentLang);

    // Ако вече има токен
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');

    // Проверяваме дали login страницата е видима (т.е. сме в режим на "първо стартиране" или изход)
    // Ако login страницата е СКРИТА (hidden=true), значи приложението работи и не трябва да инициализираме наново.
    // Ако login страницата е ВИДИМА (hidden=false), трябва да инициализираме tokenClient, за да работят бутоните.
    // const isAppRunning = document.getElementById('login-page').hidden;

    // if ((sessionToken || localToken) && isAppRunning) {
    //    console.log('User already authenticated and app running, skipping gisLoaded initialization');
    //    return;
    // }
    // ПРЕМАХНАТО: Винаги инициализираме tokenClient, за да сме сигурни, че е наличен при нужда (напр. за trial бутона).

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
                const rememberMe = document.getElementById('rememberMe')?.checked;
                // Токенът се записва в localStorage или sessionStorage според избора
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                try {
                    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                        headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
                    });
                    if (userInfoResponse.ok) {
                        const userInfo = await userInfoResponse.json();
                        // Имейлът за текущата сесия се записва ВИНАГИ в sessionStorage
                        sessionStorage.setItem('google_auth_email_hint', userInfo.email);
                        // Запазваме имейла за следващо "тихо" влизане
                        localStorage.setItem('google_login_hint', userInfo.email);
                    }
                } catch (error) {
                    console.error('Failed to fetch user info:', error);
                }
                sessionStorage.removeItem('logout_flag');
                // Вместо redirect, скриваме login страницата и продължаваме
                document.getElementById('login-page').hidden = true;
                // Извикваме startApp за да заредим приложението
                startApp();
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

    // Винаги показваме екрана за вход
    // Автоматичното влизане ще се случи при клик на бутона, ако rememberMe е активно
    loginBox.style.visibility = 'visible';
    document.getElementById('authorize_button').disabled = false;
}
