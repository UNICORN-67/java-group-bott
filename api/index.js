const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

// MongoDB Connection
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

// --- HTML Frontend (Dashboard + Settings View) ---
const getHtml = (groups, selectedGid, settings) => {
    // VIEW 1: Dashboard (Saare Groups ki List)
    if (!selectedGid) {
        let groupList = groups.map(g => `
            <div class="card" onclick="window.location.href='?gid=${g.groupId}'">
                <div style="display:flex; align-items:center;">
                    <div class="icon">👥</div>
                    <div>
                        <strong>${g.groupName}</strong>
                        <div style="font-size:12px; color:#aaa;">ID: ${g.groupId}</div>
                    </div>
                </div>
                <span>❯</span>
            </div>
        `).join('');

        return `<!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script></head>
        <style>
            body { font-family: sans-serif; background: #1c1c1d; color: white; padding: 20px; }
            .card { background: #2c2c2e; padding: 15px; border-radius: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; border: 1px solid #3a3a3c; }
            .icon { width: 40px; height: 40px; background: #007aff; border-radius: 50%; margin-right: 15px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
            .add-btn { background: #34c759; color: white; padding: 15px; border-radius: 12px; text-decoration: none; display: block; text-align: center; font-weight: bold; margin-top: 20px; }
        </style>
        <body>
            <h2>Your Managed Groups</h2>
            ${groupList || '<p style="text-align:center; color:gray;">Koi group nahi mila. Bot ko group mein add karein!</p>'}
            <a href="https://t.me/${process.env.BOT_USERNAME}?startgroup=true" class="add-btn">+ Add New Group</a>
        </body></html>`;
    }

    // VIEW 2: Individual Group Management (Click karne ke baad)
    return `<!DOCTYPE html>
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script></head>
    <style>
        body { font-family: sans-serif; background: #1c1c1d; color: white; padding: 20px; }
        .back-btn { color: #007aff; text-decoration: none; display: inline-block; margin-bottom: 20px; font-weight: bold; }
        .card { background: #2c2c2e; padding: 20px; border-radius: 15px; border: 1px solid #3a3a3c; }
        .row { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
        input[type="text"] { width: 100%; padding: 12px; border-radius: 10px; border: none; background: #3a3a3c; color: white; margin-top: 10px; }
        .save-btn { background: #007aff; color: white; border: none; padding: 15px; width: 100%; border-radius: 12px; font-weight: bold; margin-top: 20px; font-size: 16px; }
        label { font-size: 14px; color: #aaa; }
    </style>
    <body>
        <a href="/" class="back-btn">❮ Back to Dashboard</a>
        <div class="card">
            <h3>Management Tools</h3>
            <div class="row">
                <span>Anti-Link Protection</span>
                <input type="checkbox" id="links" ${settings?.antiLink ? 'checked' : ''}>
            </div>
            <div style="margin-top:20px;">
                <label>Welcome Message</label><br>
                <input type="text" id="welcome" placeholder="Welcome {name} to our group!" value="${settings?.welcomeMsg || ''}">
            </div>
        </div>
        <button class="save-btn" onclick="saveData()">Apply Changes</button>
        <script>
            function saveData() {
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

// 1. Group mein add hote hi DB mein save karna
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

// 2. Settings command (Bot URL generate karega)
bot.command('settings', (ctx) => {
    const webAppUrl = `https://${process.env.VERCEL_URL}`;
    ctx.reply(`Manage your groups via Mini App:`, 
        Markup.inlineKeyboard([Markup.button.webApp('⚙️ Open Dashboard', webAppUrl)])
    );
});

// 3. Mini App se data aane par settings update karna
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

// --- Vercel Handler ---
module.exports = async (req, res) => {
    const database = await connectDB();
    if (req.method === 'GET') {
        const gid = req.query.gid;
        res.setHeader('Content-Type', 'text/html');
        
        if (gid) {
            // Specific Group Settings View
            const settings = await database.collection('settings').findOne({ groupId: gid });
            return res.send(getHtml(null, gid, settings));
        } else {
            // Main Dashboard View
            const groups = await database.collection('chats').find({ active: true }).toArray();
            return res.send(getHtml(groups, null, null));
        }
    }
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
