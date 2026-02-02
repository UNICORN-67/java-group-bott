const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI; 

const bot = new Telegraf(BOT_TOKEN);
let db;

async function connectDB() {
    if (db) return db;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('tg_bot_db');
    return db;
}

// --- HTML Frontend (With Welcome Message Input) ---
const getHtml = (groupId, currentSettings) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { font-family: sans-serif; background: var(--tg-theme-bg-color, #fff); color: var(--tg-theme-text-color, #000); padding: 20px; }
        .card { background: var(--tg-theme-secondary-bg-color, #f0f0f0); padding: 15px; border-radius: 12px; margin-bottom: 15px; }
        input[type="text"] { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box; margin-top: 5px; }
        .switch-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        button { background: var(--tg-theme-button-color, #3390ec); color: var(--tg-theme-button-text-color, #fff); border: none; padding: 12px; width: 100%; border-radius: 8px; font-weight: bold; cursor: pointer; }
        label { font-size: 14px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <div class="switch-row">
            <label>Anti-Link Protection</label>
            <input type="checkbox" id="links" ${currentSettings?.antiLink ? 'checked' : ''}>
        </div>
        
        <label>Custom Welcome Message</label>
        <input type="text" id="welcomeText" placeholder="e.g. Welcome to our group!" value="${currentSettings?.welcomeMsg || ''}">
        <p style="font-size: 11px; color: gray;">Tip: Type {name} to tag the user.</p>
    </div>
    <button onclick="save()">Save All Settings</button>

    <script>
        const tg = window.Telegram.WebApp;
        function save() {
            const data = {
                groupId: "${groupId}",
                links: document.getElementById('links').checked,
                welcomeMsg: document.getElementById('welcomeText').value
            };
            tg.sendData(JSON.stringify(data));
            tg.close();
        }
    </script>
</body>
</html>
`;

// --- Bot Logic ---

// 1. New Member Welcome Logic
bot.on('new_chat_members', async (ctx) => {
    const database = await connectDB();
    const setting = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });

    if (setting?.welcomeMsg) {
        for (const member of ctx.message.new_chat_members) {
            let msg = setting.welcomeMsg.replace('{name}', `[${member.first_name}](tg://user?id=${member.id})`);
            await ctx.replyWithMarkdown(msg);
        }
    }
});

// 2. Settings command
bot.command('settings', async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply("Please use this in a group.");
    const webAppUrl = `https://${process.env.VERCEL_URL}?gid=${ctx.chat.id}`;
    ctx.reply(`Admin Panel for ${ctx.chat.title}`, 
        Markup.inlineKeyboard([Markup.button.webApp('⚙️ Settings', webAppUrl)])
    );
});

// 3. WebApp Data Listener
bot.on('web_app_data', async (ctx) => {
    const data = JSON.parse(ctx.webAppData.data.json());
    const database = await connectDB();
    await database.collection('settings').updateOne(
        { groupId: data.groupId },
        { $set: { antiLink: data.links, welcomeMsg: data.welcomeMsg } },
        { upsert: true }
    );
    ctx.reply(`✅ Settings updated! Link Block: ${data.links ? 'ON' : 'OFF'}`);
});

// 4. Anti-Link Logic
bot.on('message', async (ctx, next) => {
    const database = await connectDB();
    const setting = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (setting?.antiLink && ctx.message.entities?.some(e => e.type === 'url')) {
        await ctx.deleteMessage().catch(() => {});
    }
    return next();
});

// Vercel Handler
module.exports = async (req, res) => {
    if (req.method === 'GET') {
        const database = await connectDB();
        const currentSettings = await database.collection('settings').findOne({ groupId: req.query.gid });
        res.setHeader('Content-Type', 'text/html');
        return res.send(getHtml(req.query.gid, currentSettings));
    }
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
