            if (ageInDays < validityInDays) {
                isUrlTokenValidTime = true;
                pass = true;

                // --- WHITELIST LOGIC ---
                const isTrialStart = sessionStorage.getItem('isTrialStart') === 'true';
                const action = isTrialStart ? 'log' : 'check';

                // Взимаме реалния имейл на потребителя, а не този от токена
                const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');

                if (currentUserEmail) {  //  && isTrialStart - logging only
                    // Винаги правим заявка към сървъра - или за добавяне (trial), или за проверка (login)
                    // white list - fetch('https://script.google.com/macros/s/AKfycbwDT37UO2ayL2FZf300X5zWXjA32g5geAN09H0iLGasMjON0kkOoYEkSMLMpG3wsrQPAA/exec', {
                    // fetch('https://script.google.com/macros/s/AKfycbxwPON0_BaosuEp0Y5onRa7puDFwDRzobpmAjkbY1IdvO8cC8C3tvyI80izNriSHTdnRQ/exec', { // logging only
                    fetch('https://script.google.com/macros/s/AKfycbyD-Y_qPdLOkowGv_pmYnIIjRsazSuWWJpDNMb2idxuW5_KfAn7sJZJZ1_wKuFQbM5fqQ/exec', {
                        method: 'POST',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            email: currentUserEmail, // Използваме имейла на потребителя
                            // action: action
                            action: 'log' // logging only
                        })
                    })
                        .then(response => response.json())
                        .then(data => {
                            console.log('Whitelist check:', data);

                            /*if (action === 'check' && !data.exists) {
                                // Потребителят не е в белия списък!
                                alert(_('accessDenied') || 'Access Denied: Your email is not registered.');
                                sessionStorage.clear();
                                localStorage.removeItem('google_auth_token');
                                location.reload(); // Рестарт към login екрана
                            } else */ if (action === 'log') {
                                // Успешна регистрация на trial
                                sessionStorage.removeItem('isTrialStart');
                                console.log('Trial registered/verified for:', currentUserEmail);
                            }
                        })
                        .catch(error => {
                            console.error('Whitelist check failed:', error);
                        });
                } else {
                    console.log('No user email found for whitelist check or trial registration only.');
                }
            } else {
                console.log('Резултат от проверката: НЕВАЛИДЕН (изтекъл)');
                pass = false;
                sessionStorage.clear();
            }
        } catch (error) {
            console.error("Грешка при декриптиране на токен:", error);
            pass = false;
            sessionStorage.clear();
        }
    }
    else {
        console.error("Липсващ токен!");
        pass = false;
        sessionStorage.clear();
    }