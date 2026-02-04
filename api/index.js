const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// --- 1. CONFIGURATION & CORE SETUP ---
const config = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'commands.yml'), 'utf8'));
const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);
const LOG_CHANNEL = process.env.LOG_CHANNEL;

// Module Imports
const adminHandler = require('./admin');
const afkHandler = require('./afk');
const aiHandler = require('./ai');
const sangmata = require('./sangmata');
const tracerHandler = require('./tracer');
const observer = require('./observer');
const sudoHandler = require('./sudo');
const spy = require('./global_trace');

let db;

// Database Connection (Singleton Pattern)
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('yuri_fortress_db');
    return db;
}

// Global Logger Function
const sendLog = async (text) => {
    if (!LOG_CHANNEL) return;
    try {
        await bot.telegram.sendMessage(LOG_CHANNEL, `🛰 <b>ʏᴜʀɪ ꜱʏꜱᴛᴇᴍ ʟᴏɢ</b>\n━━━━━━━━━━━━━━\n${text}`, { parse_mode: 'HTML' });
    } catch (e) { console.error("Log Fail:", e.message); }
};

// Message Formatter
const getMsg = (key, data = {}) => {
    let msg = config.messages[key] || "";
    for (const [k, v] of Object.entries(data)) msg = msg.split(`{${k}}`).join(v);
    return msg;
};

// --- 2. START & HELP (INTERACTIVE) ---

bot.start(async (ctx) => {
    const welcomeText = getMsg('welcome', { name: ctx.from.first_name });
    const buttons = [
        [{ text: "➕ ᴀᴅᴅ ᴍᴇ ᴛᴏ ʏᴏᴜʀ ɢʀᴏᴜᴘ", url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }],
        [{ text: "🛠️ ʜᴇʟᴘ ᴍᴇɴᴜ", callback_data: "help_main" }, { text: "📊 sᴛᴀᴛs", callback_data: "bot_stats" }]
    ];
    if (ctx.from.id === OWNER_ID) buttons.push([{ text: "👑 ᴏᴡɴᴇʀ ᴘᴀɴᴇʟ", callback_data: "help_sudo" }]);
    
    await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
});

bot.command('help', async (ctx) => {
    const helpMenu = [
        [{ text: "👮 ᴀᴅᴍɪɴ", callback_data: "help_admin" }, { text: "🕵️ ᴛʀᴀᴄᴇ", callback_data: "help_trace" }],
        [{ text: "🤖 ᴀɪ & ᴀꜰᴋ", callback_data: "help_ai" }, { text: "👑 ꜱᴜᴅᴏ", callback_data: "help_sudo" }],
        [{ text: "❌ ᴄʟᴏꜱᴇ", callback_data: "close_help" }]
    ];
    await ctx.reply("✨ <b>ʏᴜʀɪ ᴀɪ ʜᴇʟᴘ ᴍᴇɴᴜ</b>\nSelect a category:", {
        parse_mode: 'HTML', reply_markup: { inline_keyboard: helpMenu }
    });
});

// --- 3. CALLBACK QUERY HANDLER ---

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const database = await connectDB();
    const backBtn = [[{ text: "⬅️ ʙᴀᴄᴋ", callback_data: "help_main" }]];

    try {
        if (data === "bot_stats") {
            const users = await database.collection('global_users').countDocuments();
            return await ctx.answerCbQuery(`🚀 Tracked Users: ${users}`, { show_alert: true });
        }
        
        let text = "";
        if (data === "help_main") {
            text = "✨ <b>ʏᴜʀɪ ᴀɪ ʜᴇʟᴘ ᴍᴇɴᴜ</b>\nSelect a category:";
            const menu = [
                [{ text: "👮 ᴀᴅᴍɪɴ", callback_data: "help_admin" }, { text: "🕵️ ᴛʀᴀᴄᴇ", callback_data: "help_trace" }],
                [{ text: "🤖 ᴀɪ & ᴀꜰᴋ", callback_data: "help_ai" }, { text: "👑 ꜱᴜᴅᴏ", callback_data: "help_sudo" }],
                [{ text: "❌ ᴄʟᴏꜱᴇ", callback_data: "close_help" }]
            ];
            return await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: menu } });
        }
        else if (data === "help_admin") text = "👮 <b>ᴀᴅᴍɪɴ:</b> /ban, /mute, /kick, /purge, /lock, /promote";
        else if (data === "help_trace") text = "🕵️ <b>ꜱᴜʀᴠᴇɪʟʟᴀɴᴄᴇ:</b> /history (Identity Logs), /trace (Forensic Report)";
        else if (data === "help_ai") text = "🤖 <b>ᴀɪ/ᴀꜰᴋ:</b> /afk [reason]\nChat by mentioning 'Yuri'.";
        else if (data === "help_sudo") text = "👑 <b>ꜱᴜᴅᴏ:</b> !broadcast, !addsudo, !rmsudo, !gban";
        else if (data === "close_help") return await ctx.deleteMessage().catch(() => {});

        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: backBtn } });
        await ctx.answerCbQuery();
    } catch (e) { await ctx.answerCbQuery("System Busy..."); }
});

// --- 4. MASTER MIDDLEWARE (Logging & Security) ---

bot.on('message', async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const database = await connectDB();

    // Group Addition Log
    if (ctx.message.new_chat_members?.find(m => m.id === ctx.botInfo.id)) {
        await sendLog(`➕ <b>ɴᴇᴡ ɢʀᴏᴜᴘ</b>\n• ɴᴀᴍᴇ: ${ctx.chat.title}\n• ɪᴅ: <code>${ctx.chat.id}</code>`);
    }

    // Background Surveillance
    await spy.logUser(ctx, database);
    await sangmata(ctx, database);
    await observer(ctx, database);

    // Sudo Priority Handler
    const text = ctx.message.text || "";
    if (text.startsWith('!') || text.startsWith('/broadcast')) {
        await sudoHandler(ctx, database, OWNER_ID);
        return; 
    }

    // Auto-Delete Service Messages
    if (ctx.message.new_chat_members || ctx.message.left_chat_member) {
        return ctx.deleteMessage().catch(() => {});
    }

    return next();
});

// --- 5. COMMAND EXECUTION ---

bot.command('trace', async (ctx) => {
    await tracerHandler(ctx, await connectDB(), OWNER_ID);
    await sendLog(`🔍 <b>ᴛʀᴀᴄᴇ ᴇxᴇᴄᴜᴛᴇᴅ</b>\nʙʏ: ${ctx.from.first_name} [<code>${ctx.from.id}</code>]`);
});

bot.command('history', async (ctx) => sangmata.getHistory(ctx, await connectDB(), getMsg));
bot.command('afk', async (ctx) => afkHandler(ctx, await connectDB(), getMsg));

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
    if (!text.startsWith('/') && (ctx.chat.type === 'private' || text.toLowerCase().includes('yuri') || Math.random() < 0.05)) {
        await aiHandler(ctx, text);
    }
});

bot.on('chat_join_request', async (ctx) => {
    await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id).catch(() => {});
});

// --- 6. VERCEL DEPLOYMENT ---
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') await bot.handleUpdate(req.body);
        res.status(200).send('Yuri AI Engine: Active');
    } catch (err) {
        await sendLog(`⚠️ <b>ᴄʀɪᴛɪᴄᴀʟ ᴇʀʀᴏʀ</b>\n<code>${err.message}</code>`);
        res.status(500).send('Offline');
    }
};
