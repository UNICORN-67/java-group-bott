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
    // --- NEON 3D STYLING ---
    const style = `
        <style>
            :root { --neon: #00f2ff; --purple: #bc13fe; --bg: #0a0a0c; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: white; margin: 0; padding: 20px; overflow-x: hidden; }
            h2, h3 { text-shadow: 0 0 10px var(--neon); letter-spacing: 1px; }
            
            .card { 
                background: rgba(255, 255, 255, 0.05); 
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                padding: 20px; 
                border-radius: 20px; 
                margin-bottom: 20px; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                transform: perspective(1000px) rotateX(2deg);
                transition: transform 0.3s ease;
            }
            .card:active { transform: scale(0.98); }

            .group-card {
                display: flex; justify-content: space-between; align-items: center;
                background: linear-gradient(145deg, #161618, #0a0a0c);
                border-left: 4px solid var(--neon);
                padding: 15px; border-radius: 12px; margin-bottom: 12px;
                cursor: pointer; box-shadow: 5px 5px 15px rgba(0,0,0,0.3);
            }

            .row { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }

            /* Neon Switch */
            .switch { position: relative; width: 50px; height: 26px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { 
                position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; 
                background: #333; transition: .4s; border-radius: 34px; 
                box-shadow: inset 0 0 5px rgba(0,0,0,0.5);
            }
            .slider:before { 
                position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; 
                background: white; transition: .4s; border-radius: 50%; 
            }
            input:checked + .slider { background: var(--purple); box-shadow: 0 0 15px var(--purple); }
            input:checked + .slider:before { transform: translateX(24px); }

            input[type="text"] { 
                width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #444; 
                background: rgba(0,0,0,0.3); color: white; margin-top: 10px; box-sizing: border-box;
                outline: none; transition: 0.3s;
            }
            input[type="text"]:focus { border-color: var(--neon); box-shadow: 0 0 10px var(--neon); }

            .btn { 
                border: none; color: white; border-radius: 8px; padding: 8px 12px; 
                font-weight: bold; cursor: pointer; text-transform: uppercase; font-size: 11px;
                transition: 0.3s;
            }
            .btn-save { 
                background: var(--neon); color: black; width: 100%; padding: 15px; 
                border-radius: 15px; margin-top: 10px; font-size: 16px;
                box-shadow: 0 0 20px rgba(0, 242, 255, 0.4);
            }
            .btn-mute { background: #ff9f0a; box-shadow: 0 0 10px rgba(255, 159, 10, 0.3); }
            .btn-ban { background: #ff375f; box-shadow: 0 0 10px rgba(255, 55, 95, 0.3); }
            .btn-ok { background: #30d158; box-shadow: 0 0 10px rgba(48, 209, 88, 0.3); }

            .admin-item {
                display: flex; justify-content: space-between; align-items: center;
                background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; margin-bottom: 8px;
            }
        </style>
    `;

    if (!selectedGid) {
        let list = groups.map(g => `<div class="group-card" onclick="location.href='?gid=${g.groupId}'"><span>💎 ${g.groupName || 'Unknown'}</span><span style="color:var(--neon)">❯</span></div>`).join('');
        return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${style}</head><body>
            <h2 style="text-align:center;">NEON CORE</h2>
            <div class="card"><h4>SELECT SECTOR</h4>${list}</div>
            <a href="https://t.me/${process.env.BOT_USERNAME}?startgroup=true" class="btn-save" style="text-decoration:none; display:block; text-align:center;">+ LINK NEW CHAT</a>
        </body></html>`;
    }

    const isAntiLinkChecked = settings && settings.antiLink === true ? 'checked' : '';
    let adminHtml = admins.map(a => `
        <div class="admin-item">
            <span>${a.user.first_name} ${a.status === 'creator' ? '👑' : ''}</span>
            ${a.status !== 'creator' ? `
                <div>
                    <button class="btn btn-mute" onclick="action('mute', '${a.user.id}')">Mute</button>
                    <button class="btn btn-ban" onclick="action('ban', '${a.user.id}')">Ban</button>
                    <button class="btn btn-ok" onclick="action('unmute', '${a.user.id}')">✔</button>
                </div>
            ` : ''}
        </div>
    `).join('');

    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>${style}</head>
    <body>
        <a href="/" style="color:var(--neon); text-decoration:none; font-size:14px;">❮ TERMINAL HOME</a>
        <div class="card" style="margin-top:20px;">
            <h3>SYSTEM CONFIG</h3>
            <div class="row"><span>ANTI-LINK MODULE</span><label class="switch"><input type="checkbox" id="links" ${isAntiLinkChecked}><span class="slider"></span></label></div>
            <label style="color:#666; font-size:11px;">GREETING PROTOCOL</label>
            <input type="text" id="welcome" value="${settings?.welcomeMsg || ''}" placeholder="Enter welcome text...">
            <button class="btn btn-save" onclick="save()">UPDATE DATABASE</button>
        </div>
        <div class="card">
            <h3 style="color:var(--purple); text-shadow: 0 0 10px var(--purple);">CREW MEMBERS</h3>
            ${adminHtml}
        </div>
        <script>
            let tg = window.Telegram.WebApp;
            tg.expand();
            function save() {
                const data = { gid: "${selectedGid}", links: document.getElementById('links').checked, welcome: document.getElementById('welcome').value };
                fetch('/api?save=true', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) })
                .then(() => { tg.showScanQrPopup({text: "SYNC COMPLETE"}); setTimeout(()=>tg.closeScanQrPopup(), 1000); });
            }
            function action(type, uid) {
                fetch('/api?action=' + type, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ gid: "${selectedGid}", uid: uid })
                }).then(res => res.json()).then(res => { tg.showAlert(res.msg); if(res.ok) location.reload(); });
            }
        </script>
    </body></html>`;
};

// --- REST OF THE CODE (MODERATION, SAVE, GET HANDLERS) ---
// (Copy previous API logic for POST/GET here exactly as it was)
module.exports = async (req, res) => {
    const database = await connectDB();

    if (req.query.action && req.method === 'POST') {
        const { gid, uid } = req.body;
        try {
            if (req.query.action === 'ban') { await bot.telegram.banChatMember(gid, uid); return res.json({ ok: true, msg: "Banned!" }); }
            if (req.query.action === 'mute') { await bot.telegram.restrictChatMember(gid, uid, { permissions: { can_send_messages: false } }); return res.json({ ok: true, msg: "Muted!" }); }
            if (req.query.action === 'unmute') { await bot.telegram.restrictChatMember(gid, uid, { permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true }}); return res.json({ ok: true, msg: "Unmuted!" }); }
        } catch (e) { return res.json({ ok: false, msg: "Error!" }); }
    }

    if (req.query.save === 'true' && req.method === 'POST') {
        const { gid, links, welcome } = req.body;
        await database.collection('settings').updateOne({ groupId: gid }, { $set: { antiLink: Boolean(links), welcomeMsg: welcome } }, { upsert: true });
        return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
        const gid = req.query.gid;
        res.setHeader('Content-Type', 'text/html');
        const settings = gid ? await database.collection('settings').findOne({ groupId: gid }) : null;
        let admins = gid ? await bot.telegram.getChatAdministrators(gid).catch(()=>[]) : [];
        const groups = !gid ? await database.collection('chats').find({ active: true }).toArray() : [];
        return res.send(getHtml(groups, gid, settings, admins));
    }

    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
