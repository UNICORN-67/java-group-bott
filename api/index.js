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

// --- HELPERS ---
const escapeHTML = (str) => {
    if (!str) return "";
    return str.replace(/[&<>]/g, (tag) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;'
    }[tag] || tag));
};

async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

const fullClean = async (ctx, botMsgId, timer = 10000) => {
    try { await ctx.deleteMessage().catch(() => {}); } catch (e) {}
    setTimeout(async () => {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, botMsgId).catch(() => {}); } catch (e) {}
    }, timer);
};

const ghostReply = async (ctx, text, timer = 5000) => {
    const m = await ctx.reply(text, { parse_mode: 'HTML' }).catch(() => {});
    if (m) {
        setTimeout(() => {
            ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {});
        }, timer);
    }
};

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

// --- LOGIC: SILENT BIO SCAN & WELCOME ---
bot.on('new_chat_members', async (ctx) => {
    const newUser = ctx.from;
    try {
        const fullUser = await ctx.telegram.getChat(newUser.id);
        const bio = fullUser.bio || "";
        const linkPattern = /(https?:\/\/|t\.me|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/;

        if (linkPattern.test(bio)) {
            await ctx.banChatMember(newUser.id).catch(() => {});
            await ctx.deleteMessage().catch(() => {}); 
            return; 
        }

        const safeName = escapeHTML(newUser.first_name);
        const m = await ctx.reply(`<b>Welcome ${safeName} to the Sector!</b> 🚀\nKeep it clean.`, { parse_mode: 'HTML' });
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}), 30000);
    } catch (e) {}
});

// --- LOGIC: WORD FILTER ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text) return next();
    const msgText = ctx.message.text.toLowerCase();
    const hasBadWord = blacklistedWords.some(word => msgText.includes(word));

    if (hasBadWord && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        return ghostReply(ctx, `⚠️ <b>No abusive language, ${escapeHTML(ctx.from.first_name)}!</b>`);
    }
    return next();
});

// --- COMMANDS ---
bot.command('ping', async (ctx) => {
    const start = Date.now();
    const m = await ctx.reply('🛰️ <b>Scanning...</b>', { parse_mode: 'HTML' });
    const diff = Date.now() - start;
    await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `🏓 <b>Pong!</b>\n⏱️ Speed: <code>${diff}ms</code>`, { parse_mode: 'HTML' }).catch(() => {});
    fullClean(ctx, m.message_id);
});

bot.command('info', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    let target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
    const safeName = escapeHTML(target.first_name);
    const msg = await ctx.reply(`👤 <b>IDENTITY:</b>\n🆔 <b>ID:</b> <code>${target.id}</code>\n📛 <b>Name:</b> ${safeName}`, { parse_mode: 'HTML' });
    fullClean(ctx, msg.message_id);
});

bot.command(['ban', 'mute', 'unmute'], async (ctx) => {
    if (ctx.chat.type === 'private' || !(await isAdmin(ctx))) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const target = ctx.message.reply_to_message;
    if (!target) return ghostReply(ctx, "⚠️ <b>Reply to a user!</b>", 5000);

    try {
        if (cmd === 'ban') await ctx.banChatMember(target.from.id);
        if (cmd === 'mute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: true } });
        const res = await ctx.reply(`✅ <b>Protocol ${cmd.toUpperCase()} Success:</b> ${escapeHTML(target.from.first_name)}`, { parse_mode: 'HTML' });
        fullClean(ctx, res.message_id);
    } catch (e) { ghostReply(ctx, "❌ <b>Error: Override failed.</b>"); }
});

// --- DASHBOARD UI ---
const getHtml = (groups, selectedGid, members = [], chatInfo = null, leaderboard = []) => {
    const style = `<style>
        :root { --neon: #00f2ff; --purple: #bc13fe; --bg: #0a0a0c; }
        body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: white; padding: 15px; margin: 0; }
        .header { padding: 20px; background: linear-gradient(135deg, rgba(0,242,255,0.1), rgba(188,19,254,0.1)); border-radius: 20px; text-align: center; border: 1px solid rgba(255,255,255,0.1); }
        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 15px; padding: 10px; margin-top: 15px; }
        .row { display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    </style>`;

    if (!selectedGid) {
        let list = groups.map(g => `<div class="row" onclick="location.href='?gid=${g.groupId}'">💎 ${escapeHTML(g.groupName)} <span>❯</span></div>`).join('');
        return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">${style}</head><body><h2>YURI TERMINAL</h2><div class="card">${list || 'No Clusters'}</div></body></html>`;
    }

    return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://telegram.org/js/telegram-web-app.js"></script>${style}</head>
    <body>
        <div class="header">
            <h3>${escapeHTML(chatInfo?.title || 'System')}</h3>
            <span style="color:var(--neon)">Population: ${chatInfo?.members_count || 'N/A'}</span>
        </div>
        <div class="card">
            <h4 style="margin:0;">🏆 LEADERBOARD</h4>
            ${leaderboard.map((u, i) => `<div class="row"><span>#${i+1} ${escapeHTML(u.name)}</span> <b>${u.count}</b></div>`).join('') || 'No data'}
        </div>
        <script>
            function action(type, uid) {
                fetch('/api?action=' + type, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ gid: "${selectedGid}", uid: uid }) }).then(() => location.reload());
            }
        </script>
    </body></html>`;
};

// --- MAIN HANDLER ---
module.exports = async (req, res) => {
    const database = await connectDB();

    if (req.method === 'POST' && req.body.message) {
        const msg = req.body.message;
        if (msg.chat && msg.chat.type !== 'private' && msg.from) {
            const today = new Date().toISOString().split('T')[0];
            await database.collection('activity').updateOne(
                { gid: msg.chat.id.toString(), uid: msg.from.id.toString(), date: today },
                { $set: { name: escapeHTML(msg.from.first_name) }, $inc: { count: 1 } },
                { upsert: true }
            );
        }
    }

    if (req.query.action && req.method === 'POST') {
        const { gid, uid } = req.body;
        if (req.query.action === 'ban') await bot.telegram.banChatMember(gid, uid).catch(() => {});
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
