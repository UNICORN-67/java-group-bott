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

// --- Helper: Check Admin Status ---
async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

const getHtml = (groups, selectedGid, settings, admins = []) => {
    const style = `
        <style>
            :root { --neon: #00f2ff; --purple: #bc13fe; --bg: #0a0a0c; --glass: rgba(255, 255, 255, 0.05); }
            body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: white; margin: 0; padding: 15px; overflow-x: hidden; }
            
            .container { max-width: 600px; margin: auto; }
            h2, h3 { text-shadow: 0 0 10px var(--neon); letter-spacing: 2px; text-transform: uppercase; text-align: center; }
            
            .card { 
                background: var(--glass); 
                backdrop-filter: blur(15px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 20px; border-radius: 20px; margin-bottom: 20px; 
                box-shadow: 0 15px 35px rgba(0,0,0,0.7);
                transform: perspective(1000px) rotateX(2deg);
            }

            .group-card {
                display: flex; justify-content: space-between; align-items: center;
                background: linear-gradient(145deg, #1a1a1c, #0d0d0f);
                border-left: 3px solid var(--neon);
                padding: 15px; border-radius: 12px; margin-bottom: 12px;
                cursor: pointer; transition: 0.3s;
            }
            .group-card:hover { transform: translateX(5px); box-shadow: 0 0 15px var(--neon); }

            .row { display: flex; justify-content: space-between; align-items: center; margin: 15px 0; }

            /* Neon Switch */
            .switch { position: relative; width: 45px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { 
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; 
                background: #333; transition: .4s; border-radius: 34px; 
            }
            .slider:before { 
                position: absolute; content: ""; height: 16px; width: 16px; left: 4px; bottom: 4px; 
                background: white; transition: .4s; border-radius: 50%; 
            }
            input:checked + .slider { background: var(--purple); box-shadow: 0 0 15px var(--purple); }
            input:checked + .slider:before { transform: translateX(21px); }

            input[type="text"] { 
                width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #444; 
                background: rgba(0,0,0,0.5); color: white; margin-top: 8px; outline: none;
            }
            input[type="text"]:focus { border-color: var(--neon); box-shadow: 0 0 10px var(--neon); }

            .btn { 
                border: none; color: white; border-radius: 8px; padding: 6px 10px; 
                font-weight: bold; cursor: pointer; font-size: 10px; transition: 0.3s;
            }
            .btn-save { 
                background: var(--neon); color: black; width: 100%; padding: 15px; 
                border-radius: 15px; margin-top: 15px; font-size: 14px; font-weight: 800;
                box-shadow: 0 0 20px rgba(0, 242, 255, 0.3);
            }
            .btn-mute { background: #ff9f0a; }
            .btn-ban { background: #ff375f; }
            .btn-ok { background: #30d158; }

            .admin-item {
                display: flex; justify-content: space-between; align-items: center;
                background: rgba(255,255,255,0.03); padding: 10px; border-radius: 10px; margin-bottom: 8px;
            }
            .back-link { color: var(--neon); text-decoration: none; font-size: 12px; display: inline-block; margin-bottom: 10px; }
        </style>
    `;

    if (!selectedGid) {
        let list = groups.map(g => `<div class="group-card" onclick="location.href='?gid=${g.groupId}'"><span>💎 ${g.groupName || 'Unknown Chat'}</span><span>❯</span></div>`).join('');
        return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${style}</head><body>
            <div class="container">
                <h2>NEON CORE</h2>
                <div class="card"><h3>ACTIVE SECTORS</h3>${list || '<p style="text-align:center;color:#666;">No Groups Detected</p>'}</div>
                <a href="https://t.me/${process.env.BOT_USERNAME}?startgroup=true" class="btn-save" style="text-decoration:none; display:block; text-align:center;">+ LINK NEW SECTOR</a>
            </div>
        </body></html>`;
    }

    const isAntiLinkChecked = settings && settings.antiLink === true ? 'checked' : '';
    let adminHtml = admins.map(a => `
        <div class="admin-item">
            <span style="font-size:13px;">${a.user.first_name} ${a.status === 'creator' ? '👑' : ''}</span>
            ${a.status !== 'creator' ? `
                <div>
                    <button class="btn btn-mute" onclick="action('mute', '${a.user.id}')">MUTE</button>
                    <button class="btn btn-ban" onclick="action('ban', '${a.user.id}')">BAN</button>
                    <button class="btn btn-ok" onclick="action('unmute', '${a.user.id}')">✔</button>
                </div>
            ` : ''}
        </div>
    `).join('');

    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>${style}</head>
    <body>
        <div class="container">
            <a href="/" class="back-link">❮ TERMINAL HOME</a>
            <div class="card">
                <h3>CORE CONFIG</h3>
                <div class="row"><span>ANTI-LINK MODULE</span><label class="switch"><input type="checkbox" id="links" ${isAntiLinkChecked}><span class="slider"></span></label></div>
                <label style="color:#666; font-size:11px;">GREETING PROTOCOL</label>
                <input type="text" id="welcome" value="${settings?.welcomeMsg || ''}" placeholder="System greeting text...">
                <button class="btn btn-save" onclick="save()">SYNC WITH DATABASE</button>
            </div>
            <div class="card">
                <h3 style="color:var(--purple); text-shadow: 0 0 10px var(--purple);">CREW MEMBERS</h3>
                ${adminHtml}
            </div>
        </div>
        <script>
            let tg = window.Telegram.WebApp;
            tg.expand();
            tg.setHeaderColor('#0a0a0c');

            function save() {
                const data = { gid: "${selectedGid}", links: document.getElementById('links').checked, welcome: document.getElementById('welcome').value };
                fetch('/api?save=true', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) })
                .then(() => { 
                    tg.showScanQrPopup({text: "DATA SYNCED"}); 
                    setTimeout(()=>tg.closeScanQrPopup(), 1000); 
                });
            }

            function action(type, uid) {
                if(!confirm("Execute " + type + " protocol?")) return;
                fetch('/api?action=' + type, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ gid: "${selectedGid}", uid: uid })
                }).then(res => res.json()).then(res => { 
                    tg.showAlert(res.msg); 
                    if(res.ok) location.reload(); 
                });
            }
        </script>
    </body></html>`;
};

// --- Bot & API Logic ---
module.exports = async (req, res) => {
    const database = await connectDB();

    // 1. Actions Handler (Ban/Mute/Unmute)
    if (req.query.action && req.method === 'POST') {
        const { gid, uid } = req.body;
        try {
            if (req.query.action === 'ban') await bot.telegram.banChatMember(gid, uid);
            if (req.query.action === 'mute') await bot.telegram.restrictChatMember(gid, uid, { permissions: { can_send_messages: false } });
            if (req.query.action === 'unmute') await bot.telegram.restrictChatMember(gid, uid, { permissions: { 
                can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true 
            }});
            return res.json({ ok: true, msg: "Protocol Executed!" });
        } catch (e) { return res.json({ ok: false, msg: "Access Denied / Error" }); }
    }

    // 2. Save Settings Handler
    if (req.query.save === 'true' && req.method === 'POST') {
        const { gid, links, welcome } = req.body;
        await database.collection('settings').updateOne(
            { groupId: gid }, 
            { $set: { antiLink: Boolean(links), welcomeMsg: welcome } }, 
            { upsert: true }
        );
        return res.status(200).json({ ok: true });
    }

    // 3. Page View Handler
    if (req.method === 'GET') {
        const gid = req.query.gid;
        res.setHeader('Content-Type', 'text/html');
        const settings = gid ? await database.collection('settings').findOne({ groupId: gid }) : null;
        let admins = gid ? await bot.telegram.getChatAdministrators(gid).catch(()=>[]) : [];
        const groups = !gid ? await database.collection('chats').find({ active: true }).toArray() : [];
        return res.send(getHtml(groups, gid, settings, admins));
    }

    // 4. Telegram Webhook Updates
    if (req.method === 'POST') {
        // Group Added Logic
        if (req.body.my_chat_member) {
            const chat = req.body.my_chat_member.chat;
            await database.collection('chats').updateOne(
                { groupId: chat.id.toString() },
                { $set: { groupName: chat.title, active: true } },
                { upsert: true }
            );
        }
        await bot.handleUpdate(req.body);
        return res.status(200).send('OK');
    }
};

// Bot Logic for messages
bot.on('new_chat_members', async (ctx) => {
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.welcomeMsg) {
        ctx.message.new_chat_members.forEach(m => ctx.reply(config.welcomeMsg.replace('{name}', m.first_name)));
    }
});

bot.on('message', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    if (await isAdmin(ctx)) return next();
    const database = await connectDB();
    const config = await database.collection('settings').findOne({ groupId: ctx.chat.id.toString() });
    if (config?.antiLink && ctx.message.entities?.some(e => e.type === 'url' || e.type === 'text_link')) {
        await ctx.deleteMessage().catch(() => {});
        return;
    }
    return next();
});

bot.command('settings', async (ctx) => {
    if (!(await isAdmin(ctx))) return ctx.reply("❌ ADMIN ACCESS ONLY.");
    ctx.reply('⚙️ ACCESS TERMINAL:', Markup.inlineKeyboard([
        Markup.button.webApp('OPEN DASHBOARD', `https://${process.env.VERCEL_URL}?gid=${ctx.chat.id}`)
    ]));
});
