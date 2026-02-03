const { Telegraf, Markup } = require('telegraf');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);
let db;
let taggingProcess = {};
const OWNER_ID = parseInt(process.env.OWNER_ID);

// --- 1. HELPERS & DB ---
async function connectDB() {
    if (db) return db;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db('tg_management_db');
    return db;
}

const escapeHTML = (str) => { if (!str) return ""; return str.replace(/[&<>]/g, (t) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[t] || t)); };

async function isAdmin(ctx) {
    if (ctx.chat.type === 'private') return true;
    try { const m = await ctx.getChatMember(ctx.from.id); return ['administrator', 'creator'].includes(m.status); } catch (e) { return false; }
}

const fullClean = async (ctx, botMsgId, timer = 10000) => {
    try { await ctx.deleteMessage().catch(() => {}); } catch (e) {}
    setTimeout(async () => { try { await ctx.telegram.deleteMessage(ctx.chat.id, botMsgId).catch(() => {}); } catch (e) {} }, timer);
};

// --- 2. OPENAI SMART BRAIN ---
async function getSmartAIReply(userMessage, userName, historyContext) {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: `You are Yuri, a witty, real girl. Talk in natural Hinglish. Context: ${historyContext}. Short, spicy, and human-like.` },
                { role: "user", content: `${userName} said: ${userMessage}` }
            ],
            max_tokens: 80,
            temperature: 0.8
        }, {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    } catch (e) { return null; }
}

// --- 3. START & HELP COMMANDS ---
bot.start((ctx) => {
    const msg = `✨ <b>Hello! I'm Yuri AI</b>\n\nMain ek intelligent aur fun group management bot hoon jo khud se baatein seekhti hai aur group ko manage karti hai.\n\nCommands dekhne ke liye /help likhein!`;
    ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.help(async (ctx) => {
    let helpText = `📖 <b>Yuri AI Help Menu</b>\n\n` +
        `👤 <b>Users:</b>\n` +
        `• /info - Get user ID and info.\n` +
        `• /ping - Check bot speed (Owner Only).\n\n` +
        `👮 <b>Admins:</b>\n` +
        `• /ban, /unban - Reply to user.\n` +
        `• /mute, /unmute - Restrict user.\n` +
        `• /pin, /unpin - Pin messages.\n` +
        `• /purge - Delete messages from reply.\n` +
        `• /tagall - Tag active members.\n` +
        `• /cancel - Stop tagging.\n\n` +
        `👑 <b>Owner:</b>\n` +
        `• /leaderboard - Today's top chatters.\n` +
        `• /speed - Detailed server stats.`;
    
    const m = await ctx.reply(helpText, { parse_mode: 'HTML' });
    if (ctx.chat.type !== 'private') fullClean(ctx, m.message_id, 30000);
});

// --- 4. MAIN TEXT HANDLER (Activity + Context + AI) ---
bot.on('text', async (ctx, next) => {
    if (ctx.chat.type === 'private' || !ctx.message.text || ctx.message.text.startsWith('/')) return next();
    
    const msg = ctx.message;
    const text = msg.text;
    const name = escapeHTML(ctx.from.first_name);
    const database = await connectDB();
    const gid = ctx.chat.id.toString();

    await database.collection('activity').updateOne({ gid, uid: ctx.from.id.toString() }, { $set: { name, uid: ctx.from.id.toString() } }, { upsert: true });
    await database.collection('context').insertOne({ gid, text, name, time: new Date() });

    const isYuri = text.toLowerCase().includes("yuri");
    const isReplyToBot = msg.reply_to_message && msg.reply_to_message.from.id === ctx.botInfo.id;
    const randomReply = Math.random() < 0.25; 

    if (isYuri || isReplyToBot || randomReply) {
        const history = await database.collection('context').find({ gid }).sort({ time: -1 }).limit(3).toArray();
        const historyContext = history.map(h => `${h.name}: ${h.text}`).join(' | ');

        setTimeout(async () => {
            ctx.sendChatAction('typing');
            const aiReply = await getSmartAIReply(text, name, historyContext);
            if (aiReply) await ctx.reply(aiReply, { reply_to_message_id: msg.message_id });
        }, 1500);
    }
    return next();
});

// --- 5. OWNER & ADMIN COMMANDS ---
bot.command(['ping', 'speed', 'leaderboard'], async (ctx) => {
    if (ctx.from.id !== OWNER_ID) return;
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const db = await connectDB();
    
    if (cmd === 'leaderboard') {
        const top = await db.collection('activity').find({ gid: ctx.chat.id.toString() }).limit(10).toArray();
        let res = `🏆 <b>ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ</b>\n\n` + top.map((u, i) => `${i<3?['🥇','🥈','🥉'][i]:'👤'} ${u.name}`).join('\n');
        return fullClean(ctx, (await ctx.reply(res, { parse_mode: 'HTML' })).message_id, 30000);
    }
    
    const start = Date.now();
    const m = await ctx.reply('🚀 <i>Testing...</i>', { parse_mode: 'HTML' });
    ctx.telegram.editMessageText(ctx.chat.id, m.message_id, null, `⚡ <b>Ping:</b> ${Date.now()-start}ms`, { parse_mode: 'HTML' });
    fullClean(ctx, m.message_id);
});

bot.command(['ban', 'unban', 'mute', 'unmute', 'pin', 'unpin', 'purge', 'tagall', 'cancel', 'info'], async (ctx) => {
    const cmd = ctx.message.text.split(' ')[0].replace('/', '');
    const gid = ctx.chat.id.toString();

    if (cmd === 'info') {
        let t = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : ctx.from;
        return fullClean(ctx, (await ctx.reply(`🆔 <code>${t.id}</code>\n📛 ${escapeHTML(t.first_name)}`, { parse_mode: 'HTML' })).message_id);
    }

    if (!(await isAdmin(ctx))) return;

    if (cmd === 'tagall') {
        const db = await connectDB();
        const members = await db.collection('activity').find({ gid }).toArray();
        taggingProcess[gid] = true;
        await ctx.reply("📢 Tagging Shuru...");
        for (let i = 0; i < members.length; i += 5) {
            if (!taggingProcess[gid]) break;
            await ctx.reply(members.slice(i, i + 5).map(u => `<a href="tg://user?id=${u.uid}">🔹</a>`).join(' '), { parse_mode: 'HTML' });
            await new Promise(r => setTimeout(r, 3000));
        }
        return delete taggingProcess[gid];
    }
    
    if (cmd === 'cancel') { taggingProcess[gid] = false; return; }

    const target = ctx.message.reply_to_message;
    if (!target && cmd !== 'unpin') return;

    try {
        const tid = target?.from.id;
        if (cmd === 'ban') await ctx.banChatMember(tid);
        if (cmd === 'unban') await ctx.unbanChatMember(tid);
        if (cmd === 'mute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: false } });
        if (cmd === 'unmute') await ctx.restrictChatMember(tid, { permissions: { can_send_messages: true } });
        if (cmd === 'pin') await ctx.pinChatMessage(target.message_id);
        if (cmd === 'unpin') await ctx.unpinChatMessage();
        if (cmd === 'purge') for (let i = target.message_id; i <= ctx.message.message_id; i++) await ctx.telegram.deleteMessage(ctx.chat.id, i).catch(() => {});
    } catch (e) {}
});

module.exports = async (req, res) => { if (req.method === 'POST') await bot.handleUpdate(req.body); res.status(200).send('OK'); };
