// Тази функция ще се изпълнява на сървърите на Netlify, а не в браузъра.

exports.handler = async function(event, context) {
    // Проверяваме дали заявката е POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { refreshToken } = JSON.parse(event.body);

        if (!refreshToken) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Refresh token is required.' }) };
        }

        // Използваме fetch, който е наличен в средата на Netlify Functions
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                'client_id': process.env.GOOGLE_CLIENT_ID,       // <-- Взимаме от сигурните променливи
                'client_secret': process.env.GOOGLE_CLIENT_SECRET, // <-- Взимаме от сигурните променливи
                'refresh_token': refreshToken,
                'grant_type': 'refresh_token'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            // Ако Google върне грешка, я препращаме към клиента
            return { statusCode: response.status, body: JSON.stringify(data) };
        }

        // Връщаме успешния резултат към клиента
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Error in refreshToken function:', error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
    }
};