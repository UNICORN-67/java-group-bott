const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;
let taggingProcess = {}; // Tagging track karne ke liye

// --- 1. CONFIGURATION ---
const blacklistedWords = ['xxx', 'porn', 'sex', 'fuck', 'bc', 'mc', 'bsdk', 'chutiya', 'gandu', 'randi'];

// --- 2. HELPERS ---
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

const escapeHTML = (str) => {
    if (!str) return "";
    return str.replace(/[&<>]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[tag] || tag));
};

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

const fullClean = async (ctx, botMsgId, timer = 10000) => {
    try { await ctx.deleteMessage().catch(() => {}); } catch (e) {}
    setTimeout(async () => {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, botMsgId).catch(() => {}); } catch (e) {}
    }, timer);
};

// --- 3. OPENAI BRAIN (Natural Hinglish) ---
async function getOpenAIReply(userMessage, userName, brainMemory) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: `You are Yuri, a witty girl. Use casual Hinglish. Memory: "${brainMemory}". Short and spicy replies.` },
                { role: "user", content: `${userName} said: ${userMessage}` }
            ],
            max_tokens: 60
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    } catch (e) { return brainMemory || "Net slow hai, dimaag nahi chal raha!"; }
}

// --- 4. TAGGING LOGIC (/tagall & /cancel) ---
bot.command('tagall', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    const gid = ctx.chat.id.toString();
    const database = await connectDB();
    const members = await database.collection('activity').find({ gid: gid }).toArray();

    if (members.length === 0) return ctx.reply("Koi data nahi mila tag karne ke liye.");

    taggingProcess[gid] = true;
    await ctx.reply("🚀 <b>Tagging Start!</b> Stop karne ke liye /cancel likhein.", { parse_mode: 'HTML' });

    for (let i = 0; i < members.length; i += 5) {
        if (!taggingProcess[gid]) break;
        let chunk = members.slice(i, i + 5);
        let mentions = chunk.map(u => `<a href="tg://user?id=${u.uid}">🔹</a>`).join(' ');
        await ctx.reply(`📢 <b>Attention!</b>\n\n${mentions}`, { parse_mode: 'HTML' }).catch(() => {});
        await new Promise(r => setTimeout(r, 2500)); 
    }
    delete taggingProcess[gid];
});

bot.command('cancel', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    taggingProcess[ctx.chat.id.toString()] = false;
    ctx.reply("🛑 Tagging cancelled!");
});

// --- 5. CORE HANDLER (Learning + AI + Leaderboard) ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text || ctx.message.text.startsWith('/')) return next();
    
    const msg = ctx.message;
    const text = msg.text;
    const name = escapeHTML(ctx.from.first_name);
    const database = await connectDB();
    const gid = ctx.chat.id.toString();

    // Leaderboard tracking
    const today = new Date().toISOString().split('T')[0];
    await database.collection('activity').updateOne(
        { gid: gid, uid: ctx.from.id.toString(), date: today },
        { $set: { name: name, uid: ctx.from.id.toString() }, $inc: { count: 1 } },
        { upsert: true }
    );

    // AI Trigger (Yuri name or Reply)
    const isYuri = text.toLowerCase().includes("yuri");
    const isBotReply = msg.reply_to_message && msg.reply_to_message.from.id === ctx.botInfo.id;
    
    if (isYuri || isBotReply) {
        const brainPool = await database.collection('brain').aggregate([{ $sample: { size: 1 } }]).toArray();
        const learnedText = brainPool.length > 0 ? brainPool[0].text : "";
        const aiReply = await getOpenAIReply(text, name, learnedText);
        setTimeout(() => ctx.reply(aiReply, { reply_to_message_id: msg.message_id }), 2000);
    }

    // Learning
    if (text.split(' ').length > 2 && !blacklistedWords.some(w => text.toLowerCase().includes(w))) {
        await database.collection('brain').updateOne({ text: text }, { $set: { text: text } }, { upsert: true });
    }
    return next();
});

// --- 6. ADMIN COMMANDS (Ban, Mute, Pin, Purge, Leaderboard) ---
bot.command('leaderboard', async (ctx) => {
    const db = await connectDB();
    const today = new Date().toISOString().split('T')[0];
    const top = await db.collection('activity').find({ gid: ctx.chat.id.toString(), date: today }).sort({ count: -1 }).limit(10).toArray();
    let res = `🏆 <b>ᴅᴀɪʟʏ ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ</b>\n\n`;
    top.forEach((u, i) => res += `${i<3?['🥇','🥈','🥉'][i]:'👤'} <b>${u.name}</b>: <code>${u.count}</code>\n`);
    fullClean(ctx, (await ctx.reply(res, { parse_mode: 'HTML' })).message_id, 20000);
});

bot.command('purge', async (ctx) => {
    if (!(await isAdmin(ctx)) || !ctx.message.reply_to_message) return;
    const start = ctx.message.reply_to_message.message_id;
    const end = ctx.message.message_id;
    for (let i = start; i <= end; i++) await ctx.telegram.deleteMessage(ctx.chat.id, i).catch(() => {});
});

bot.command(['ban', 'unban', 'mute', 'unmute'], async (ctx) => {
    if (!(await isAdmin(ctx)) || !ctx.message.reply_to_message) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const target = ctx.message.reply_to_message.from.id;
    try {
        if (cmd === 'ban') await ctx.banChatMember(target);
        if (cmd === 'unban') await ctx.unbanChatMember(target);
        if (cmd === 'mute') await ctx.restrictChatMember(target, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(target, { permissions: { can_send_messages: true } });
        fullClean(ctx, (await ctx.reply(`✅ ${cmd.toUpperCase()} Success`)).message_id);
    } catch (e) {}
});

bot.command(['pin', 'unpin'], async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    try {
        if (ctx.message.text.includes('unpin')) await ctx.unpinChatMessage();
        else if (ctx.message.reply_to_message) await ctx.pinChatMessage(ctx.message.reply_to_message.message_id);
    } catch (e) {}
});

bot.command('info', async (ctx) => {
    let t = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
    fullClean(ctx, (await ctx.reply(`🆔 <code>${t.id}</code>\n📛 ${escapeHTML(t.first_name)}`, { parse_mode: 'HTML' })).message_id);
});

bot.command('ping', async (ctx) => {
    const start = Date.now();
    const m = await ctx.reply('🛰️ Scanning...');
    ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `🏓 Pong: ${Date.now()-start}ms`);
    fullClean(ctx, m.message_id);
});

module.exports = async (req, res) => {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
