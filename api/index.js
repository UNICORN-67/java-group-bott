const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_bot_db');
    return db;
}

// --- Dynamic HTML (Frontend Dashboard + Settings) ---
const getHtml = (groups, activeGid, currentSettings) => {
    // Agar koi specific group selected nahi hai, toh Dashboard dikhao
    if (!activeGid) {
        let groupCards = groups.map(g => `
            <div class="card" onclick="window.location.href='?gid=${g.groupId}'">
                <div style="display:flex; align-items:center;">
                    <div style="width:40px; height:40px; background:#3a3a3c; border-radius:50%; margin-right:15px; display:flex; align-items:center; justify-content:center;">👥</div>
                    <div>
                        <div style="font-weight:bold;">${g.groupName}</div>
                        <div style="font-size:12px; color:gray;">Active</div>
                    </div>
                </div>
                <span>❯</span>
            </div>
        `).join('');

        return `
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script></head>
        <style>
            body { font-family: sans-serif; background: #1c1c1d; color: white; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .card { background: #2c2c2e; padding: 15px; border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
            .add-btn { background: #007aff; color: white; padding: 12px; border-radius: 10px; text-decoration: none; display: block; text-align: center; font-weight: bold; }
        </style>
        <body>
            <div class="header"><h3>Your Chats</h3></div>
            ${groupCards || '<p style="text-align:center; color:gray;">No groups added yet.</p>'}
            <a href="https://t.me/${process.env.BOT_USERNAME}?startgroup=true" class="add-btn">+ Add Chat</a>
        </body>
        </html>`;
    }

    // Individual Group Settings View
    return `
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script></head>
    <style>
        body { font-family: sans-serif; background: #1c1c1d; color: white; padding: 20px; }
        .back { color: #007aff; text-decoration: none; margin-bottom: 20px; display: inline-block; }
        .card { background: #2c2c2e; padding: 15px; border-radius: 12px; }
        .row { display: flex; justify-content: space-between; align-items: center; margin: 15px 0; }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 8px; border: none; background: #3a3a3c; color: white; margin-top: 10px; }
        button { background: #007aff; color: white; border: none; padding: 15px; width: 100%; border-radius: 10px; font-weight: bold; margin-top: 20px; }
    </style>
    <body>
        <a href="/" class="back">❮ Back to List</a>
        <div class="card">
            <h3>Settings: ${activeGid}</h3>
            <div class="row"><span>Anti-Link</span><input type="checkbox" id="links" ${currentSettings?.antiLink ? 'checked' : ''}></div>
            <label>Welcome Message</label>
            <input type="text" id="welcome" value="${currentSettings?.welcomeMsg || ''}">
        </div>
        <button onclick="save()">Save Settings</button>
        <script>
            function save() {
                const data = { groupId: "${activeGid}", links: document.getElementById('links').checked, welcomeMsg: document.getElementById('welcome').value };
                window.Telegram.WebApp.sendData(JSON.stringify(data));
                window.Telegram.WebApp.close();
            }
        </script>
    </body>
    </html>`;
};

// --- Bot Logic ---

// 1. Detect when Bot is added to a new group
bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const database = await connectDB();
    if (status === 'administrator' || status === 'member') {
        await database.collection('chats').updateOne(
            { groupId: ctx.chat.id.toString() },
            { $set: { groupName: ctx.chat.title, active: true, updatedAt: new Date() } },
            { upsert: true }
        );
    } else {
        await database.collection('chats').updateOne(
            { groupId: ctx.chat.id.toString() },
            { $set: { active: false } }
        );
    }
});

bot.command('start', (ctx) => {
    const webAppUrl = `https://${process.env.VERCEL_URL}`;
    ctx.reply('Welcome! Open the Dashboard to manage your groups.', Markup.inlineKeyboard([
        Markup.button.webApp('📱 Open Dashboard', webAppUrl)
    ]));
});

bot.on('web_app_data', async (ctx) => {
    const data = JSON.parse(ctx.webAppData.data.json());
    const database = await connectDB();
    await database.collection('settings').updateOne(
        { groupId: data.groupId },
        { $set: { antiLink: data.links, welcomeMsg: data.welcomeMsg } },
        { upsert: true }
    );
    ctx.reply(`✅ Settings saved for ${data.groupId}`);
});

// --- Vercel Handler ---
module.exports = async (req, res) => {
    if (req.method === 'GET') {
        const database = await connectDB();
        const gid = req.query.gid;
        
        if (gid) {
            const settings = await database.collection('settings').findOne({ groupId: gid });
            res.setHeader('Content-Type', 'text/html');
            return res.send(getHtml(null, gid, settings));
        } else {
            const groups = await database.collection('chats').find({ active: true }).toArray();
            res.setHeader('Content-Type', 'text/html');
            return res.send(getHtml(groups, null, null));
        }
    }
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
