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

const getHtml = (groups, selectedGid, settings, members = [], chatInfo = null) => {
    const style = `
        <style>
            :root { --neon: #00f2ff; --purple: #bc13fe; --bg: #0a0a0c; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: white; padding: 15px; margin: 0; }
            .container { max-width: 500px; margin: auto; }
            
            /* Group Info Header */
            .group-header { 
                display: flex; align-items: center; gap: 15px; padding: 20px;
                background: linear-gradient(135deg, rgba(0,242,255,0.1), rgba(188,19,254,0.1));
                border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px;
                box-shadow: 0 10px 20px rgba(0,0,0,0.5);
            }
            .group-pic { width: 55px; height: 55px; border-radius: 50%; border: 2px solid var(--neon); display: flex; align-items: center; justify-content: center; background: #222; font-size: 24px; box-shadow: 0 0 10px var(--neon); }
            .group-details h2 { margin: 0; font-size: 16px; text-shadow: 0 0 8px var(--neon); color: #fff; }
            .group-details p { margin: 3px 0; font-size: 10px; color: #aaa; font-family: monospace; }
            .member-count { color: var(--neon); font-weight: bold; font-size: 12px; margin-top: 5px; display: block; text-transform: uppercase; }

            .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); padding: 15px; border-radius: 20px; margin-bottom: 15px; }
            
            /* Member Item Styling */
            .admin-item { display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 12px; border-radius: 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.05); transition: 0.3s; }
            .user-info { display: flex; flex-direction: column; }
            .user-name { font-size: 13px; font-weight: 500; color: #eee; }
            .user-id { font-size: 10px; color: var(--neon); font-family: monospace; opacity: 0.8; margin-top: 2px; }
            
            /* Buttons */
            .btn { border: none; color: white; border-radius: 6px; padding: 6px 10px; font-size: 10px; cursor: pointer; font-weight: bold; margin-left: 4px; transition: 0.2s; }
            .btn:active { transform: scale(0.9); }
            .btn-mute { background: #ff9f0a; box-shadow: 0 0 5px rgba(255,159,10,0.4); }
            .btn-ban { background: #ff375f; box-shadow: 0 0 5px rgba(255,55,95,0.4); }
            .btn-ok { background: #30d158; box-shadow: 0 0 5px rgba(48,209,88,0.4); }
            
            .admin-tag { color: var(--neon); font-size: 9px; border: 1px solid var(--neon); padding: 2px 8px; border-radius: 4px; letter-spacing: 1px; font-weight: bold; }
            .save-btn { background: var(--neon); color: #000; width: 100%; padding: 15px; border-radius: 15px; font-weight: bold; border: none; cursor: pointer; margin-top: 10px; box-shadow: 0 0 20px rgba(0,242,255,0.4); text-transform: uppercase; }
        </style>
    `;

    if (!selectedGid) {
        let list = groups.map(g => `<div style="background:#161618; padding:15px; border-radius:12px; margin-bottom:10px; border-left:3px solid var(--neon); display:flex; justify-content:space-between;" onclick="location.href='?gid=${g.groupId}'"><span>💎 ${g.groupName}</span><span>❯</span></div>`).join('');
        return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${style}</head><body><div class="container"><h2>NEON TERMINAL</h2><div class="card"><h3>SELECT SECTOR</h3>${list || '<p style="text-align:center; color:#666;">No Groups Found</p>'}</div></div></body></html>`;
    }

    let memberListHtml = members.map(m => {
        const isUserAdmin = ['administrator', 'creator'].includes(m.status);
        return `
            <div class="admin-item">
                <div class="user-info">
                    <span class="user-name">${m.user.first_name} ${m.status === 'creator' ? '👑' : ''}</span>
                    <span class="user-id">ID: ${m.user.id}</span>
                </div>
                <div>
                    ${isUserAdmin 
                        ? `<span class="admin-tag">ADMIN</span>` 
                        : `
                            <button class="btn btn-mute" onclick="action('mute', '${m.user.id}')">MUTE</button>
                            <button class="btn btn-ban" onclick="action('ban', '${m.user.id}')">BAN</button>
                            <button class="btn btn-ok" onclick="action('unmute', '${m.user.id}')">✔</button>
                        `
                    }
                </div>
            </div>
        `;
    }).join('');

    return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>${style}</head>
    <body>
        <div class="container">
            <a href="/" style="color:var(--neon); text-decoration:none; font-size:12px; margin-bottom:15px; display:inline-block;">❮ BACK TO TERMINAL</a>
            
            <div class="group-header">
                <div class="group-pic">👥</div>
                <div class="group-details">
                    <h2>${chatInfo?.title || 'System Group'}</h2>
                    <p>CHAT ID: ${selectedGid}</p>
                    <span class="member-count">👥 TOTAL POPULATION: ${chatInfo?.members_count || '...'}</span>
                </div>
            </div>

            <div class="card">
                <h3 style="font-size:11px; margin:0 0 15px 0; color:#666; letter-spacing:1px;">MODERATION SECTOR</h3>
                ${memberListHtml}
            </div>
            
            <button class="save-btn" onclick="window.Telegram.WebApp.close()">CLOSE CONNECTION</button>
        </div>
        <script>
            let tg = window.Telegram.WebApp;
            tg.expand();
            tg.setHeaderColor('#0a0a0c');

            function action(type, uid) {
                if(!confirm("Execute " + type + " protocol for ID: " + uid + "?")) return;
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

// --- Main Handler ---
module.exports = async (req, res) => {
    const database = await connectDB();

    // 1. Actions Logic
    if (req.query.action && req.method === 'POST') {
        const { gid, uid } = req.body;
        try {
            if (req.query.action === 'ban') await bot.telegram.banChatMember(gid, uid);
            if (req.query.action === 'mute') await bot.telegram.restrictChatMember(gid, uid, { permissions: { can_send_messages: false } });
            if (req.query.action === 'unmute') await bot.telegram.restrictChatMember(gid, uid, { permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true }});
            return res.json({ ok: true, msg: "Protocol executed successfully!" });
        } catch (e) { return res.json({ ok: false, msg: "Execution Failed: Bot lacks permissions." }); }
    }

    // 2. View Logic
    if (req.method === 'GET') {
        const gid = req.query.gid;
        res.setHeader('Content-Type', 'text/html');
        const settings = gid ? await database.collection('settings').findOne({ groupId: gid }) : null;
        let members = [], chatInfo = null;
        if (gid) {
            try { 
                members = await bot.telegram.getChatAdministrators(gid); 
                chatInfo = await bot.telegram.getChat(gid);
                chatInfo.members_count = await bot.telegram.getChatMemberCount(gid);
            } catch (e) { console.error("Data fetch error"); }
        }
        const groups = !gid ? await database.collection('chats').find({ active: true }).toArray() : [];
        return res.send(getHtml(groups, gid, settings, members, chatInfo));
    }

    // 3. Webhook Updates
    if (req.body && req.body.my_chat_member) {
        const chat = req.body.my_chat_member.chat;
        await database.collection('chats').updateOne(
            { groupId: chat.id.toString() },
            { $set: { groupName: chat.title, active: true } },
            { upsert: true }
        );
    }
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};

// --- Bot Commands ---
bot.command('settings', async (ctx) => {
    if (!(await isAdmin(ctx))) return ctx.reply("❌ ACCESS DENIED: ADMIN ONLY.");
    ctx.reply('🛠️ OPENING SECURE TERMINAL...', Markup.inlineKeyboard([
        Markup.button.webApp('🔗 DASHBOARD', `https://${process.env.VERCEL_URL}?gid=${ctx.chat.id}`)
    ]));
});
