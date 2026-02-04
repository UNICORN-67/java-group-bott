const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// --- 1. INITIALIZATION ---
const config = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'commands.yml'), 'utf8'));
const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);

// Modules Import
const adminHandler = require('./admin');
const afkHandler = require('./afk');
const aiHandler = require('./ai');
const sangmata = require('./sangmata');
const tracerHandler = require('./tracer');
const observer = require('./observer');
const sudoHandler = require('./sudo');
const spy = require('./global_trace');

let db;

// Database Connection
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('yuri_fortress_db');
    return db;
}

// Utility: Message Fetcher
const getMsg = (key, data = {}) => {
    let msg = config.messages[key] || "";
    for (const [k, v] of Object.entries(data)) msg = msg.split(`{${k}}`).join(v);
    return msg;
};

// --- 2. START & HELP COMMANDS ---

bot.start(async (ctx) => {
    const isOwner = ctx.from.id === OWNER_ID;
    const welcomeText = getMsg('welcome', { name: ctx.from.first_name });
    const buttons = [
        [{ text: "➕ ᴀᴅᴅ ᴍᴇ ᴛᴏ ʏᴏᴜʀ ɢʀᴏᴜᴘ", url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }],
        [{ text: "🛠️ ʜᴇʟᴘ ᴍᴇɴᴜ", callback_data: "back_to_help" }, { text: "📊 sᴛᴀᴛs", callback_data: "bot_stats" }]
    ];
    if (isOwner) buttons.push([{ text: "👑 ᴏᴡɴᴇʀ ᴘᴀɴᴇʟ", callback_data: "owner_panel" }]);

    await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
});

bot.command('help', async (ctx) => {
    const helpButtons = [
        [{ text: "👮 Admin", callback_data: "help_admin" }, { text: "🕵️ Trace", callback_data: "help_trace" }],
        [{ text: "🤖 AI/AFK", callback_data: "help_ai" }, { text: "👑 Sudo", callback_data: "help_sudo" }],
        [{ text: "❌ Close", callback_data: "close_help" }]
    ];
    await ctx.reply("✨ <b>Yuri AI Help Menu</b>\n\nNiche diye gaye buttons se command info check karein:", {
        parse_mode: 'HTML', reply_markup: { inline_keyboard: helpButtons }
    });
});

// --- 3. CALLBACK QUERY HANDLER (Interactive Menu) ---

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const database = await connectDB();
    let text = "";
    let buttons = [[{ text: "⬅️ Back", callback_data: "back_to_help" }]];

    try {
        if (data === "help_admin") {
            text = "👮 <b>Admin Tools:</b>\n/ban, /mute, /kick, /purge, /lock, /slow, /promote";
        } else if (data === "help_trace") {
            text = "🕵️ <b>Surveillance:</b>\n/history - Identity Logs\n/trace - Forensic (.txt) Report";
        } else if (data === "help_ai") {
            text = "🤖 <b>AI & AFK:</b>\n/afk [reason] - Set AFK\n<b>AI:</b> Type 'Yuri' to chat.";
        } else if (data === "help_sudo") {
            text = "👑 <b>Sudo/Owner:</b>\n!broadcast, !addsudo, !rmsudo, !gban";
        } else if (data === "bot_stats") {
            const users = await database.collection('global_users').countDocuments();
            return await ctx.answerCbQuery(`Users Tracked: ${users}`, { show_alert: true });
        } else if (data === "back_to_help") {
            const mainButtons = [
                [{ text: "👮 Admin", callback_data: "help_admin" }, { text: "🕵️ Trace", callback_data: "help_trace" }],
                [{ text: "🤖 AI/AFK", callback_data: "help_ai" }, { text: "👑 Sudo", callback_data: "help_sudo" }],
                [{ text: "❌ Close", callback_data: "close_help" }]
            ];
            return await ctx.editMessageText("✨ <b>Yuri AI Help Menu</b>", { parse_mode: 'HTML', reply_markup: { inline_keyboard: mainButtons } });
        } else if (data === "close_help") {
            return await ctx.deleteMessage().catch(() => {});
        }

        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } });
        await ctx.answerCbQuery();
    } catch (e) { await ctx.answerCbQuery("Error..."); }
});

// --- 4. MASTER MIDDLEWARE (Tracking & Sudo) ---

bot.on('message', async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const database = await connectDB();

    // Surveillance
    await spy.logUser(ctx, database);
    await sangmata(ctx, database);
    await observer(ctx, database);

    // Sudo Logic
    const text = ctx.message.text || "";
    if (text.startsWith('!') || text.startsWith('/broadcast')) {
        await sudoHandler(ctx, database, OWNER_ID);
        return; 
    }

    // Clean Service Messages
    if (ctx.message.new_chat_members || ctx.message.left_chat_member) {
        return ctx.deleteMessage().catch(() => {});
    }
    return next();
});

// --- 5. COMMAND MAPPING ---

bot.command('trace', async (ctx) => tracerHandler(ctx, await connectDB(), OWNER_ID));
bot.command('history', async (ctx) => sangmata.getHistory(ctx, await connectDB(), getMsg));
bot.command('afk', async (ctx) => afkHandler(ctx, await connectDB(), getMsg));

const adminCmds = ['ban', 'unban', 'mute', 'unmute', 'kick', 'pin', 'unpin', 'purge', 'slow', 'lock', 'unlock', 'promote', 'demote', 'info', 'admins'];
bot.command(adminCmds, async (ctx) => {
    const member = await ctx.getChatMember(ctx.from.id);
    if (['administrator', 'creator'].includes(member.status) || ctx.from.id === OWNER_ID) {
        adminHandler(ctx, ctx.message.text.split(' ')[0].replace('/', ''), ctx.message.reply_to_message, getMsg);
    }
});

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (!text.startsWith('/') && (ctx.chat.type === 'private' || text.toLowerCase().includes('yuri') || Math.random() < 0.05)) {
        await aiHandler(ctx, text);
    }
});

bot.on('chat_join_request', async (ctx) => {
    await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id).catch(() => {});
});

// --- 6. VERCEL EXPORT ---
module.exports = async (req, res) => {
    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
    }
    res.status(200).send('Yuri AI: Online');
};
