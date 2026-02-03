const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;

// --- 1. CONFIGURATION (Galiyan aur Gande Words) ---
const blacklistedWords = [
    'xxx', 'porn', 'sex', 'fuck', 'bitch', 'asshole', 'dick', 'pussy', 'bastard', 
    'gaali', 'bc', 'mc', 'bsdk', 'bhenchod', 'madarchod', 'gand', 'loda', 'lauda', 
    'chutiya', 'harami', 'randi', 'saala', 'kamina', 'behenchod', 'maderchod',
    'poda', 'behen k lode', 'gandu', 'mkl', 'bkl', 'tatte', 'jhant'
];

// --- 2. HELPERS (Stability & Ghost Mode) ---
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

// --- 3. START COMMAND (Small Caps Style) ---
bot.start(async (ctx) => {
    const safeName = escapeHTML(ctx.from.first_name);
    const welcomeMsg = `<b>ʜᴇʟʟᴏ ${safeName}!</b>\n\nɪᴋ ᴍᴀɴᴀɢᴇᴍᴇɴᴛ ʙᴏᴛ ʜᴏᴏɴ\n\n<b>ᴄᴏᴍᴍᴀɴᴅs:</b>\n/leaderboard - ᴛᴏᴘ 10 ᴄʜᴀᴛᴛᴇʀs\n/info - ᴍᴇᴍʙᴇʀ ɪᴅᴇɴᴛɪᴛʏ\n/ping - sᴘᴇᴇᴅ ᴄʜᴇᴄᴋ`;

    if (ctx.chat.type === 'private') {
        return ctx.reply(welcomeMsg, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('➕ ᴀᴅᴅ ᴍᴇ ᴛᴏ ʏᴏᴜʀ ɢʀᴏᴜᴘ', `https://t.me/${ctx.botInfo.username}?startgroup=true`)]
            ])
        });
    } else {
        const m = await ctx.reply(welcomeMsg, { parse_mode: 'HTML' });
        fullClean(ctx, m.message_id);
    }
});

// --- 4. SILENT BIO-LINK SCANNER & WELCOME ---
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
        const m = await ctx.reply(`<b>ᴡᴇʟᴄᴏᴍᴇ ${safeName} ᴛᴏ ᴛʜᴇ sᴇᴄᴛᴏʀ!</b> 🚀`, { parse_mode: 'HTML' });
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}), 30000);
    } catch (e) {}
});

// --- 5. ACTIVITY TRACKER & WORD FILTER ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text) return next();
    
    // Activity Tracking
    const database = await connectDB();
    const today = new Date().toISOString().split('T')[0];
    await database.collection('activity').updateOne(
        { gid: ctx.chat.id.toString(), uid: ctx.from.id.toString(), date: today },
        { $set: { name: escapeHTML(ctx.from.first_name) }, $inc: { count: 1 } },
        { upsert: true }
    );

    // Blacklist Filter
    const msgText = ctx.message.text.toLowerCase();
    const hasBadWord = blacklistedWords.some(word => msgText.includes(word));

    if (hasBadWord && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        const m = await ctx.reply(`⚠️ <b>ɴᴏ ᴀʙᴜsɪᴠᴇ ʟᴀɴɢᴜᴀɢᴇ, ${escapeHTML(ctx.from.first_name)}!</b>`, { parse_mode: 'HTML' });
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id).catch(() => {}), 5000);
        return;
    }
    return next();
});

// --- 6. LEADERBOARD COMMAND ---
bot.command('leaderboard', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    
    const database = await connectDB();
    const today = new Date().toISOString().split('T')[0];
    const topChatters = await database.collection('activity')
        .find({ gid: ctx.chat.id.toString(), date: today })
        .sort({ count: -1 }).limit(10).toArray();

    if (topChatters.length === 0) {
        const m = await ctx.reply("📊 <b>ɴᴏ ᴀᴄᴛɪᴠɪᴛʏ ᴅᴀᴛᴀ ғᴏᴜɴᴅ.</b>", { parse_mode: 'HTML' });
        return fullClean(ctx, m.message_id, 5000);
    }

    let list = `🏆 <b>ᴅᴀɪʟʏ ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ</b>\n\n`;
    topChatters.forEach((u, i) => {
        const icon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "👤";
        list += `${icon} <b>${u.name}</b>: <code>${u.count} ᴍsɢs</code>\n`;
    });

    const res = await ctx.reply(list, { parse_mode: 'HTML' });
    fullClean(ctx, res.message_id, 20000);
});

// --- 7. ADMIN & UTILITY COMMANDS ---
bot.command('ping', async (ctx) => {
    const start = Date.now();
    const m = await ctx.reply('🛰️ <b>sᴄᴀɴɴɪɴɢ...</b>', { parse_mode: 'HTML' });
    const diff = Date.now() - start;
    await ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `🏓 <b>ᴘᴏɴɢ!</b>\n⏱️ sᴘᴇᴇᴅ: <code>${diff}ms</code>`, { parse_mode: 'HTML' }).catch(() => {});
    fullClean(ctx, m.message_id);
});

bot.command('info', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    let target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
    const msg = await ctx.reply(`👤 <b>ɪᴅᴇɴᴛɪᴛʏ:</b>\n🆔 <code>${target.id}</code>\n📛 ${escapeHTML(target.first_name)}`, { parse_mode: 'HTML' });
    fullClean(ctx, msg.message_id);
});

bot.command(['ban', 'mute', 'unmute'], async (ctx) => {
    if (ctx.chat.type === 'private' || !(await isAdmin(ctx))) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const target = ctx.message.reply_to_message;
    if (!target) return;
    try {
        if (cmd === 'ban') await ctx.banChatMember(target.from.id);
        if (cmd === 'mute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(target.from.id, { permissions: { can_send_messages: true } });
        const res = await ctx.reply(`✅ <b>${cmd.toUpperCase()} sᴜᴄᴄᴇss:</b> ${escapeHTML(target.from.first_name)}`, { parse_mode: 'HTML' });
        fullClean(ctx, res.message_id);
    } catch (e) {
        const m = await ctx.reply("❌ ᴏᴠᴇʀʀɪᴅᴇ ғᴀɪʟᴇᴅ.", { parse_mode: 'HTML' });
        fullClean(ctx, m.message_id, 5000);
    }
});

// --- 8. API EXPORT (Vercel Support) ---
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
};
