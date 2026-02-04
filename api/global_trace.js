const fs = require('fs');
const path = require('path');

module.exports = {
    // 1. Silent Logger: Har activity ko capture karne ke liye
    logUser: async (ctx, db) => {
        if (!ctx.from || !ctx.chat || ctx.chat.type === 'private') return;

        const uid = ctx.from.id.toString();
        const gid = ctx.chat.id.toString();
        const gName = ctx.chat.title;

        await db.collection('global_users').updateOne(
            { uid },
            { 
                $set: { 
                    name: ctx.from.first_name, 
                    username: ctx.from.username || "N/A",
                    last_seen: new Date()
                },
                $addToSet: { 
                    seen_in_groups: { gid, gName } // Group ID aur Name dono track honge
                },
                $inc: { total_messages: 1 } // Global message count
            },
            { upsert: true }
        );
    },

    // 2. Deep Trace Logic: Investigation Report Generator
    deepTrace: async (ctx, db, OWNER_ID, sudoList) => {
        const user_id = ctx.from.id;
        const isOwner = (user_id === OWNER_ID);
        const isSudo = sudoList.includes(user_id.toString());

        if (!isOwner && !isSudo) return ctx.reply("❌ Restricted: Only Sudo/Owner can trace.");

        const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from : null;
        if (!target) return ctx.reply("⚠️ Reply to a user to perform Deep Trace.");

        const uid = target.id.toString();
        const userData = await db.collection('global_users').findOne({ uid });
        const history = await db.collection('user_history').findOne({ uid });

        let report = `--- YURI AI GLOBAL INVESTIGATION REPORT ---\n`;
        report += `Generated on: ${new Date().toLocaleString()}\n`;
        report += `-------------------------------------------\n\n`;
        report += `[USER INFO]\n`;
        report += `ID: ${uid}\n`;
        report += `Current Name: ${target.first_name}\n`;
        report += `Username: @${target.username || 'None'}\n\n`;

        if (history) {
            report += `[IDENTITY LOGS]\n`;
            report += `Past Names: ${history.names.join(' -> ')}\n`;
            report += `Past Usernames: ${history.usernames.join(' -> ')}\n\n`;
        }

        if (userData) {
            report += `[NETWORK FOOTPRINTS]\n`;
            report += `Total Global Messages: ${userData.total_messages || 0}\n`;
            report += `Last Active: ${userData.last_seen}\n`;
            report += `Groups Detected (${userData.seen_in_groups.length}):\n`;
            userData.seen_in_groups.forEach(g => {
                report += `- ${g.gName} (${g.gid})\n`;
            });
        } else {
            report += `[STATUS]: User is a ghost. No global activity found yet.\n`;
        }

        report += `\n--- END OF REPORT ---`;

        // File generation
        const fileName = `global_trace_${uid}.txt`;
        const filePath = path.join('/tmp', fileName);
        fs.writeFileSync(filePath, report);

        await ctx.replyWithDocument(
            { source: filePath, filename: fileName }, 
            { caption: `🕵️‍♂️ <b>ɢʟᴏʙᴀʟ ᴛʀᴀᴄᴇ ʀᴇᴘᴏʀᴛ:</b> <code>${target.first_name}</code>`, parse_mode: 'HTML' }
        );

        fs.unlinkSync(filePath);
    }
};
