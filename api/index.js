const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;
let taggingProcess = {};
const OWNER_ID = parseInt(process.env.OWNER_ID); // Vercel dashboard mein apni ID daalein

// --- 1. HELPERS & DB ---
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

const escapeHTML = (str) => { 
    if (!str) return ""; 
    return str.replace(/[&<>]/g, (t) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[t] || t)); 
};

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try { 
        const m = await ctx.getChatMember(ctx.from.id); 
        return ['administrator', 'creator'].includes(m.status); 
    } catch (e) { return false; }
}

const fullClean = async (ctx, botMsgId, timer = 10000) => {
    try { await ctx.deleteMessage().catch(() => {}); } catch (e) {}
    setTimeout(async () => { 
        try { await ctx.telegram.deleteMessage(ctx.chat.id, botMsgId).catch(() => {}); } catch (e) {} 
    }, timer);
};

// --- 2. OPENAI SMART BRAIN (Natural Context) ---
async function getSmartAIReply(userMessage, userName, historyContext) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: `You are Yuri, a witty, real girl. Talk in natural, short Hinglish. Context: ${historyContext}. Be friendly and don't act like a bot.` },
                { role: "user", content: `${userName} said: ${userMessage}` }
            ],
            max_tokens: 80,
            temperature: 0.8
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    } catch (e) { return null; }
}

// --- 3. START & HELP ---
bot.start((ctx) => {
    ctx.reply(`✨ <b>Yuri AI Active!</b>\n\nMain group manage bhi karti hoon aur baatein bhi. Command list ke liye /help likho.`, { parse_mode: 'HTML' });
});

bot.help(async (ctx) => {
    let helpMsg = `📖 <b>Yuri AI Help Menu</b>\n\n` +
        `👤 <b>Users:</b> /info, /start\n` +
        `👮 <b>Admins:</b> /ban, /unban, /mute, /unmute, /pin, /unpin, /purge, /tagall, /cancel\n` +
        `👑 <b>Owner:</b> /leaderboard, /ping, /speed`;
    const m = await ctx.reply(helpMsg, { parse_mode: 'HTML' });
    if (ctx.chat.type !== 'private') fullClean(ctx, m.message_id, 30000);
});

// --- 4. MAIN TEXT & AI LOGIC ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text || ctx.message.text.startsWith('/')) return next();
    
    const msg = ctx.message;
    const name = escapeHTML(ctx.from.first_name);
    const database = await connectDB();
    const gid = ctx.chat.id.toString();
    const today = new Date().toISOString().split('T')[0];

    // Tracking for Leaderboard
    await database.collection('activity').updateOne({ gid, uid: ctx.from.id.toString(), date: today }, { $set: { name }, $inc: { count: 1 } }, { upsert: true });
    
    // Tracking for Tags
    await database.collection('members').updateOne({ gid, uid: ctx.from.id.toString() }, { $set: { uid: ctx.from.id.toString() } }, { upsert: true });

    // Save History
    await database.collection('context').insertOne({ gid, text: msg.text, name, time: new Date() });

    const isYuri = msg.text.toLowerCase().includes("yuri");
    const isBotReply = msg.reply_to_message && msg.reply_to_message.from.id === ctx.botInfo.id;
    const randomJump = Math.random() < 0.25;

    if (isYuri || isBotReply || randomJump) {
        const history = await database.collection('context').find({ gid }).sort({ time: -1 }).limit(3).toArray();
        const historyStr = history.map(h => `${h.name}: ${h.text}`).join(' | ');

        setTimeout(async () => {
            ctx.sendChatAction('typing');
            const reply = await getSmartAIReply(msg.text, name, historyStr);
            if (reply) await ctx.reply(reply, { reply_to_message_id: msg.message_id });
        }, 1500);
    }
    return next();
});

// --- 5. OWNER ONLY (Ping, Speed, Leaderboard) ---
bot.command(['ping', 'speed', 'leaderboard'], async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const db = await connectDB();

    if (cmd === 'leaderboard') {
        const today = new Date().toISOString().split('T')[0];
        const top = await db.collection('activity').find({ gid: ctx.chat.id.toString(), date: today }).sort({ count: -1 }).limit(10).toArray();
        if (!top.length) return ctx.reply("Aaj koi activity nahi hui.");

        let res = `📊 <b>ᴛᴏᴅᴀʏ's ᴄʜᴀᴛ ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ</b>\n━━━━━━━━━━━━━━\n\n`;
        top.forEach((u, i) => {
            let badge = i === 0 ? "🥇 King" : i === 1 ? "🥈 Pro" : i === 2 ? "🥉 Active" : `👤 #${i+1}`;
            res += `${badge}\n└─ <b>${escapeHTML(u.name)}</b> — <code>${u.count} msgs</code>\n\n`;
        });
        return fullClean(ctx, (await ctx.reply(res, { parse_mode: 'HTML' })).message_id, 45000);
    }

    const start = Date.now();
    const m = await ctx.reply('🛰️ <i>Checking system speed...</i>', { parse_mode: 'HTML' });
    await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `⚡ <b>System Latency:</b> <code>${Date.now()-start}ms</code>\n🌐 <b>Server:</b> Vercel-Node18`, { parse_mode: 'HTML' });
    fullClean(ctx, m.message_id);
});

// --- 6. ADMIN & MANAGEMENT ---
bot.command(['ban', 'unban', 'mute', 'unmute', 'pin', 'unpin', 'purge', 'tagall', 'cancel', 'info'], async (ctx) => {
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const gid = ctx.chat.id.toString();

    if (cmd === 'info') {
        let t = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
        return fullClean(ctx, (await ctx.reply(`🆔 <code>${t.id}</code>\n📛 ${escapeHTML(t.first_name)}`, { parse_mode: 'HTML' })).message_id);
    }

    if (!(await isAdmin(ctx))) return;

    if (cmd === 'tagall') {
        const db = await connectDB();
        const members = await db.collection('members').find({ gid }).toArray();
        taggingProcess[gid] = true;
        await ctx.reply("📢 <b>Tagging Members...</b>", { parse_mode: 'HTML' });
        for (let i = 0; i < members.length; i += 5) {
            if (!taggingProcess[gid]) break;
            let mnt = members.slice(i, i+5).map(u => `<a href="tg://user?id=${u.uid}">🔹</a>`).join(' ');
            await ctx.reply(mnt, { parse_mode: 'HTML' }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));
        }
        return delete taggingProcess[gid];
    }
    
    if (cmd === 'cancel') { taggingProcess[gid] = false; return ctx.reply("🛑 Stopped!"); }

    const target = ctx.message.reply_to_message;
    if (!target && cmd !== 'unpin') return;

    try {
        const tid = target?.from.id;
        if (cmd === 'ban') await ctx.banChatMember(tid);
        if (cmd === 'unban') await ctx.unbanChatMember(tid);
        if (cmd === 'mute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: true } });
        if (cmd === 'pin') await ctx.pinChatMessage(target.message_id);
        if (cmd === 'unpin') await ctx.unpinChatMessage();
        if (cmd === 'purge') for (let i = target.message_id; i <= ctx.message.message_id; i++) await ctx.telegram.deleteMessage(ctx.chat.id, i).catch(() => {});
        fullClean(ctx, (await ctx.reply(`✅ Done: ${cmd}`)).message_id, 5000);
    } catch (e) {}
});

module.exports = async (req, res) => { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); };
