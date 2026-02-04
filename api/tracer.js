const fs = require('fs');
const path = require('path');

module.exports = async (ctx, db, OWNER_ID) => {
    if (ctx.from.id !== OWNER_ID) return ctx.reply("❌ Restricted: Owner Only.");

    const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : null;
    if (!target) return ctx.reply("⚠️ Reply to a user to generate log.");

    const uid = target.id.toString();
    const history = await db.collection('user_history').findOne({ uid });
    const activities = await db.collection('global_users').findOne({ uid });

    let logData = `--- YURI DEEP TRACE REPORT ---\nTarget: ${target.first_name}\nID: ${uid}\n\n`;
    
    if (history) {
        logData += `[IDENTITIES]\nNames: ${history.names.join(' | ')}\nUsernames: ${history.usernames.join(' | ')}\n\n`;
    }

    if (activities && activities.seen_in_groups) {
        logData += `[FOOTPRINTS]\nGroups: ${activities.seen_in_groups.join(', ')}\nLast Active: ${activities.last_seen}`;
    }

    const fileName = `trace_${uid}.txt`;
    const filePath = path.join('/tmp', fileName);
    fs.writeFileSync(filePath, logData);

    await ctx.replyWithDocument({ source: filePath, filename: fileName }, { caption: `🔍 Trace Log for ${target.first_name}` });
    fs.unlinkSync(filePath);
};
