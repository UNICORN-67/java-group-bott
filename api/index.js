const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

// --- 1. CONFIGURATION ---
const blacklistedWords = ['xxx', 'porn', 'sex', 'fuck', 'bitch', 'bc', 'mc', 'bsdk', 'chutiya', 'gandu', 'randi', 'loda', 'lauda'];

// --- 2. HELPERS (Stability & Ghost Mode) ---
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

// --- 3. SMART BRAIN: LEARNING & TALKING ---
const getSmartReply = async (text, name, database) => {
    const input = text.toLowerCase();
    
    // Direct Response for Yuri's Name
    if (input.includes("yuri")) {
        const res = [`जी ${name}, हुकुम कीजिये? 🥰`, `बुलाया मुझे? Yuri हाज़िर है! ✨`, `Yuri तो सबके दिलों में है, बोलिए ${name}!`, `जी, क्या सेवा करूँ आपकी? 😉` ];
        return res[Math.floor(Math.random() * res.length)];
    }

    // Pull from Brain Memory
    const brainPool = await database.collection('brain').aggregate([{ $sample: { size: 1 } }]).toArray();
    if (brainPool.length > 0) {
        const memory = brainPool[0].text;
        const variations = [
            `अरे ${name}, मुझे याद आया किसी ने कहा था: "${memory}".. सही है ना?`,
            `वैसे "${memory}" वाली बात पर आपका क्या ख्याल है? 😎`,
            `मुझे आपकी बातें सुनकर वो याद आ गया: "${memory}" 😍`,
            `${name}, क्या आपको पता है यहाँ किसी ने बोला था "${memory}"?`,
            `अभी थोड़ी देर पहले कोई कह रहा था: "${memory}"..`
        ];
        return variations[Math.floor(Math.random() * variations.length)];
    }
    return `आपकी बातें बड़ी प्यारी हैं ${name}, मेरा मन लुभा लिया! ✨`;
};

// --- 4. START & WELCOME/LEFT LOGIC ---
bot.start(async (ctx) => {
    const welcomeMsg = `<b>ʜᴇʟʟᴏ ${escapeHTML(ctx.from.first_name)}!</b>\n\nɪᴋ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ʙᴏᴛ ʜᴏᴏɴ ᴊᴏ ᴀᴀᴘsᴇ sᴇᴇᴋʜᴛɪ ʜᴀɪ.\n\n<b>ᴄᴏᴍᴍᴀɴᴅs:</b>\n/leaderboard - ᴛᴏᴘ 10 ᴄʜᴀᴛᴛᴇʀs\n/info - ᴍᴇᴍʙᴇʀ ɪᴅ\n/ping - sᴘᴇᴇᴅ`;
    if (ctx.chat.type === 'private') {
        return ctx.reply(welcomeMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.url('➕ ᴀᴅᴅ ᴍᴇ ᴛᴏ ɢʀᴏᴜᴘ', `https://t.me/${ctx.botInfo.username}?startgroup=true`)]]) });
    } else {
        const m = await ctx.reply(welcomeMsg, { parse_mode: 'HTML' });
        fullClean(ctx, m.message_id);
    }
});

// Member Joined (Silent Bio-Ban Included)
bot.on('new_chat_members', async (ctx) => {
    try {
        const newUser = ctx.from;
        const fullUser = await ctx.telegram.getChat(newUser.id);
        if (/(https?:\/\/|t\.me|www\.|[a-zA-Z0-9-]+\.[a-zA-Z]{2,})/.test(fullUser.bio || "")) {
            await ctx.banChatMember(newUser.id).catch(() => {});
            await ctx.deleteMessage().catch(() => {});
            return;
        }
        const m = await ctx.reply(`<b>ᴡᴇʟᴄᴏᴍᴇ ${escapeHTML(newUser.first_name)} ᴛᴏ ᴛʜᴇ sᴇᴄᴛᴏʀ!</b> 🚀`, { parse_mode: 'HTML' });
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}), 30000);
    } catch (e) {}
});

// Member Left
bot.on('left_chat_member', async (ctx) => {
    const name = escapeHTML(ctx.left_chat_member.first_name);
    const m = await ctx.reply(`अरे! <b>${name}</b> तो हमें छोड़ कर चला गया... 🥺`, { parse_mode: 'HTML' });
    setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}), 15000);
});

// --- 5. CORE TEXT HANDLER (Learning + Smart Chat) ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text) return next();
    
    const msg = ctx.message;
    const text = msg.text;
    const name = escapeHTML(ctx.from.first_name);
    const database = await connectDB();

    // Store Activity
    const today = new Date().toISOString().split('T')[0];
    await database.collection('activity').updateOne({ gid: ctx.chat.id.toString(), uid: ctx.from.id.toString(), date: today }, { $set: { name: name }, $inc: { count: 1 } }, { upsert: true });

    // Blacklist & Learning
    const isBad = blacklistedWords.some(w => text.toLowerCase().includes(w));
    if (isBad && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        return;
    }
    if (!isBad && text.split(' ').length > 2 && !text.startsWith('/')) {
        await database.collection('brain').updateOne({ text: text }, { $set: { text: text, user: name, date: new Date() } }, { upsert: true });
    }

    // Smart Reply Logic (35% chance OR direct mention/reply)
    const isYuri = text.toLowerCase().includes("yuri");
    const isBotReply = msg.reply_to_message && msg.reply_to_message.from.id === ctx.botInfo.id;
    const isGeneralReply = !!msg.reply_to_message; // For tagging others like in your screenshot

    if (!text.startsWith('/') && (isYuri || isBotReply || isGeneralReply || Math.random() < 0.35)) {
        const aiReply = await getSmartReply(text, name, database);
        setTimeout(() => ctx.reply(aiReply, { reply_to_message_id: msg.message_id, parse_mode: 'HTML' }).catch(() => {}), 1500);
    }

    return next();
});

// --- 6. UTILITY COMMANDS ---
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

bot.command('info', async (ctx) => {
    let t = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
    const m = await ctx.reply(`👤 <b>ɪᴅᴇɴᴛɪᴛʏ:</b>\n🆔 <code>${t.id}</code>\n📛 ${escapeHTML(t.first_name)}`, { parse_mode: 'HTML' });
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

// --- 7. EXPORT ---
module.exports = async (req, res) => {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
