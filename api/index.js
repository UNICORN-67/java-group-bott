const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

// Environment Variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const VERCEL_URL = process.env.VERCEL_URL; // e.g. 'project-name.vercel.app'

const bot = new Telegraf(BOT_TOKEN);
let db;

// MongoDB Connection Logic
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

// --- HTML Frontend (Dashboard + Settings View) ---
const getHtml = (groups, selectedGid, settings) => {
    const bg = "#1c1c1d";
    const cardBg = "#2c2c2e";
    const accent = "#007aff";

    if (!selectedGid) {
        // VIEW 1: Dashboard
        let groupList = groups.map(g => `
            <div class="card" onclick="window.location.href='?gid=${g.groupId}'">
                <div style="display:flex; align-items:center;">
                    <div class="icon">👥</div>
                    <div>
                        <strong>${g.groupName || 'Unknown Group'}</strong>
                        <div style="font-size:12px; color:#aaa;">ID: ${g.groupId}</div>
                    </div>
                </div>
                <span>❯</span>
            </div>
        `).join('');

        return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>
            body { font-family: sans-serif; background: ${bg}; color: white; padding: 20px; margin:0; }
            .card { background: ${cardBg}; padding: 15px; border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border: 1px solid #333; }
            .icon { width: 40px; height: 40px; background: ${accent}; border-radius: 50%; margin-right: 15px; display: flex; align-items:center; justify-content:center; }
            .add-btn { background: #34c759; color: white; padding: 15px; border-radius: 12px; text-decoration: none; display: block; text-align: center; font-weight: bold; margin-top: 20px; }
        </style>
        <body>
            <h2>Your Managed Groups</h2>
            ${groupList || '<p style="text-align:center; color:gray;">No groups found. Add the bot to a group first!</p>'}
            <a href="https://t.me/${process.env.BOT_USERNAME || ''}?startgroup=true" class="add-btn">+ Add New Group</a>
        </body></html>`;
    }

    // VIEW 2: Settings
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { font-family: sans-serif; background: ${bg}; color: white; padding: 20px; margin:0; }
        .back-btn { color: ${accent}; text-decoration: none; display: inline-block; margin-bottom: 20px; font-weight: bold; }
        .card { background: ${cardBg}; padding: 20px; border-radius: 15px; }
        .row { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #3a3a3c; color: white; margin-top: 10px; box-sizing: border-box; }
        .save-btn { background: ${accent}; color: white; border: none; padding: 15px; width: 100%; border-radius: 12px; font-weight: bold; margin-top: 20px; cursor:pointer; }
    </style>
    <body>
        <a href="/" class="back-btn">❮ Back to Dashboard</a>
        <div class="card">
            <h3>Group Settings</h3>
            <div class="row">
                <span>Anti-Link Protection</span>
                <input type="checkbox" id="links" ${settings?.antiLink ? 'checked' : ''}>
            </div>
            <div style="margin-top:20px;">
                <label style="color:#aaa; font-size:12px;">Custom Welcome Message</label>
                <input type="text" id="welcome" placeholder="Welcome {name}!" value="${settings?.welcomeMsg || ''}">
            </div>
        </div>
        <button class="save-btn" onclick="saveData()">Save Changes</button>
        <script>
            const tg = window.Telegram.WebApp;
            tg.expand();
            function saveData() {
                const data = {
                    groupId: "${selectedGid}",
                    links: document.getElementById('links').checked,
                    welcomeMsg: document.getElementById('welcome').value
                };
                tg.sendData(JSON.stringify(data));
                tg.close();
            }
        </script>
    </body></html>`;
};

// --- Bot Listeners ---

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
    const webAppUrl = `https://${VERCEL_URL}`;
    ctx.reply(`Hello! I can manage your groups. Click below to open your dashboard.`, 
        Markup.inlineKeyboard([Markup.button.webApp('📱 Open Dashboard', webAppUrl)])
    );
});

bot.command('settings', (ctx) => {
    const webAppUrl = `https://${VERCEL_URL}`;
    ctx.reply(`Open settings for your groups:`, 
        Markup.inlineKeyboard([Markup.button.webApp('⚙️ Settings Dashboard', webAppUrl)])
    );
});

bot.on('web_app_data', async (ctx) => {
    const data = JSON.parse(ctx.webAppData.data.json());
    const database = await connectDB();
    await database.collection('settings').updateOne(
        { groupId: data.groupId },
        { $set: { antiLink: data.links, welcomeMsg: data.welcomeMsg } },
        { upsert: true }
    );
    ctx.reply(`✅ Settings updated for the group!`);
});

bot.on('new_chat_members', async (ctx) => {
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.welcomeMsg) {
        ctx.message.new_chat_members.forEach(m => {
            let text = config.welcomeMsg.replace('{name}', m.first_name);
            ctx.reply(text);
        });
    }
});

bot.on('message', async (ctx, next) => {
    if (!ctx.chat || ctx.chat.type === 'private') return next();
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.antiLink && ctx.message.entities?.some(e => e.type === 'url' || e.type === 'text_link')) {
        await ctx.deleteMessage().catch(() => {});
    }
    return next();
});

// --- Vercel Request Handler ---
module.exports = async (req, res) => {
    try {
        const database = await connectDB();
        const webhookUrl = `https://${VERCEL_URL}/api`;

        // 1. Auto Webhook Setup
        if (req.url === '/setup') {
            await bot.telegram.setWebhook(webhookUrl);
            return res.status(200).send(`Webhook set to ${webhookUrl}`);
        }

        // 2. GET Request: Dashboard/Settings UI
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

        // 3. POST Request: Telegram Updates
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            return res.status(200).send('OK');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
};
