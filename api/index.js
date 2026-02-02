const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

// --- CONFIGURATION ---
const blacklistedWords = [
    'xxx', 'porn', 'sex', 'fuck', 'bitch', 'asshole', 'dick', 'pussy', 'bastard', 
    'gaali', 'bc', 'mc', 'bsdk', 'bhenchod', 'madarchod', 'gand', 'loda', 'lauda', 
    'chutiya', 'harami', 'randi', 'saala', 'kamina', 'behenchod', 'maderchod',
    'poda', 'behen k lode', 'gandu', 'mkl', 'bkl', 'tatte', 'jhant'
];

async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

// --- GHOST MODE HELPERS ---
const fullClean = async (ctx, botMsgId, timer = 10000) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    setTimeout(async () => {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, botMsgId); } catch (e) {}
    }, timer);
};

const ghostReply = async (ctx, text, timer = 5000) => {
    const m = await ctx.reply(text);
    setTimeout(() => {
        ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(e => {});
    }, timer);
};

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

// --- SILENT BIO-LINK SCANNER & WELCOME ---
bot.on('new_chat_members', async (ctx) => {
    const newUser = ctx.from;
    try {
        const fullUser = await ctx.telegram.getChat(newUser.id);
        const bio = fullUser.bio || "";
        const linkPattern = /(https?:\/\/|t\.me|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/;

        if (linkPattern.test(bio)) {
            await ctx.banChatMember(newUser.id);
            await ctx.deleteMessage(); 
            return; 
        }

        const m = await ctx.reply(`Welcome ${newUser.first_name} to the Sector! 🚀\nKeep it clean.`);
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(e => {});
        }, 30000);
    } catch (e) {}
});

// --- HEAVY WORD FILTER ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    const msgText = ctx.message.text.toLowerCase();
    const hasBadWord = blacklistedWords.some(word => msgText.includes(word));

    if (hasBadWord && !(await isAdmin(ctx))) {
        await ctx.deleteMessage();
        return ghostReply(ctx, `⚠️ No abusive language, ${ctx.from.first_name}!`);
    }
    return next();
});

// --- COMMANDS (AUTO-CLEAN) ---
bot.command('ping', async (ctx) => {
    const start = Date.now();
    const m = await ctx.reply('🛰️ Scanning...');
    const diff = Date.now() - start;
    await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `🏓 **Pong!**\n⏱️ Speed: \`${diff}ms\``, { parse_mode: 'Markdown' });
    fullClean(ctx, m.message_id);
});

bot.command('speed', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    const m = await ctx.reply('🚀 **Speed:** 1.2GB/s\n✅ All Systems Operational.');
    setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id), 10000);
});

bot.command('info', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    let target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
    const msg = await ctx.reply(`👤 **IDENTITY:**\n🆔 ID: \`${target.id}\`\n📛 Name: ${target.first_name}`, { parse_mode: 'Markdown' });
    fullClean(ctx, msg.message_id);
});

bot.command(['ban', 'mute', 'unmute'], async (ctx) => {
    if (ctx.chat.type === 'private' || !(await isAdmin(ctx))) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const target = ctx.message.reply_to_message;
    if (!target) return ghostReply(ctx, "⚠️ Reply to a user!", 5000);

    try {
        if (cmd === 'ban') await ctx.banChatMember(target.from.id);
        if (cmd === 'mute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: true } });
        const res = await ctx.reply(`✅ Protocol ${cmd.toUpperCase()} set for ${target.from.first_name}`);
        fullClean(ctx, res.message_id);
    } catch (e) { ghostReply(ctx, "❌ Error: High-level override failed."); }
});

// --- DASHBOARD UI (NEON) ---
const getHtml = (groups, selectedGid, members = [], chatInfo = null, leaderboard = []) => {
    const style = `<style>
        :root { --neon: #00f2ff; --purple: #bc13fe; --bg: #0a0a0c; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: white; padding: 15px; margin: 0; }
        .group-header { padding: 20px; background: linear-gradient(135deg, rgba(0,242,255,0.1), rgba(188,19,254,0.1)); border-radius: 20px; text-align: center; border: 1px solid rgba(255,255,255,0.1); }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 15px; padding: 10px; margin-top: 15px; }
        .user-row { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .btn { background: var(--neon); color: black; border: none; padding: 5px 10px; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 10px; }
        .rank-item { display: flex; justify-content: space-between; padding: 10px; background: rgba(188,19,254,0.05); border-radius: 10px; margin-bottom: 5px; }
    </style>`;

    if (!selectedGid) {
        let list = groups.map(g => `<div class="user-row" onclick="location.href='?gid=${g.groupId}'">💎 ${g.groupName} <span>❯</span></div>`).join('');
        return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${style}</head><body><h2>YURI TERMINAL</h2><div class="card">${list}</div></body></html>`;
    }

    return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>${style}</head>
    <body>
        <div class="group-header">
            <h3>${chatInfo?.title || 'System'}</h3>
            <span style="color:var(--neon)">Members: ${chatInfo?.members_count || 'N/A'}</span>
        </div>
        <div class="card">
            <h4 style="margin:0 0 10px 0; font-size:12px;">🏆 DAILY LEADERBOARD</h4>
            ${leaderboard.map((u, i) => `<div class="rank-item"><span>#${i+1} ${u.name}</span> <span style="color:var(--neon)">${u.count} MSG</span></div>`).join('') || 'No data'}
        </div>
        <div class="card">
            <h4 style="margin:0 0 10px 0; font-size:12px;">👥 RECENT MEMBERS</h4>
            ${members.filter(m => m.status !== 'creator').map(m => `
                <div class="user-row">
                    <span>${m.user.first_name}<br><small style="color:#666">ID: ${m.user.id}</small></span>
                    <button class="btn" onclick="action('ban', '${m.user.id}')">BAN</button>
                </div>`).join('')}
        </div>
        <script>
            function action(type, uid) {
                fetch('/api?action=' + type, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ gid: "${selectedGid}", uid: uid }) })
                .then(() => location.reload());
            }
        </script>
    </body></html>`;
};

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    const database = await connectDB();

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

    if (req.query.action && req.method === 'POST') {
        const { gid, uid } = req.body;
        if (req.query.action === 'ban') await bot.telegram.banChatMember(gid, uid);
        return res.json({ ok: true });
    }

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
                leaderboard = await database.collection('activity').find({ gid: gid, date: today }).sort({ count: -1 }).limit(5).toArray();
            } catch (e) {}
        }
        const groups = !gid ? await database.collection('chats').find({ active: true }).toArray() : [];
        return res.send(getHtml(groups, gid, members, chatInfo, leaderboard));
    }

    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
