const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;
let taggingProcess = {};
const OWNER_ID = parseInt(process.env.OWNER_ID);
const LOG_CHANNEL = process.env.LOG_CHANNEL_ID;

// --- 1. DATABASE CONNECTION ---
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('yuri_master_db');
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

// --- 2. LOGGING SYSTEM ---
async function sendLog(ctx, action, target = null, extra = "") {
    if (!LOG_CHANNEL) return;
    let logMsg = `📑 <b>ʏᴜʀɪ ʟᴏɢ ᴇᴠᴇɴᴛ</b>\n━━━━━━━━━━━━━━\n`;
    logMsg += `🕹 <b>Action:</b> ${action}\n`;
    logMsg += `👤 <b>Admin/User:</b> ${escapeHTML(ctx.from.first_name)}\n`;
    logMsg += `🌐 <b>Chat:</b> ${escapeHTML(ctx.chat.title || "Private")}\n`;
    if (target) logMsg += `🎯 <b>Target:</b> ${escapeHTML(target.first_name)} (<code>${target.id}</code>)\n`;
    if (extra) logMsg += `📝 <b>Info:</b> ${extra}\n`;
    logMsg += `━━━━━━━━━━━━━━`;
    await bot.telegram.sendMessage(LOG_CHANNEL, logMsg, { parse_mode: 'HTML' }).catch(() => {});
}

// --- 3. OPENAI BRAIN ---
async function getSmartAIReply(userMessage, userName, historyContext) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: `You are Yuri, a witty girl. Use Hinglish. Context: ${historyContext}. Natural and spicy replies.` },
                { role: "user", content: `${userName} said: ${userMessage}` }
            ],
            max_tokens: 80,
            temperature: 0.8
        }, { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' } });
        return response.data.choices[0].message.content;
    } catch (e) { return null; }
}

// --- 4. CORE PROTECTION (Bio Link, Anti-Link, AFK, AI) ---
bot.on('message', async (ctx, next) => {
    if (!ctx.message || ctx.chat.type === 'private') return next();
    const text = ctx.message.text || "";
    const name = escapeHTML(ctx.from.first_name);
    const uid = ctx.from.id;
    const gid = ctx.chat.id.toString();
    const database = await connectDB();

    // A. BIO LINK REMOVER (Security)
    try {
        if (!(await isAdmin(ctx))) {
            const userChat = await ctx.telegram.getChat(uid);
            const bio = userChat.bio || "";
            if (/(t\.me|http|https|www)/i.test(bio)) {
                await ctx.deleteMessage().catch(() => {});
                await sendLog(ctx, "BIO LINK DETECTED", ctx.from, bio);
                return fullClean(ctx, (await ctx.reply(`⚠️ ${name}, aapke Bio mein link hai. Promotion allowed nahi hai!`)).message_id, 5000);
            }
        }
    } catch (e) {}

    // B. ANTI-LINK IN MESSAGE
    const hasLink = ctx.message.entities && ctx.message.entities.some(e => e.type === 'url' || e.type === 'text_link');
    if (hasLink && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        return fullClean(ctx, (await ctx.reply(`🚫 No links allowed here!`)).message_id, 5000);
    }

    // C. AFK CHECK & BACK
    if (ctx.message.entities) {
        for (const ent of ctx.message.entities) {
            if (ent.type === 'text_mention') {
                const afkData = await database.collection('afk').findOne({ uid: ent.user.id.toString() });
                if (afkData) ctx.reply(`💤 <b>${afkData.name}</b> AFK hai: ${afkData.reason}`, { parse_mode: 'HTML' });
            }
        }
    }
    const amIAfk = await database.collection('afk').findOne({ uid: uid.toString() });
    if (amIAfk && !text.startsWith('/afk')) {
        await database.collection('afk').deleteOne({ uid: uid.toString() });
        fullClean(ctx, (await ctx.reply(`Welcome back ${name}!`)).message_id, 5000);
    }

    // D. TRACKING & AI
    if (text && !text.startsWith('/')) {
        const today = new Date().toISOString().split('T')[0];
        await database.collection('activity').updateOne({ gid, uid: uid.toString(), date: today }, { $set: { name }, $inc: { count: 1 } }, { upsert: true });
        await database.collection('members').updateOne({ gid, uid: uid.toString() }, { $set: { uid: uid.toString() } }, { upsert: true });
        await database.collection('context').insertOne({ gid, text, name, time: new Date() });

        if (text.toLowerCase().includes("yuri") || (ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === ctx.botInfo.id) || Math.random() < 0.20) {
            const history = await database.collection('context').find({ gid }).sort({ time: -1 }).limit(3).toArray();
            const historyStr = history.map(h => `${h.name}: ${h.text}`).join(' | ');
            const reply = await getSmartAIReply(text, name, historyStr);
            if (reply) { ctx.sendChatAction('typing'); setTimeout(() => ctx.reply(reply, { reply_to_message_id: ctx.message.message_id }), 1000); }
        }
    }
    return next();
});

