module.exports = async (ctx, db, OWNER_ID) => {
    const user_id = ctx.from.id;
    const args = ctx.message.text.split(' ');
    const command = args[0].toLowerCase();

    // 1. Check if user is Owner or Sudo
    const sudoList = await db.collection('sudo_users').distinct('uid');
    const isOwner = (user_id === OWNER_ID);
    const isSudo = sudoList.includes(user_id.toString());

    if (!isOwner && !isSudo) return; // Access Denied

    try {
        // --- OWNER ONLY COMMANDS ---
        if (isOwner) {
            // ADD SUDO: !addsudo (reply or ID)
            if (command === '!addsudo') {
                const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : args[1];
                if (!target) return ctx.reply("⚠️ Target ID provide karein ya reply karein.");
                
                await db.collection('sudo_users').updateOne(
                    { uid: target.toString() },
                    { $set: { added_by: OWNER_ID, date: new Date() } },
                    { upsert: true }
                );
                return ctx.reply(`✅ <code>${target}</code> ɴᴏᴡ ʜᴀꜱ ꜱᴜᴅᴏ ᴘᴏᴡᴇʀꜱ!`, { parse_mode: 'HTML' });
            }

            // REMOVE SUDO: !rmsudo (reply or ID)
            if (command === '!rmsudo') {
                const target = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : args[1];
                await db.collection('sudo_users').deleteOne({ uid: target.toString() });
                return ctx.reply(`❌ ꜱᴜᴅᴏ ᴘᴏᴡᴇʀꜱ ʀᴇᴠᴏᴋᴇᴅ ꜰʀᴏᴍ <code>${target}</code>`, { parse_mode: 'HTML' });
            }

            // LIST SUDO: !sudolist
            if (command === '!sudolist') {
                const allSudo = await db.collection('sudo_users').find().toArray();
                let list = "👑 <b>ꜱᴜᴅᴏ ᴜꜱᴇʀꜱ ʟɪꜱᴛ:</b>\n\n";
                allSudo.forEach(s => list += `• <code>${s.uid}</code>\n`);
                return ctx.reply(list, { parse_mode: 'HTML' });
            }
        }

        // --- SUDO & OWNER COMMANDS ---
        
        // GLOBAL BROADCAST
        if (command.includes('broadcast')) {
            const msg = ctx.message.reply_to_message ? ctx.message.reply_to_message.text : args.slice(1).join(' ');
            if (!msg) return ctx.reply("⚠️ Message provide karein.");

            const groups = await db.collection('global_users').distinct('seen_in_groups');
            let count = 0;
            for (const gid of groups) {
                try {
                    await ctx.telegram.sendMessage(gid, `📢 <b>ɢʟᴏʙᴀʟ ᴀɴɴᴏᴜɴᴄᴇᴍᴇɴᴛ</b>\n\n${msg}`, { parse_mode: 'HTML' });
                    count++;
                } catch (e) { continue; }
            }
            ctx.reply(`✅ Broadcasted to ${count} groups.`);
        }

        // GLOBAL BAN
        if (command === '!gban') {
            const tid = ctx.message.reply_to_message ? ctx.message.reply_to_message.from.id : args[1];
            if (!tid) return;
            const groups = await db.collection('global_users').distinct('seen_in_groups');
            for (const gid of groups) await ctx.telegram.banChatMember(gid, tid).catch(() => {});
            ctx.reply(`🔥 Global Ban executed on ${tid}`);
        }

    } catch (e) {
        console.error("Sudo Module Error:", e);
    }
};
