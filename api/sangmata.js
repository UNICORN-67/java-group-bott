module.exports = async (ctx, db) => {
    if (!ctx.from || ctx.chat.type === 'private') return;

    const uid = ctx.from.id.toString();
    const fullName = `${ctx.from.first_name} ${ctx.from.last_name || ""}`.trim();
    const username = ctx.from.username || "N/A";

    const userRef = db.collection('user_history');
    const userData = await userRef.findOne({ uid });

    if (!userData) {
        await userRef.insertOne({
            uid,
            names: [fullName],
            usernames: [username],
            last_seen: new Date()
        });
    } else {
        if (!userData.names.includes(fullName)) {
            await userRef.updateOne({ uid }, { $push: { names: fullName }, $set: { last_seen: new Date() } });
        }
        if (username !== "N/A" && !userData.usernames.includes(username)) {
            await userRef.updateOne({ uid }, { $push: { usernames: username }, $set: { last_seen: new Date() } });
        }
    }
};

module.exports.getHistory = async (ctx, db, getMsg) => {
    const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : ctx.from.id;
    const userData = await db.collection('user_history').findOne({ uid: target.toString() });

    if (!userData) return ctx.reply("❌ ɴᴏ ʀᴇᴄᴏʀᴅꜱ ꜰᴏᴜɴᴅ ɪɴ ᴅᴀᴛᴀʙᴀꜱᴇ.");

    let historyMsg = `👤 <b>ᴜsᴇʀ ʜɪsᴛᴏʀʏ</b>\n━━━━━━━━━━━━━━\n`;
    historyMsg += `📂 <b>ᴘᴀsᴛ ɴᴀᴍᴇs:</b>\n${userData.names.map(n => `• ${n}`).join('\n')}\n\n`;
    historyMsg += `🆔 <b>ᴘᴀsᴛ ᴜsᴇʀɴᴀᴍᴇs:</b>\n${userData.usernames.map(u => `• @${u}`).join('\n')}`;

    ctx.reply(historyMsg, { parse_mode: 'HTML' });
};
