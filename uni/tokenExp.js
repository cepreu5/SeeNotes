Инструкция за симулиране на изтекъл токен:
За да тествате как приложението ще реагира при изтичане на токена, без да чакате 1 час, изпълнете в конзолата на браузъра (F12 -> Console):
Очаквано поведение след пускане на скрипта и Reload:

(function() {
    // 1. Прочитаме токена
    let tokenStr = localStorage.getItem('google_auth_token');
    if (!tokenStr) {
        tokenStr = sessionStorage.getItem('google_auth_token');
        console.log("Token found in Session Storage.");
    } else {
        console.log("Token found in Local Storage.");
    }

    if (tokenStr) {
        let token = JSON.parse(tokenStr);
        // 2. Връщаме времето назад с 2 часа (7200000 мс)
        token.issued_at = Date.now() - 7200000; 
        
        // 3. Запазваме го обратно
        if (localStorage.getItem('google_auth_token')) {
            localStorage.setItem('google_auth_token', JSON.stringify(token));
        } else {
            sessionStorage.setItem('google_auth_token', JSON.stringify(token));
        }
        console.log("✅ Token successfully expired manually!");
        console.log("Now reload the page or click 'Reload' in the app to trigger checkAuth.");
    } else {
        console.warn("❌ No Google Auth Token found to expire.");
    }
})();

Приложението ще стартира.
В конзолата ще видите: Token expired. Attempting silent refresh...
Ако всичко е наред с мрежата: Silent refresh successful. и приложението ще продължи да работи гладко.
Ако симулирате липса на мрежа (Offline mode в DevTools) или спрете 50% от пакетите (Network throttling):
Приложението ще се опита да се свърже за 15 секунди.
Ще видите предупреждение в конзолата (Silent refresh threw an error...).
Приложението ще покаже екран за вход (login page) със съобщение, че сесията е изтекла.
Бутонът "Authorize with Google" ще бъде активен и при клик ще покаже или pop-up, или съобщение за грешка (ако все още няма нет).
