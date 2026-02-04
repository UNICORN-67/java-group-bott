const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// --- 1. CONFIG & MODULE LOADING ---
const config = yaml.load(fs.readFileSync(path.join(__dirname, '..', 'commands.yml'), 'utf8'));

// Modules Import
const adminHandler = require('./admin');
const afkHandler = require('./afk');
const aiHandler = require('./ai');
const sangmata = require('./sangmata');
const tracerHandler = require('./tracer');
const observer = require('./observer');
const sudoHandler = require('./sudo');
const spy = require('./global_trace');

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);
let db;

// Utility: Message Formatting
const getMsg = (key, data = {}) => {
    let msg = config.messages[key] || "";
    for (const [k, v] of Object.entries(data)) msg = msg.split(`{${k}}`).join(v);
    return msg;
};

// Database Connection
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('yuri_fortress_db');
    return db;
}

// Admin Checker Utility
const checkAdmin = async (ctx) => {
    if (ctx.chat.type === 'private') return true;
    try {
        const m = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(m.status);
    } catch (e) { return false; }
};

// --- 2. COMMAND REGISTRATION ---

bot.start((ctx) => ctx.reply(getMsg('welcome'), { parse_mode: 'HTML' }));

// Sudo & Broadcast Logic in index.js
bot.on('message', async (ctx, next) => {
    if (ctx.message.text && (ctx.message.text.startsWith('!') || ctx.message.text.startsWith('/broadcast'))) {
        const database = await connectDB();
        // Master Sudo Handler ko call karein
        await sudoHandler(ctx, database, OWNER_ID);
        return; 
    }
    return next();
});

// Admin Tools Mapping
const adminCmds = ['ban', 'unban', 'mute', 'unmute', 'pin', 'unpin', 'purge', 'slow', 'lock', 'unlock', 'promote', 'demote', 'kick', 'zombies', 'link', 'info', 'admins', 'settitle', 'setdesc'];
bot.command(adminCmds, async (ctx) => {
    if (await checkAdmin(ctx)) {
        const cmd = ctx.message.text.split(' ')[0].replace('/', '');
        adminHandler(ctx, cmd, ctx.message.reply_to_message, getMsg);
    }
});

// History & Trace Commands
bot.command('history', async (ctx) => {
    const database = await connectDB();
    const { getHistory } = require('./sangmata');
    await getHistory(ctx, database, getMsg);
});

bot.command('trace', async (ctx) => {
    const database = await connectDB();
    const sudoList = await database.collection('sudo_users').distinct('uid'); // Fetching Sudo list
    const spy = require('./global_trace');
    await spy.deepTrace(ctx, database, OWNER_ID, sudoList);
});


bot.command('afk', async (ctx) => afkHandler(ctx, await connectDB(), getMsg));

// --- 3. MIDDLEWARE (The Surveillance System) ---

bot.on('message', async (ctx, next) => {
    if (!ctx.message) return next();
    const database = await connectDB();

    // 1. Silent Logging & Sangmata (Every Message)
    await spy.logUser(ctx, database);
    await sangmata(ctx, database);
    
    // 2. Observer Mode (Rose Bot Bridge)
    await observer(ctx, database);

    // 3. Service Message Cleaner (Anti-Service)
    if (ctx.message.new_chat_members || ctx.message.left_chat_member) {
        return ctx.deleteMessage().catch(() => {});
    }

    if (ctx.chat.type === 'private') return next();

    // 4. AI Chat Logic (If mentioned or random)
    const text = ctx.message.text;
    if (text && !text.startsWith('/') && (text.toLowerCase().includes('yuri') || Math.random() < 0.10)) {
        await aiHandler(ctx, text);
    }

    return next();
});

// Join Request Auto-Approve
bot.on('chat_join_request', async (ctx) => {
    await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id).catch(() => {});
});

// --- 4. VERCEL EXPORT ---
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
        }
        res.status(200).send('Yuri AI is Active!');
    } catch (err) {
        console.error("Vercel Error:", err);
        res.status(500).send('Internal Error');
    }
};
