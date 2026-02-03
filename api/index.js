const { Telegraf } = require('telegraf');
const { MongoClient } = require('mongodb');
const axios = require('axios');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;
let taggingProcess = {};
const OWNER_ID = parseInt(process.env.OWNER_ID);
const LOG_CHANNEL = process.env.LOG_CHANNEL_ID;

// YAML Config Loader
let config = { commands: {}, messages: {} };
try {
    const yamlPath = path.join(__dirname, '..', 'commands.yml');
    config = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
} catch (e) { console.error("YAML Load Error:", e); }

const getMsg = (key, data = {}) => {
    let msg = config.messages[key] || "";
    for (const [k, v] of Object.entries(data)) {
        msg = msg.split(`{${k}}`).join(v);
    }
    return msg;
};

// --- DB & ADMIN HELPERS ---
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('yuri_final_db');
    return db;
}

const escapeHTML = (str) => str ? str.replace(/[&<>]/g, (t) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[t])) : "";

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try {
        const m = await ctx.getChatMember(ctx.from.id);
        return ['administrator', 'creator'].includes(m.status);
    } catch (e) { return false; }
}

// --- CORE HANDLER ---
bot.on('message', async (ctx, next) => {
    if (!ctx.message || ctx.chat.type === 'private') return next();
    const { text, from, chat, entities } = ctx.message;
    const database = await connectDB();
    const name = escapeHTML(from.first_name);

    // 1. Bio & Anti-Link Security
    try {
        if (!(await isAdmin(ctx))) {
            const user = await ctx.telegram.getChat(from.id);
            if (user.bio && /(t\.me|http|https|www)/i.test(user.bio)) {
                await ctx.deleteMessage().catch(() => {});
                return ctx.reply(getMsg('bio_warn', { name }), { parse_mode: 'HTML' });
            }
            if (entities?.some(e => e.type === 'url')) {
                return await ctx.deleteMessage().catch(() => {});
            }
        }
    } catch (e) {}

    // 2. AFK Logic
    if (entities) {
        for (const ent of entities) {
            if (ent.type === 'text_mention') {
                const afkData = await database.collection('afk').findOne({ uid: ent.user.id.toString() });
                if (afkData) ctx.reply(getMsg('afk_notify', { name: afkData.name, reason: afkData.reason }), { parse_mode: 'HTML' });
            }
        }
    }
    const amIAfk = await database.collection('afk').findOne({ uid: from.id.toString() });
    if (amIAfk && !text?.startsWith('/afk')) {
        await database.collection('afk').deleteOne({ uid: from.id.toString() });
        ctx.reply(getMsg('afk_back', { name }), { parse_mode: 'HTML' });
    }

    return next();
});

// --- COMMANDS ---
bot.start((ctx) => ctx.reply(getMsg('welcome'), { parse_mode: 'HTML' }));

bot.help((ctx) => {
    let help = `📖 <b>ʏᴜʀɪ ʜᴇʟᴘ ᴍᴇɴᴜ</b>\n━━━━━━━━━━━━━━\n`;
    for (const [cmd, desc] of Object.entries(config.commands)) { help += `• /${cmd} - ${desc}\n`; }
    ctx.reply(help, { parse_mode: 'HTML' });
});

// --- ADMIN SYSTEM (BAN, UNBAN, MUTE, UNMUTE, PIN, UNPIN, PURGE) ---
bot.command(['ban', 'unban', 'mute', 'unmute', 'pin', 'unpin', 'purge', 'tagall', 'cancel'], async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const target = ctx.message.reply_to_message;

    if (cmd === 'tagall') {
        const db = await connectDB();
        const members = await db.collection('activity').find({ gid: ctx.chat.id.toString() }).toArray();
        taggingProcess[ctx.chat.id] = true;
        for (let i = 0; i < members.length; i += 5) {
            if (!taggingProcess[ctx.chat.id]) break;
            ctx.reply(members.slice(i, i+5).map(u => `<a href="tg://user?id=${u.uid}">🔹</a>`).join(' '), { parse_mode: 'HTML' });
            await new Promise(r => setTimeout(r, 3000));
        }
        return;
    }

    if (cmd === 'cancel') { taggingProcess[ctx.chat.id] = false; return; }
    if (cmd === 'unpin') return await ctx.unpinChatMessage().catch(() => {});

    if (target) {
        try {
            const tid = target.from.id;
            if (cmd === 'ban') await ctx.banChatMember(tid);
            if (cmd === 'unban') await ctx.unbanChatMember(tid);
            if (cmd === 'mute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: false } });
            if (cmd === 'unmute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: true, can_send_media_messages: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true } });
            if (cmd === 'pin') await ctx.pinChatMessage(target.message_id);
            if (cmd === 'purge') {
                for (let i = target.message_id; i <= ctx.message.message_id; i++) {
                    await ctx.telegram.deleteMessage(ctx.chat.id, i).catch(() => {});
                }
            }
            if (LOG_CHANNEL) bot.telegram.sendMessage(LOG_CHANNEL, `🛡️ <b>ᴀᴄᴛɪᴏɴ:</b> ${cmd.toUpperCase()}\n👤 <b>ᴀᴅᴍɪɴ:</b> ${ctx.from.first_name}\n🎯 <b>ᴛᴀʀɢᴇᴛ:</b> ${target.from.first_name}`, { parse_mode: 'HTML' });
        } catch (e) { console.error(e); }
    }
});

bot.command('ping', async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const start = Date.now();
    const m = await ctx.reply('🛰️...');
    ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, getMsg('ping_msg', { time: Date.now() - start }), { parse_mode: 'HTML' });
});

module.exports = async (req, res) => {
    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
