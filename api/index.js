const { Telegraf, Markup } = require('telegraf');

// REPLACE THESE
const BOT_TOKEN = 'YOUR_BOT_TOKEN';
const APP_URL = 'https://your-project-name.vercel.app'; 

const bot = new Telegraf(BOT_TOKEN);

// 1. HTML Frontend (Mini App UI)
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { font-family: sans-serif; background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #000); padding: 20px; }
        .btn { background: var(--tg-theme-button-color, #3390ec); color: var(--tg-theme-button-text-color, #fff); 
               border: none; padding: 12px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; }
        .card { border: 1px solid rgba(0,0,0,0.1); padding: 15px; border-radius: 10px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="card">
        <h3>Group Manager</h3>
        <p>Manage permissions for this group.</p>
        <label><input type="checkbox" id="mute"> Mute All Users</label><br><br>
        <label><input type="checkbox" id="links"> Restrict Links</label>
    </div>
    <button class="btn" onclick="sendData()">Save Settings</button>

    <script>
        const tg = window.Telegram.WebApp;
        tg.ready();
        function sendData() {
            const data = {
                mute: document.getElementById('mute').checked,
                links: document.getElementById('links').checked
            };
            tg.sendData(JSON.stringify(data));
            tg.close();
        }
    </script>
</body>
</html>
`;

// 2. Bot Logic
bot.start((ctx) => {
    ctx.reply('Open the Group Manager:', 
        Markup.inlineKeyboard([
            Markup.button.webApp('Control Panel', APP_URL + '/api')
        ])
    );
});

bot.on('web_app_data', async (ctx) => {
    const data = JSON.parse(ctx.webAppData.data.json());
    await ctx.reply(`✅ Updated!\nMute: ${data.mute}\nLinks: ${data.links}`);
});

// 3. Vercel Serverless Handler
module.exports = async (req, res) => {
    // If it's a GET request, show the Mini App HTML
    if (req.method === 'GET') {
        res.setHeader('Content-Type', 'text/html');
        return res.send(htmlContent);
    }
    
    // If it's a POST request, it's Telegram sending us a message (Webhook)
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
};
