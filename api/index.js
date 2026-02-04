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

// --- 2. MASTER MIDDLEWARE (The Surveillance Hub) ---

bot.on('message', async (ctx, next) => {
    if (!ctx.from || !ctx.chat) return next();
    const database = await connectDB();

    // A. Silent Surveillance (Tracking Every Move)
    await spy.logUser(ctx, database); // Global tracking with group names
    await sangmata(ctx, database);  // Name & Username history
    await observer(ctx, database);  // Rose Bot Bridge

    // B. Service Message Cleaner
    if (ctx.message.new_chat_members || ctx.message.left_chat_member) {
        return ctx.deleteMessage().catch(() => {});
    }

    // C. Sudo & Broadcast Handler (Priority Check)
    const text = ctx.message.text || "";
    if (text.startsWith('!') || text.startsWith('/broadcast')) {
        await sudoHandler(ctx, database, OWNER_ID);
        return; // Execute sudo and stop
    }

    return next();
});

// --- 3. COMMANDS ---

bot.start((ctx) => ctx.reply(getMsg('welcome'), { parse_mode: 'HTML' }));

// Trace Command (Integrated with Sudo & Forensic Tracer)
bot.command('trace', async (ctx) => {
    const database = await connectDB();
    await tracerHandler(ctx, database, OWNER_ID);
});

// History Command (Sangmata)
bot.command('history', async (ctx) => {
    const database = await connectDB();
    const { getHistory } = require('./sangmata');
    await getHistory(ctx, database, getMsg);
});

// AFK Command
bot.command('afk', async (ctx) => {
    const database = await connectDB();
    await afkHandler(ctx, database, getMsg);
});

// Admin Command Logic
const adminCmds = ['ban', 'unban', 'mute', 'unmute', 'kick', 'pin', 'unpin', 'purge', 'slow', 'lock', 'unlock', 'promote', 'demote', 'info', 'admins'];
bot.command(adminCmds, async (ctx) => {
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    // Simple Admin Check
    const member = await ctx.getChatMember(ctx.from.id);
    if (['administrator', 'creator'].includes(member.status) || ctx.from.id === OWNER_ID) {
        adminHandler(ctx, cmd, ctx.message.reply_to_message, getMsg);
    }
});

// --- 4. AI & CHAT LOGIC ---

bot.on('text', async (ctx) => {
    if (ctx.chat.type === 'private' || ctx.message.text.toLowerCase().includes('yuri') || Math.random() < 0.05) {
        if (!ctx.message.text.startsWith('/')) {
            await aiHandler(ctx, ctx.message.text);
        }
    }
});

// Join Request Approval
bot.on('chat_join_request', async (ctx) => {
    await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id).catch(() => {});
});

// --- 5. VERCEL SERVERLESS EXPORT ---

module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
        }
        res.status(200).send('Yuri AI System: ONLINE');
    } catch (err) {
        console.error("Master Hub Error:", err);
        res.status(500).send('Webhook Error');
    }
};
