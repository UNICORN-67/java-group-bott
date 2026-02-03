const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

// --- 1. CONFIGURATION ---
const blacklistedWords = ['xxx', 'porn', 'sex', 'fuck', 'bc', 'mc', 'bsdk', 'chutiya', 'gandu', 'randi', 'loda', 'lauda'];

// --- 2. HELPERS ---
const escapeHTML = (str) => {
    if (!str) return "";
    return str.replace(/[&<>]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[tag] || tag));
};

async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

const fullClean = async (ctx, botMsgId, timer = 15000) => {
    try { await ctx.deleteMessage().catch(() => {}); } catch (e) {}
    setTimeout(async () => {
        try { await ctx.telegram.deleteMessage(ctx.chat.id, botMsgId).catch(() => {}); } catch (e) {}
    }, timer);
};

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const member = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(member.status);
    } catch (e) { return false; }
}

// --- 3. OPENAI BRAIN ---
async function getOpenAIReply(userMessage, userName, brainMemory) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { 
                    role: "system", 
                    content: `You are Yuri, a witty girl in a Telegram group. Talk ONLY in casual Hinglish. 
                    Use group memory if relevant: "${brainMemory}". 
                    Keep it short, spicy, and natural. No Devanagari.` 
                },
                { role: "user", content: `${userName} said: ${userMessage}` }
            ],
            max_tokens: 80
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    } catch (e) { return brainMemory || "Dimaag thak gaya hai!"; }
}

// --- 4. CORE TEXT HANDLER (Learning + OpenAI) ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text || ctx.message.text.startsWith('/')) return next();
    
    const msg = ctx.message;
    const text = msg.text;
    const name = escapeHTML(ctx.from.first_name);
    const database = await connectDB();

    // Blacklist check
    if (blacklistedWords.some(w => text.toLowerCase().includes(w)) && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        return;
    }

    // Learning
    if (text.split(' ').length > 2) {
        await database.collection('brain').updateOne({ text: text }, { $set: { text: text, user: name } }, { upsert: true });
    }

    // Selective Interaction
    const isYuri = text.toLowerCase().includes("yuri");
    const isBotReply = msg.reply_to_message && msg.reply_to_message.from.id === ctx.botInfo.id;
    const isDirectHi = (text.toLowerCase() === "hi" || text.toLowerCase() === "hello") && !msg.reply_to_message;

    if (isYuri || isBotReply || isDirectHi) {
        const brainPool = await database.collection('brain').aggregate([{ $sample: { size: 1 } }]).toArray();
        const learnedText = brainPool.length > 0 ? brainPool[0].text : "";

        setTimeout(async () => {
            const aiReply = await getOpenAIReply(text, name, learnedText);
            await ctx.reply(aiReply, { reply_to_message_id: msg.message_id }).catch(() => {});
        }, 2500);
    }
    return next();
});

// --- 5. ADMIN COMMANDS (BAN, MUTE, UNMUTE, INFO) ---

bot.command('info', async (ctx) => {
    let t = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
    const res = await ctx.reply(`👤 <b>ɪᴅᴇɴᴛɪᴛʏ:</b>\n🆔 <code>${t.id}</code>\n📛 ${escapeHTML(t.first_name)}`, { parse_mode: 'HTML' });
    fullClean(ctx, res.message_id);
});

bot.command(['ban', 'mute', 'unmute', 'unban'], async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const target = ctx.message.reply_to_message;
    
    if (!target) {
        const m = await ctx.reply("💬 Please reply to a user to use this command.");
        return fullClean(ctx, m.message_id, 5000);
    }

    const targetId = target.from.id;
    try {
        if (cmd === 'ban') await ctx.banChatMember(targetId);
        if (cmd === 'unban') await ctx.unbanChatMember(targetId);
        if (cmd === 'mute') await ctx.restrictChatMember(targetId, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(targetId, { permissions: { can_send_messages: true } });

        const res = await ctx.reply(`✅ <b>${cmd.toUpperCase()} Success:</b> ${escapeHTML(target.from.first_name)}`, { parse_mode: 'HTML' });
        fullClean(ctx, res.message_id);
    } catch (e) {
        const err = await ctx.reply("❌ Action failed. Check my permissions.");
        fullClean(ctx, err.message_id, 5000);
    }
});

// --- 6. OTHER COMMANDS ---
bot.command('leaderboard', async (ctx) => {
    const db = await connectDB();
    const today = new Date().toISOString().split('T')[0];
    const top = await db.collection('activity').find({ gid: ctx.chat.id.toString(), date: today }).sort({ count: -1 }).limit(10).toArray();
    let res = `🏆 <b>ᴅᴀɪʟʏ ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ</b>\n\n`;
    top.forEach((u, i) => res += `${i<3?['🥇','🥈','🥉'][i]:'👤'} <b>${u.name}</b>: <code>${u.count}</code>\n`);
    fullClean(ctx, (await ctx.reply(res, { parse_mode: 'HTML' })).message_id, 20000);
});

bot.command('ping', async (ctx) => {
    const start = Date.now();
    const m = await ctx.reply('🛰️ <b>sᴄᴀɴɴɪɴɢ...</b>', { parse_mode: 'HTML' });
    await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `🏓 ᴘᴏɴɢ: <code>${Date.now()-start}ms</code>`, { parse_mode: 'HTML' });
    fullClean(ctx, m.message_id);
});

// --- 7. EXPORT ---
module.exports = async (req, res) => {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
