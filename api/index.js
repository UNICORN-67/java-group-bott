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

const getHtml = (groups, selectedGid, settings) => {
    if (!selectedGid) {
        let list = groups.map(g => `<div class="card" onclick="location.href='?gid=${g.groupId}'"><span>👥 ${g.groupName || 'Group'}</span><span>❯</span></div>`).join('');
        return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><style>body{background:#1c1c1d;color:white;padding:20px;font-family:sans-serif;}.card{background:#2c2c2e;padding:15px;border-radius:12px;margin-bottom:10px;display:flex;justify-content:space-between;cursor:pointer;}.add-btn{background:#34c759;color:white;padding:15px;border-radius:12px;display:block;text-align:center;text-decoration:none;font-weight:bold;margin-top:20px;}</style><body><h2>My Chats</h2>${list}<a href="https://t.me/${process.env.BOT_USERNAME}?startgroup=true" class="add-btn">+ Add Group</a></body></html>`;
    }

    const isAntiLinkChecked = settings && settings.antiLink === true ? 'checked' : '';

    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script></head>
    <style>
        body { font-family: sans-serif; background: #1c1c1d; color: white; padding: 20px; }
        .card { background: #2c2c2e; padding: 20px; border-radius: 15px; }
        .row { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
        .switch { position: relative; display: inline-block; width: 50px; height: 26px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #3a3a3c; transition: .4s; border-radius: 34px; }
        .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
        input:checked + .slider { background-color: #007aff; }
        input:checked + .slider:before { transform: translateX(24px); }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #3a3a3c; color: white; margin-top: 10px; box-sizing: border-box; }
        .save-btn { background: #007aff; color: white; border: none; padding: 15px; width: 100%; border-radius: 12px; font-weight: bold; margin-top: 20px; cursor: pointer; }
    </style>
    <body>
        <a href="/" style="color:#007aff; text-decoration:none;">❮ Back</a>
        <div class="card">
            <h3>Management</h3>
            <div class="row">
                <span>Anti-Link Protection</span>
                <label class="switch">
                    <input type="checkbox" id="links" ${isAntiLinkChecked}>
                    <span class="slider"></span>
                </label>
            </div>
            <div style="margin-top:20px;">
                <label style="color:#aaa; font-size:12px;">Welcome Message</label>
                <input type="text" id="welcome" value="${settings?.welcomeMsg || ''}" placeholder="Welcome {name}!">
            </div>
        </div>
        <button class="save-btn" onclick="save()">Save All Settings</button>
        <script>
            function save() {
                const data = {
                    gid: "${selectedGid}",
                    links: document.getElementById('links').checked,
                    welcome: document.getElementById('welcome').value
                };
                fetch('/api?save=true', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                }).then(() => {
                    window.Telegram.WebApp.close();
                });
            }
        </script>
    </body></html>`;
};

bot.on('new_chat_members', async (ctx) => {
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.welcomeMsg) {
        ctx.message.new_chat_members.forEach(m => ctx.reply(config.welcomeMsg.replace('{name}', m.first_name)));
    }
});

bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.antiLink === true && ctx.message.entities?.some(e => e.type === 'url' || e.type === 'text_link')) {
        await ctx.deleteMessage().catch(() => {});
        return;
    }
    return next();
});

bot.command('settings', (ctx) => {
    ctx.reply('⚙️ Manage Group:', Markup.inlineKeyboard([
        Markup.button.webApp('Open Panel', `https://${process.env.VERCEL_URL}?gid=${ctx.chat.id}`)
    ]));
});

module.exports = async (req, res) => {
    try {
        const database = await connectDB();
        
        if (req.query.save === 'true' && req.method === 'POST') {
            const { gid, links, welcome } = req.body;
            await database.collection('settings').updateOne(
                { groupId: gid },
                { $set: { antiLink: Boolean(links), welcomeMsg: welcome } },
                { upsert: true }
            );
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'GET') {
            const gid = req.query.gid;
            res.setHeader('Content-Type', 'text/html');
            const settings = gid ? await database.collection('settings').findOne({ groupId: gid }) : null;
            const groups = !gid ? await database.collection('chats').find({ active: true }).toArray() : [];
            return res.send(getHtml(groups, gid, settings));
        }

        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
};
