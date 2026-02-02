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

// --- Dashboard UI with Separated Lists & Leaderboard ---
const getHtml = (groups, selectedGid, settings, members = [], chatInfo = null, leaderboard = []) => {
    const style = `
        <style>
            :root { --neon: #00f2ff; --purple: #bc13fe; --bg: #0a0a0c; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: white; padding: 15px; margin: 0; }
            .container { max-width: 500px; margin: auto; }
            
            /* Header Section */
            .group-header { 
                padding: 25px; background: linear-gradient(135deg, rgba(0,242,255,0.1), rgba(188,19,254,0.1));
                border-radius: 25px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 20px; text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            .group-title { font-size: 20px; font-weight: bold; text-shadow: 0 0 10px var(--neon); color: #fff; margin: 0; }
            .member-count { color: var(--neon); font-weight: bold; font-size: 13px; margin-top: 8px; display: block; letter-spacing: 1px; }

            /* Section Styling */
            .section-title { font-size: 11px; color: var(--neon); text-transform: uppercase; letter-spacing: 2px; margin: 25px 0 12px 5px; display: flex; align-items: center; gap: 10px; opacity: 0.8; }
            .section-title::after { content: ""; flex: 1; height: 1px; background: linear-gradient(to right, rgba(0,242,255,0.3), transparent); }

            .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 5px; border-radius: 20px; overflow: hidden; }
            
            /* Member Row */
            .user-row { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); }
            .user-row:last-child { border-bottom: none; }
            .user-info { display: flex; flex-direction: column; }
            .user-name { font-size: 14px; color: #eee; font-weight: 500; }
            .user-id { font-size: 10px; color: #555; font-family: monospace; margin-top: 2px; }
            
            /* Buttons */
            .btn-box { display: flex; gap: 5px; }
            .btn { border: none; color: white; border-radius: 6px; padding: 6px 12px; font-size: 10px; cursor: pointer; font-weight: bold; transition: 0.2s; }
            .btn:active { transform: scale(0.9); }
            .btn-mute { background: #ff9f0a; } .btn-ban { background: #ff375f; }
            .admin-tag { color: var(--purple); font-size: 9px; border: 1px solid var(--purple); padding: 3px 8px; border-radius: 5px; font-weight: bold; }

            /* Leaderboard */
            .rank-item { display: flex; align-items: center; gap: 12px; padding: 12px 15px; background: rgba(188,19,254,0.05); border-radius: 12px; margin: 8px; border: 1px solid rgba(188,19,254,0.1); }
            .rank-pos { font-size: 14px; font-weight: 900; color: var(--purple); width: 25px; }
            .rank-name { font-size: 13px; flex: 1; }
            .rank-score { color: var(--neon); font-weight: bold; font-size: 11px; background: rgba(0,242,255,0.1); padding: 2px 8px; border-radius: 10px; }

            .close-btn { background: var(--neon); color: #000; width: 100%; padding: 18px; border-radius: 18px; border: none; font-weight: 800; margin-top: 30px; cursor: pointer; box-shadow: 0 0 20px rgba(0,242,255,0.3); }
        </style>
    `;

    if (!selectedGid) {
        let list = groups.map(g => `<div class="user-row" style="background:#161618; margin-bottom:10px; border-radius:15px; border-left:4px solid var(--neon);" onclick="location.href='?gid=${g.groupId}'"><span>💎 ${g.groupName}</span><span>❯</span></div>`).join('');
        return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${style}</head><body><div class="container"><h2>YURI CORE</h2><div class="card" style="padding:10px;">${list || 'No Clusters Active'}</div></div></body></html>`;
    }

    // Separate Admins and Normal Members
    const adminList = members.filter(m => ['administrator', 'creator'].includes(m.status));
    // Note: 'members' usually only contains admins due to TG Privacy, 
    // unless the bot has seen other users recently.
    const normalList = members.filter(m => !['administrator', 'creator'].includes(m.status));

    return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>${style}</head>
    <body>
        <div class="container">
            <div class="group-header">
                <p class="group-title">${chatInfo?.title || 'Mainframe'}</p>
                <span class="member-count">👥 POPULATION: ${chatInfo?.members_count || '...'}</span>
            </div>

            <div class="section-title">Daily Live Leaderboard</div>
            <div class="card">
                ${leaderboard.map((u, i) => `
                    <div class="rank-item">
                        <span class="rank-pos">#${i+1}</span>
                        <span class="rank-name">${u.name}</span>
                        <span class="rank-score">${u.count} MSG</span>
                    </div>
                `).join('') || '<p style="text-align:center; padding:20px; font-size:11px; color:#555;">Scanning for activity...</p>'}
            </div>

            <div class="section-title">Crew (Admins)</div>
            <div class="card">
                ${adminList.map(m => `
                    <div class="user-row">
                        <div class="user-info">
                            <span class="user-name">${m.user.first_name} ${m.status === 'creator' ? '👑' : ''}</span>
                            <span class="user-id">ID: ${m.user.id}</span>
                        </div>
                        <span class="admin-tag">SHIELDED</span>
                    </div>
                `).join('')}
            </div>

            <div class="section-title">Normal Members</div>
            <div class="card">
                ${normalList.map(m => `
                    <div class="user-row">
                        <div class="user-info">
                            <span class="user-name">${m.user.first_name}</span>
                            <span class="user-id">ID: ${m.user.id}</span>
                        </div>
                        <div class="btn-box">
                            <button class="btn btn-mute" onclick="action('mute', '${m.user.id}')">MUTE</button>
                            <button class="btn btn-ban" onclick="action('ban', '${m.user.id}')">BAN</button>
                        </div>
                    </div>
                `).join('') || '<p style="text-align:center; padding:20px; font-size:11px; color:#555;">No members in current scan</p>'}
            </div>
            
            <button class="close-btn" onclick="window.Telegram.WebApp.close()">TERMINATE CONNECTION</button>
        </div>
        <script>
            function action(type, uid) {
                if(!confirm("Execute " + type + " protocol?")) return;
                fetch('/api?action=' + type, {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ gid: "${selectedGid}", uid: uid })
                }).then(res => res.json()).then(res => { 
                    window.Telegram.WebApp.showAlert(res.msg); 
                    if(res.ok) location.reload(); 
                });
            }
        </script>
    </body></html>`;
};

// --- Main API Handler ---
module.exports = async (req, res) => {
    const database = await connectDB();

    // 1. Message Tracking (Leaderboard)
    if (req.method === 'POST' && req.body.message) {
        const msg = req.body.message;
        if (msg.chat && msg.chat.type !== 'private') {
            const today = new Date().toISOString().split('T')[0];
            await database.collection('activity').updateOne(
                { gid: msg.chat.id.toString(), uid: msg.from.id.toString(), date: today },
                { $set: { name: msg.from.first_name }, $inc: { count: 1 } },
                { upsert: true }
            );
        }
    }

    // 2. Moderation Actions
    if (req.query.action && req.method === 'POST') {
        const { gid, uid } = req.body;
        try {
            if (req.query.action === 'ban') await bot.telegram.banChatMember(gid, uid);
            if (req.query.action === 'mute') await bot.telegram.restrictChatMember(gid, uid, { permissions: { can_send_messages: false } });
            return res.json({ ok: true, msg: "Protocol Success" });
        } catch (e) { return res.json({ ok: false, msg: "Denied: Bot lack rights" }); }
    }

    // 3. Page Rendering
    if (req.method === 'GET') {
        const gid = req.query.gid;
        res.setHeader('Content-Type', 'text/html');
        
        let members = [], chatInfo = null, leaderboard = [];
        if (gid) {
            try { 
                members = await bot.telegram.getChatAdministrators(gid); 
                chatInfo = await bot.telegram.getChat(gid);
                chatInfo.members_count = await bot.telegram.getChatMemberCount(gid);
                
                const today = new Date().toISOString().split('T')[0];
                leaderboard = await database.collection('activity')
                    .find({ gid: gid, date: today })
                    .sort({ count: -1 }).limit(5).toArray();
            } catch (e) {}
        }
        
        const groups = !gid ? await database.collection('chats').find({ active: true }).toArray() : [];
        return res.send(getHtml(groups, gid, null, members, chatInfo, leaderboard));
    }

    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
