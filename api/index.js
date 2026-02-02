const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

// --- Frontend HTML (With Modern Toggles) ---
const getHtml = (groups, selectedGid, settings) => {
    if (!selectedGid) {
        // Dashboard View
        let groupList = groups.map(g => `
            <div class="card" onclick="window.location.href='?gid=${g.groupId}'">
                <div style="display:flex; align-items:center;">
                    <div class="icon">👥</div>
                    <div><strong>${g.groupName || 'Unknown'}</strong></div>
                </div>
                <span>❯</span>
            </div>
        `).join('');

        return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
            body { font-family: sans-serif; background: #1c1c1d; color: white; padding: 20px; }
            .card { background: #2c2c2e; padding: 15px; border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
            .icon { width: 40px; height: 40px; background: #007aff; border-radius: 50%; margin-right: 15px; display: flex; align-items: center; justify-content: center; }
            .add-btn { background: #34c759; color: white; padding: 15px; border-radius: 12px; text-decoration: none; display: block; text-align: center; font-weight: bold; margin-top: 20px; }
        </style><body><h2>Your Chats</h2>${groupList}<a href="https://t.me/${process.env.BOT_USERNAME}?startgroup=true" class="add-btn">+ Add Chat</a></body></html>`;
    }

    // Settings View with Toggles
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { font-family: sans-serif; background: #1c1c1d; color: white; padding: 20px; }
        .card { background: #2c2c2e; padding: 20px; border-radius: 15px; border: 1px solid #3a3a3c; }
        .row { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
        /* Toggle Switch Style */
        .switch { position: relative; display: inline-block; width: 50px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #3a3a3c; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #34c759; }
        input:checked + .slider:before { transform: translateX(24px); }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #3a3a3c; color: white; margin-top: 10px; box-sizing: border-box; }
        .save-btn { background: #007aff; color: white; border: none; padding: 15px; width: 100%; border-radius: 12px; font-weight: bold; margin-top: 20px; }
    </style>
    <body>
        <a href="/" style="color:#007aff; text-decoration:none;">❮ Back</a>
        <div class="card">
            <h3>Management</h3>
            <div class="row">
                <span>Anti-Link Protection</span>
                <label class="switch"><input type="checkbox" id="links" ${settings?.antiLink ? 'checked' : ''}><span class="slider"></span></label>
            </div>
            <div style="margin-top:20px;">
                <label style="color:#aaa; font-size:12px;">Welcome Message</label>
                <input type="text" id="welcome" value="${settings?.welcomeMsg || ''}" placeholder="Welcome {name}!">
            </div>
        </div>
        <button class="save-btn" onclick="send()">Save All Settings</button>
        <script>
            function send() {
                const data = {
                    groupId: "${selectedGid}",
                    links: document.getElementById('links').checked,
                    welcomeMsg: document.getElementById('welcome').value
                };
                window.Telegram.WebApp.sendData(JSON.stringify(data));
                window.Telegram.WebApp.close();
            }
        </script>
    </body></html>`;
};

// --- Bot Logic ---

bot.command('start', (ctx) => {
    ctx.reply('Open Dashboard to manage chats:', Markup.inlineKeyboard([
        Markup.button.webApp('📱 Dashboard', `https://${process.env.VERCEL_URL}`)
    ]));
});

bot.command('settings', (ctx) => {
    ctx.reply('⚙️ Group Settings:', Markup.inlineKeyboard([
        Markup.button.webApp('Open Panel', `https://${process.env.VERCEL_URL}?gid=${ctx.chat.id}`)
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
    ctx.reply(`✅ Settings updated!`);
});

// Update Database when added to new group
bot.on('my_chat_member', async (ctx) => {
    const database = await connectDB();
    const status = ctx.myChatMember.new_chat_member.status;
    if (status === 'administrator' || status === 'member') {
        await database.collection('chats').updateOne(
            { groupId: ctx.chat.id.toString() },
            { $set: { groupName: ctx.chat.title, active: true } },
            { upsert: true }
        );
    }
});

// Welcome message logic
bot.on('new_chat_members', async (ctx) => {
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.welcomeMsg) {
        ctx.message.new_chat_members.forEach(m => {
            ctx.reply(config.welcomeMsg.replace('{name}', m.first_name));
        });
    }
});

// Anti-link Logic
bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.antiLink && ctx.message.entities?.some(e => e.type === 'url' || e.type === 'text_link')) {
        await ctx.deleteMessage().catch(() => {});
    }
    return next();
});

// --- Vercel Export ---
module.exports = async (req, res) => {
    const database = await connectDB();
    if (req.method === 'GET') {
        const gid = req.query.gid;
        res.setHeader('Content-Type', 'text/html');
        if (gid) {
            const settings = await database.collection('settings').findOne({ groupId: gid });
            return res.send(getHtml(null, gid, settings));
        } else {
            const groups = await database.collection('chats').find({ active: true }).toArray();
            return res.send(getHtml(groups, null, null));
        }
    }
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        return res.status(200).send('OK');
    }
};
