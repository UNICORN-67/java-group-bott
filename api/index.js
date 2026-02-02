const { Telegraf, Markup } = require('telegraf');

// Vercel Environment Variables se token uthayega
const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new Telegraf(BOT_TOKEN);

// --- 1. FRONTEND: MINI APP HTML ---
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        :root {
            --bg: var(--tg-theme-bg-color, #ffffff);
            --text: var(--tg-theme-text-color, #222222);
            --btn: var(--tg-theme-button-color, #3390ec);
            --btn-text: var(--tg-theme-button-text-color, #ffffff);
            --sec-bg: var(--tg-theme-secondary-bg-color, #f4f4f5);
        }
        body { font-family: -apple-system, sans-serif; background-color: var(--sec-bg); color: var(--text); margin: 0; padding: 20px; }
        .card { background: var(--bg); border-radius: 12px; padding: 15px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
        .row { display: flex; justify-content: space-between; align-items: center; margin: 10px 0; }
        .footer-btn { background: var(--btn); color: var(--btn-text); border: none; width: 100%; padding: 15px; border-radius: 10px; font-weight: bold; cursor: pointer; }
    </style>
</head>
<body>
    <div class="card">
        <h3>Moderation Tools</h3>
        <div class="row">
            <span>Anti-Link</span>
            <input type="checkbox" id="links">
        </div>
        <div class="row">
            <span>Welcome Msg</span>
            <input type="checkbox" id="welcome" checked>
        </div>
    </div>
    <button class="footer-btn" onclick="saveSettings()">Apply Changes</button>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready();
        function saveSettings() {
            const data = {
                links: document.getElementById('links').checked,
                welcome: document.getElementById('welcome').checked
            };
            tg.sendData(JSON.stringify(data));
            tg.close();
        }
    </script>
</body>
</html>
`;

// --- 2. BACKEND: BOT LOGIC ---

bot.start((ctx) => {
    // Ye URL automatic detect karega aapka Vercel link
    const appUrl = "https://" + ctx.worker?.host || "your-vercel-domain.vercel.app";
    ctx.reply('Hello Admin! Control this group visually:', 
        Markup.inlineKeyboard([
            Markup.button.webApp('Open Manager', appUrl)
        ])
    );
});

// Jab Mini App se data aaye
bot.on('web_app_data', (ctx) => {
    const data = JSON.parse(ctx.webAppData.data.json());
    ctx.reply(`✅ Updated:\n🔗 Links: ${data.links ? 'Blocked' : 'Allowed'}\n👋 Welcome: ${data.welcome ? 'ON' : 'OFF'}`);
});

// --- 3. VERCEL SERVERLESS HANDLER ---

module.exports = async (req, res) => {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const fullUrl = `${protocol}://${host}`;

    // A. SETUP ROUTE: browser mein /setup kholein
    if (req.url.includes('/setup')) {
        try {
            await bot.telegram.setWebhook(`${fullUrl}/api`);
            return res.status(200).send(`Webhook set to: ${fullUrl}/api`);
        } catch (e) {
            return res.status(500).send(`Error: ${e.message}`);
        }
    }

    // B. BOT UPDATE: Telegram POST requests
    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body);
            return res.status(200).send('OK');
        } catch (err) {
            console.error(err);
            return res.status(500).send('Bot Error');
        }
    }

    // C. FRONTEND: Normal browser visit
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlContent);
};