// --- 5. COMMANDS (Start, Help, AFK, Kang, Admin, Owner) ---
bot.start((ctx) => ctx.reply("✨ Yuri Master AI is Online!"));

bot.help((ctx) => ctx.reply("👤 <b>User:</b> /info, /afk\n👮 <b>Admin:</b> /ban, /unban, /mute, /unmute, /pin, /unpin, /purge, /tagall, /cancel\n👑 <b>Owner:</b> /leaderboard, /ping", { parse_mode: 'HTML' }));

bot.command('afk', async (ctx) => {
    const reason = ctx.message.text.split(' ').slice(1).join(' ') || "Busy!";
    const db = await connectDB();
    await db.collection('afk').updateOne({ uid: ctx.from.id.toString() }, { $set: { name: ctx.from.first_name, reason } }, { upsert: true });
    ctx.reply(`💤 <b>${ctx.from.first_name}</b> is now AFK.`, { parse_mode: 'HTML' });
});

bot.command('kang', async (ctx) => {
    if (!ctx.message.reply_to_message?.sticker) return ctx.reply("Sticker par reply karein!");
    await ctx.replyWithSticker(ctx.message.reply_to_message.sticker.file_id);
});

bot.command(['ping', 'leaderboard'], async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const db = await connectDB();
    if (ctx.message.text.includes('leaderboard')) {
        const top = await db.collection('activity').find({ gid: ctx.chat.id.toString() }).sort({count:-1}).limit(10).toArray();
        let res = `📊 <b>ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ</b>\n\n` + top.map((u, i) => `${i===0?'🥇':i===1?'🥈':i===2?'🥉':'👤'} ${u.name} - ${u.count}`).join('\n');
        return ctx.reply(res, { parse_mode: 'HTML' });
    }
    const start = Date.now();
    const m = await ctx.reply('🛰️ Ping...');
    ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `⚡ Pong: ${Date.now()-start}ms`);
});

bot.command(['ban', 'unban', 'mute', 'unmute', 'pin', 'unpin', 'purge', 'tagall', 'cancel'], async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const gid = ctx.chat.id.toString();
    const target = ctx.message.reply_to_message;

    if (cmd === 'tagall') {
        const db = await connectDB();
        const members = await db.collection('members').find({ gid }).toArray();
        taggingProcess[gid] = true;
        for (let i = 0; i < members.length; i += 5) {
            if (!taggingProcess[gid]) break;
            ctx.reply(members.slice(i, i+5).map(u => `<a href="tg://user?id=${u.uid}">🔹</a>`).join(' '), { parse_mode: 'HTML' });
            await new Promise(r => setTimeout(r, 3000));
        }
        return;
    }
    if (cmd === 'cancel') { taggingProcess[gid] = false; return; }

    try {
        if (cmd === 'unpin') await ctx.unpinChatMessage();
        if (!target) return;
        if (cmd === 'ban') await ctx.banChatMember(target.from.id);
        if (cmd === 'mute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: true } });
        if (cmd === 'pin') await ctx.pinChatMessage(target.message_id);
        if (cmd === 'purge') for (let i = target.message_id; i <= ctx.message.message_id; i++) await ctx.telegram.deleteMessage(ctx.chat.id, i).catch(() => {});
        await sendLog(ctx, cmd.toUpperCase(), target.from);
    } catch (e) {}
});

module.exports = async (req, res) => {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
