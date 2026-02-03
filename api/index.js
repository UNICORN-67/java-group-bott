const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

// --- 1. CONFIGURATION ---
const blacklistedWords = ['xxx', 'porn', 'sex', 'fuck', 'bitch', 'bc', 'mc', 'bsdk', 'bhenchod', 'madarchod', 'chutiya', 'gandu', 'randi', 'loda', 'lauda'];

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

// --- 3. THE BRAIN: LEARNING & REPLING SYSTEM ---
const learnAndReply = async (text, name, database) => {
    const input = text.toLowerCase();
    
    // 3A. Yaad Rakhna: Message save karna (Agar 2 words se bada ho aur command na ho)
    if (text.split(' ').length > 2 && !text.startsWith('/') && !blacklistedWords.some(w => input.includes(w))) {
        await database.collection('brain').updateOne(
            { text: text }, 
            { $set: { text: text, user: name, date: new Date() } }, 
            { upsert: true }
        );
    }

    // 3B. Random "Learned" Reply nikalna
    const brainPool = await database.collection('brain').aggregate([{ $sample: { size: 1 } }]).toArray();
    
    if (brainPool.length > 0) {
        const memory = brainPool[0].text;
        const variations = [
            `अभी किसी ने कहा था: "${memory}".. सही बात है ना?`,
            `${name}, मुझे याद है यहाँ किसी ने बोला था "${memory}"..`,
            `वैसे "${memory}" वाली बात मुझे बहुत अच्छी लगी! 😍`,
            `ग्रुप में सब कह रहे थे "${memory}", क्या ये सच है ${name}?`,
            `मुझे आपकी बातें सुनकर वो याद आ गया: "${memory}"`
        ];
        return variations[Math.floor(Math.random() * variations.length)];
    }
    return `अभी मैं सीख रही हूँ ${name}, आप बस बोलते रहिये! ✨`;
};

// --- 4. START COMMAND ---
bot.start(async (ctx) => {
    const welcome = `<b>ʜᴇʟʟᴏ ${escapeHTML(ctx.from.first_name)}!</b>\n\nɪᴋ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ʙᴏᴛ ʜᴏᴏɴ ᴊᴏ ᴀᴀᴘsᴇ sᴇᴇᴋʜᴛɪ ʜᴀɪ.\n\n<b>ᴄᴏᴍᴍᴀɴᴅs:</b>\n/leaderboard - ᴛᴏᴘ 10 ᴄʜᴀᴛᴛᴇʀs\n/info - ᴍᴇᴍʙᴇʀ ɪᴅ\n/ping - sᴘᴇᴇᴅ`;
    if (ctx.chat.type === 'private') {
        return ctx.reply(welcome, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('➕ ᴀᴅᴅ ᴍᴇ ᴛᴏ ɢʀᴏᴜᴘ', `https://t.me/${ctx.botInfo.username}?startgroup=true`)]]) });
    } else {
        const m = await ctx.reply(welcome, { parse_mode: 'HTML' });
        fullClean(ctx, m.message_id);
    }
});

// --- 5. SILENT BIO-LINK SCANNER ---
bot.on('new_chat_members', async (ctx) => {
    try {
        const fullUser = await ctx.telegram.getChat(ctx.from.id);
        if (/(https?:\/\/|t\.me|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/.test(fullUser.bio || "")) {
            await ctx.banChatMember(ctx.from.id).catch(() => {});
            await ctx.deleteMessage().catch(() => {}); 
            return;
        }
        const m = await ctx.reply(`<b>ᴡᴇʟᴄᴏᴍᴇ ${escapeHTML(ctx.from.first_name)}!</b>`, { parse_mode: 'HTML' });
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}), 30000);
    } catch (e) {}
});

// --- 6. CORE TEXT HANDLER (Tracking + Filter + Learning) ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text) return next();
    
    const text = ctx.message.text;
    const name = escapeHTML(ctx.from.first_name);
    const database = await connectDB();

    // Activity Tracking
    const today = new Date().toISOString().split('T')[0];
    await database.collection('activity').updateOne(
        { gid: ctx.chat.id.toString(), uid: ctx.from.id.toString(), date: today },
        { $set: { name: name }, $inc: { count: 1 } }, { upsert: true }
    );

    // Blacklist Filter
    if (blacklistedWords.some(w => text.toLowerCase().includes(w)) && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        const m = await ctx.reply(`⚠️ ɴᴏ ᴀʙᴜsɪᴠᴇ ʟᴀɴɢᴜᴀɢᴇ, ${name}!`, { parse_mode: 'HTML' });
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}), 5000);
        return;
    }

    // Smart Learning Reply (No Reply, No Command, No Tag)
    if (!ctx.message.reply_to_message && !text.startsWith('/') && !text.includes(`@${ctx.botInfo.username}`)) {
        const aiReply = await learnAndReply(text, name, database);
        setTimeout(() => ctx.reply(aiReply, { parse_mode: 'HTML' }).catch(() => {}), 2000);
    }

    return next();
});

// --- 7. UTILITY COMMANDS ---
bot.command('leaderboard', async (ctx) => {
    const db = await connectDB();
    const today = new Date().toISOString().split('T')[0];
    const top = await db.collection('activity').find({ gid: ctx.chat.id.toString(), date: today }).sort({ count: -1 }).limit(10).toArray();
    if (top.length === 0) return fullClean(ctx, (await ctx.reply("ɴᴏ ᴅᴀᴛᴀ")).message_id, 5000);
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

bot.command('info', async (ctx) => {
    let t = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
    const m = await ctx.reply(`🆔 <code>${t.id}</code>\n📛 ${escapeHTML(t.first_name)}`, { parse_mode: 'HTML' });
    fullClean(ctx, m.message_id);
});

bot.command(['ban', 'mute', 'unmute'], async (ctx) => {
    if (!(await isAdmin(ctx)) || !ctx.message.reply_to_message) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const target = ctx.message.reply_to_message.from.id;
    try {
        if (cmd === 'ban') await ctx.banChatMember(target);
        if (cmd === 'mute') await ctx.restrictChatMember(target, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(target, { permissions: { can_send_messages: true } });
        fullClean(ctx, (await ctx.reply(`✅ ${cmd.toUpperCase()} sᴜᴄᴄᴇss`)).message_id);
    } catch (e) { fullClean(ctx, (await ctx.reply("❌ ғᴀɪʟᴇᴅ")).message_id, 5000); }
});

// --- 8. EXPORT ---
module.exports = async (req, res) => {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
