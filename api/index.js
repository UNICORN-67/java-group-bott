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

// --- YAML Content Loader ---
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

// --- Database Connection ---
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

// --- Auto-Clean Background Task ---
async function cleanOldMedia(gid, hours = 6) {
    const database = await connectDB();
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);
    const riskyMsgs = await database.collection('media_logs').find({
        gid: gid,
        timestamp: { $lt: threshold }
    }).toArray();

    for (const msg of riskyMsgs) {
        await bot.telegram.deleteMessage(msg.gid, msg.mid).catch(() => {});
        await database.collection('media_logs').deleteOne({ _id: msg._id });
    }
}

// --- Main Security & Interaction Handler ---
bot.on('message', async (ctx, next) => {
    if (!ctx.message || ctx.chat.type === 'private') return next();
    const { text, from, chat, entities, message_id } = ctx.message;
    const database = await connectDB();
    const name = escapeHTML(from.first_name);
    const gid = chat.id.toString();

    // 1. Media Tracking (For Auto-Clean Copyright Protection)
    if (ctx.message.photo || ctx.message.video || ctx.message.document || ctx.message.audio) {
        await database.collection('media_logs').insertOne({
            mid: message_id,
            gid: gid,
            timestamp: new Date()
        });
    }

    // 2. Anti-Mass Report & Banned Keywords
    const risky = [/report/i, /copyright/i, /raid/i, /abuse/i, /porn/i];
    if (text && risky.some(rx => rx.test(text)) && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        return;
    }

    // 3. Bio Link Remover
    try {
        if (!(await isAdmin(ctx))) {
            const user = await ctx.telegram.getChat(from.id);
            if (user.bio && /(t\.me|http|https|www)/i.test(user.bio)) {
                await ctx.deleteMessage().catch(() => {});
                return ctx.reply(getMsg('bio_warn', { name }), { parse_mode: 'HTML' });
            }
        }
    } catch (e) {}

    // 4. Anti-Link
    if (entities?.some(e => e.type === 'url') && !(await isAdmin(ctx))) {
        await ctx.deleteMessage().catch(() => {});
        return;
    }

    // 5. AFK System
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

    // 6. Activity Tracking & AI
    if (text && !text.startsWith('/')) {
        const today = new Date().toISOString().split('T')[0];
        await database.collection('activity').updateOne({ gid, uid: from.id.toString(), date: today }, { $set: { name }, $inc: { count: 1 } }, { upsert: true });
        
        if (text.toLowerCase().includes('yuri') || Math.random() < 0.15) {
            const aiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-3.5-turbo",
                messages: [{ role: "system", content: "You are Yuri, a witty girl. Use natural Hinglish." }, { role: "user", content: text }],
                max_tokens: 60
            }, { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } }).catch(() => null);
            if (aiRes) ctx.reply(aiRes.data.choices[0].message.content, { reply_to_message_id: message_id });
        }
    }
    return next();
});

// --- Commands Section ---
bot.start((ctx) => ctx.reply(getMsg('welcome'), { parse_mode: 'HTML' }));

bot.help((ctx) => {
    let help = `📖 <b>ʏᴜʀɪ ʜᴇʟᴘ ᴍᴇɴᴜ</b>\n━━━━━━━━━━━━━━\n`;
    for (const [cmd, desc] of Object.entries(config.commands)) { help += `• /${cmd} - ${desc}\n`; }
    ctx.reply(help, { parse_mode: 'HTML' });
});

bot.command('afk', async (ctx) => {
    const reason = ctx.message.text.split(' ').slice(1).join(' ') || "Busy!";
    const db = await connectDB();
    await db.collection('afk').updateOne({ uid: ctx.from.id.toString() }, { $set: { name: ctx.from.first_name, reason } }, { upsert: true });
    ctx.reply(getMsg('afk_set', { name: ctx.from.first_name, reason }), { parse_mode: 'HTML' });
});

bot.command('autoclean', async (ctx) => {
    if (!(await isAdmin(ctx))) return;
    const hours = parseInt(ctx.message.text.split(' ')[1]) || 6;
    setInterval(() => cleanOldMedia(ctx.chat.id.toString(), hours), 60 * 60 * 1000);
    ctx.reply(getMsg('clean_start', { hours }), { parse_mode: 'HTML' });
});

bot.command(['ban', 'unban', 'mute', 'unmute', 'pin', 'unpin', 'purge', 'tagall'], async (ctx) => {
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

    if (target) {
        try {
            const tid = target.from.id;
            if (cmd === 'ban') await ctx.banChatMember(tid);
            if (cmd === 'unban') await ctx.unbanChatMember(tid);
            if (cmd === 'mute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: false } });
            if (cmd === 'unmute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true, can_add_web_page_previews: true } });
            if (cmd === 'pin') await ctx.pinChatMessage(target.message_id);
            if (cmd === 'unpin') await ctx.unpinChatMessage(target.message_id);
            if (cmd === 'purge') {
                for (let i = target.message_id; i <= ctx.message.message_id; i++) {
                    await ctx.telegram.deleteMessage(ctx.chat.id, i).catch(() => {});
                }
            }
            if (LOG_CHANNEL) bot.telegram.sendMessage(LOG_CHANNEL, `🛡️ ᴀᴄᴛɪᴏɴ: ${cmd.toUpperCase()}\n👤 ᴀᴅᴍɪɴ: ${ctx.from.first_name}\n🎯 ᴛᴀʀɢᴇᴛ: ${target.from.first_name}`);
        } catch (e) {}
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
