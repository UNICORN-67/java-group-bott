const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// --- 1. CONFIG & SYSTEM SETUP ---
const config = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'commands.yml'), 'utf8'));
const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);
const LOG_CHANNEL = process.env.LOG_CHANNEL;

// --- 2. SAFE MODULE LOADER (Build-Fail Prevention) ---
const safeLoad = (modulePath) => {
    try {
        return require(modulePath);
    } catch (e) {
        console.log(`⚠️ Module Missing: ${modulePath}. Skipping...`);
        return null; // File na milne par bot crash nahi hoga
    }
};

const adminHandler = safeLoad('./admin');
const afkHandler = safeLoad('./afk');
const aiHandler = safeLoad('./ai');
const sangmata = safeLoad('./sangmata');
const tracerHandler = safeLoad('./tracer');
const observer = safeLoad('./observer'); 
const sudoHandler = safeLoad('./sudo');
const spy = safeLoad('./global_trace');

let db;

// Database Connection
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('yuri_fortress_db');
    return db;
}

// Logger Function
const sendLog = async (text) => {
    if (!LOG_CHANNEL) return;
    try {
        await bot.telegram.sendMessage(LOG_CHANNEL, `🛰 <b>ʏᴜʀɪ ꜱʏꜱᴛᴇᴍ ʟᴏɢ</b>\n━━━━━━━━━━━━━━\n${text}`, { parse_mode: 'HTML' });
    } catch (e) { console.error("Log Error:", e.message); }
};

const getMsg = (key, data = {}) => {
    let msg = config.messages[key] || "";
    for (const [k, v] of Object.entries(data)) msg = msg.split(`{${k}}`).join(v);
    return msg;
};

// --- 3. START & HELP (INTERACTIVE) ---

bot.start(async (ctx) => {
    const welcomeText = getMsg('welcome', { name: ctx.from.first_name });
    const buttons = [
        [{ text: "➕ ᴀᴅᴅ ᴍᴇ ᴛᴏ ʏᴏᴜʀ ɢʀᴏᴜᴘ", url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }],
        [{ text: "🛠️ ʜᴇʟᴘ ᴍᴇɴᴜ", callback_data: "help_main" }, { text: "📊 sᴛᴀᴛs", callback_data: "bot_stats" }]
    ];
    if (ctx.from.id === OWNER_ID) buttons.push([{ text: "👑 ᴏᴡɴᴇʀ ᴘᴀɴᴇʟ", callback_data: "help_sudo" }]);
    await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const database = await connectDB();
    const backBtn = [[{ text: "⬅️ ʙᴀᴄᴋ", callback_data: "help_main" }]];

    if (data === "bot_stats") {
        const users = await database.collection('global_users').countDocuments();
        return await ctx.answerCbQuery(`Users Tracked: ${users}`, { show_alert: true });
    }
    
    let text = "✨ <b>ʏᴜʀɪ ᴀɪ ʜᴇʟᴘ ᴍᴇɴᴜ</b>";
    if (data === "help_main") {
        const menu = [
            [{ text: "👮 ᴀᴅᴍɪɴ", callback_data: "help_admin" }, { text: "🕵️ ᴛʀᴀᴄᴇ", callback_data: "help_trace" }],
            [{ text: "🤖 ᴀɪ & ᴀꜰᴋ", callback_data: "help_ai" }, { text: "👑 ꜱᴜᴅᴏ", callback_data: "help_sudo" }],
            [{ text: "❌ ᴄʟᴏꜱᴇ", callback_data: "close_help" }]
        ];
        return await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: menu } });
    }
    else if (data === "help_admin") text = "👮 <b>ᴀᴅᴍɪɴ:</b> /ban, /mute, /purge, /lock, /promote";
    else if (data === "help_trace") text = "🕵️ <b>ꜱᴜʀᴠᴇɪʟʟᴀɴᴄᴇ:</b> /history, /trace (Forensic)";
    else if (data === "help_ai") text = "🤖 <b>ᴀɪ/ᴀꜰᴋ:</b> /afk [reason]\nChat by mentioning 'Yuri'.";
    else if (data === "help_sudo") text = "👑 <b>ꜱᴜᴅᴏ:</b> !broadcast, !gban, !addsudo";
    else if (data === "close_help") return await ctx.deleteMessage().catch(() => {});

    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: backBtn } });
    await ctx.answerCbQuery();
});

// --- 4. MASTER MIDDLEWARE (Surveillance & Security) ---

bot.on('message', async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const database = await connectDB();

    // 1. Group Addition Log
    if (ctx.message.new_chat_members?.find(m => m.id === ctx.botInfo.id)) {
        await sendLog(`➕ <b>ɴᴇᴡ ɢʀᴏᴜᴘ ᴀᴅᴅᴇᴅ</b>\n• ɴᴀᴍᴇ: ${ctx.chat.title}\n• ɪᴅ: <code>${ctx.chat.id}</code>`);
    }

    // 2. Active Surveillance (Only if files exist)
    if (spy) await spy.logUser(ctx, database);
    if (sangmata) await sangmata(ctx, database);
    if (observer) await observer(ctx, database);

    // 3. Sudo Logic
    const text = ctx.message.text || "";
    if ((text.startsWith('!') || text.startsWith('/broadcast')) && sudoHandler) {
        await sudoHandler(ctx, database, OWNER_ID);
        return; 
    }

    // 4. Service Message Cleaner
    if (ctx.message.new_chat_members || ctx.message.left_chat_member) {
        return ctx.deleteMessage().catch(() => {});
    }

    return next();
});

// --- 5. COMMANDS ---

bot.command('trace', async (ctx) => {
    if (tracerHandler) {
        await tracerHandler(ctx, await connectDB(), OWNER_ID);
        await sendLog(`🔍 <b>ᴛʀᴀᴄᴇ ᴜꜱᴇᴅ</b>\nʙʏ: ${ctx.from.first_name}`);
    }
});

bot.command('history', async (ctx) => {
    if (sangmata && sangmata.getHistory) await sangmata.getHistory(ctx, await connectDB(), getMsg);
});

bot.command('afk', async (ctx) => {
    if (afkHandler) await afkHandler(ctx, await connectDB(), getMsg);
});

// Admin Command Logic
const adminCmds = ['ban', 'unban', 'mute', 'unmute', 'kick', 'pin', 'unpin', 'purge', 'slow', 'lock', 'unlock', 'promote', 'demote', 'info', 'admins'];
bot.command(adminCmds, async (ctx) => {
    const member = await ctx.getChatMember(ctx.from.id);
    if (['administrator', 'creator'].includes(member.status) || ctx.from.id === OWNER_ID) {
        adminHandler(ctx, ctx.message.text.split(' ')[0].replace('/', ''), ctx.message.reply_to_message, getMsg);
    }
});

// AI Chat Logic
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (!text.startsWith('/') && aiHandler && (ctx.chat.type === 'private' || text.toLowerCase().includes('yuri') || Math.random() < 0.05)) {
        await aiHandler(ctx, text);
    }
});

// --- 6. VERCEL EXPORT ---
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') await bot.handleUpdate(req.body);
        res.status(200).send('Yuri Engine: Active');
    } catch (err) {
        console.error("Vercel Error:", err);
        res.status(500).send('Error');
    }
};
