const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// --- 1. CONFIG & SYSTEM SETUP ---
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

// --- 2. START & CALLBACK HANDLERS ---

bot.start(async (ctx) => {
    const isOwner = ctx.from.id === OWNER_ID;
    const welcomeText = getMsg('welcome', { name: ctx.from.first_name });
    
    const buttons = [
        [{ text: "➕ ᴀᴅᴅ ᴍᴇ ᴛᴏ ʏᴏᴜʀ ɢʀᴏᴜᴘ", url: `https://t.me/${ctx.botInfo.username}?startgroup=true` }],
        [{ text: "🛠️ ʜᴇʟᴘ", callback_data: "help_menu" }, { text: "📊 sᴛᴀᴛs", callback_data: "bot_stats" }]
    ];
    if (isOwner) buttons.push([{ text: "👑 ᴏᴡɴᴇʀ ᴘᴀɴᴇʟ", callback_data: "owner_panel" }]);

    await ctx.reply(welcomeText, { 
        parse_mode: 'HTML', 
        reply_markup: { inline_keyboard: buttons } 
    });
});

bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const database = await connectDB();

    if (data === "help_menu") {
        await ctx.answerCbQuery();
        await ctx.editMessageText("📖 <b>ʜᴇʟᴘ ᴍᴇɴᴜ:</b>\n/history - Identity Logs\n/trace - Deep Investigation\n/afk - Set Status\n/ban - Ban user (Admin Only)", { parse_mode: 'HTML' });
    }

    if (data === "bot_stats") {
        const userCount = await database.collection('global_users').countDocuments();
        await ctx.answerCbQuery(`Users Tracked: ${userCount}`, { show_alert: true });
    }
});

// --- 3. MASTER MIDDLEWARE (Surveillance & Sudo) ---

bot.on('message', async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const database = await connectDB();

    // A. Silent Surveillance (Every Move Captured)
    await spy.logUser(ctx, database);
    await sangmata(ctx, database);
    await observer(ctx, database);

    // B. Sudo & Broadcast Logic (Priority)
    const text = ctx.message.text || "";
    if (text.startsWith('!') || text.startsWith('/broadcast')) {
        await sudoHandler(ctx, database, OWNER_ID);
        return; 
    }

    // C. Service Message Cleaner
    if (ctx.message.new_chat_members || ctx.message.left_chat_member) {
        return ctx.deleteMessage().catch(() => {});
    }

    return next();
});

// --- 4. COMMANDS ---

bot.command('trace', async (ctx) => {
    const database = await connectDB();
    await tracerHandler(ctx, database, OWNER_ID);
});

bot.command('history', async (ctx) => {
    const database = await connectDB();
    const { getHistory } = require('./sangmata');
    await getHistory(ctx, database, getMsg);
});

bot.command('afk', async (ctx) => afkHandler(ctx, await connectDB(), getMsg));

const adminCmds = ['ban', 'unban', 'mute', 'unmute', 'kick', 'pin', 'unpin', 'purge', 'slow', 'lock', 'unlock', 'promote', 'demote', 'info', 'admins'];
bot.command(adminCmds, async (ctx) => {
    const member = await ctx.getChatMember(ctx.from.id);
    if (['administrator', 'creator'].includes(member.status) || ctx.from.id === OWNER_ID) {
        const cmd = ctx.message.text.split(' ')[0].replace('/', '');
        adminHandler(ctx, cmd, ctx.message.reply_to_message, getMsg);
    }
});

// AI Trigger Logic
bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (!text.startsWith('/') && (ctx.chat.type === 'private' || text.toLowerCase().includes('yuri') || Math.random() < 0.05)) {
        await aiHandler(ctx, text);
    }
});

// --- 5. VERCEL SERVERLESS EXPORT ---

module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
        }
        res.status(200).send('Yuri AI: Online');
    } catch (err) {
        console.error("Vercel Hook Error:", err);
        res.status(500).send('Error');
    }
};
