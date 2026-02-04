module.exports = async (ctx, cmd, target, getMsg) => {
    const tid = target ? target.from.id : null;
    const args = ctx.message.text.split(' ');

    try {
        // 1. PIN & UNPIN
        if (cmd === 'pin' && target) {
            return await ctx.pinChatMessage(target.message_id);
        }
        if (cmd === 'unpin') {
            return await ctx.unpinChatMessage().catch(() => {});
        }

        // 2. BAN & UNBAN
        if (cmd === 'ban' && tid) {
            return await ctx.banChatMember(tid);
        }
        if (cmd === 'unban' && tid) {
            return await ctx.unbanChatMember(tid);
        }

        // 3. MUTE & UNMUTE
        if (cmd === 'mute' && tid) {
            return await ctx.restrictChatMember(tid, { 
                permissions: { can_send_messages: false } 
            });
        }
        if (cmd === 'unmute' && tid) {
            return await ctx.restrictChatMember(tid, { 
                permissions: { 
                    can_send_messages: true, 
                    can_send_media_messages: true, 
                    can_send_other_messages: true, 
                    can_add_web_page_previews: true 
                } 
            });
        }

        // 4. KICK (Nikal dena, ban nahi karna)
        if (cmd === 'kick' && tid) {
            await ctx.banChatMember(tid);
            await ctx.unbanChatMember(tid);
            return ctx.reply("👢 ᴜꜱᴇʀ ᴋɪᴄᴋᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ!");
        }

        // 5. SLOW MODE (Usage: /slow 10)
        if (cmd === 'slow') {
            const seconds = parseInt(args[1]) || 0;
            await ctx.setChatPermissions(ctx.chat.permissions, { slow_mode_delay: seconds });
            return ctx.reply(`⏳ ꜱʟᴏᴡ ᴍᴏᴅᴇ ꜱᴇᴛ ᴛᴏ ${seconds} ꜱᴇᴄᴏɴᴅꜱ!`);
        }

        // 6. LOCK & UNLOCK (Group Permissions)
        if (cmd === 'lock') {
            await ctx.setChatPermissions({ can_send_messages: false });
            return ctx.reply("🔒 <b>ɢᴄ ʟᴏᴄᴋᴇᴅ!</b> ɴᴏɴ-ᴀᴅᴍɪɴꜱ ᴄᴀɴ'ᴛ ꜱᴘᴇᴀᴋ.", { parse_mode: 'HTML' });
        }
        if (cmd === 'unlock') {
            await ctx.setChatPermissions({ 
                can_send_messages: true, 
                can_send_media_messages: true, 
                can_send_other_messages: true 
            });
            return ctx.reply("🔓 <b>ɢᴄ ᴜɴʟᴏᴄᴋᴇᴅ!</b> ᴇᴠᴇʀʏᴏɴᴇ ᴄᴀɴ ꜱᴘᴇᴀᴋ.", { parse_mode: 'HTML' });
        }

        // 7. PROMOTE & DEMOTE
        if (cmd === 'promote' && tid) {
            return await ctx.promoteChatMember(tid, {
                can_change_info: true,
                can_delete_messages: true,
                can_invite_users: true,
                can_restrict_members: true,
                can_pin_messages: true,
                can_promote_members: false
            });
        }
        if (cmd === 'demote' && tid) {
            return await ctx.promoteChatMember(tid, {
                can_change_info: false,
                can_delete_messages: false,
                can_invite_users: false,
                can_restrict_members: false,
                can_pin_messages: false,
                can_promote_members: false
            });
        }

        // 8. PURGE (Delete multiple messages)
        if (cmd === 'purge' && target) {
            const startId = target.message_id;
            const endId = ctx.message.message_id;
            for (let i = startId; i <= endId; i++) {
                await ctx.telegram.deleteMessage(ctx.chat.id, i).catch(() => {});
            }
            return; // No reply needed as messages are gone
        }

        // 9. INFO & ADMINS
        if (cmd === 'info' && target) {
            const user = target.from;
            return ctx.reply(`👤 <b>ᴜꜱᴇʀ ɪɴꜰᴏ:</b>\n\n• ɴᴀᴍᴇ: ${user.first_name}\n• ɪᴅ: <code>${user.id}</code>\n• ᴜꜱᴇʀɴᴀᴍᴇ: @${user.username || 'N/A'}`, { parse_mode: 'HTML' });
        }
        if (cmd === 'admins') {
            const admins = await ctx.getChatAdministrators();
            let adminList = "👮 <b>ᴀᴅᴍɪɴ ʟɪsᴛ:</b>\n\n";
            admins.forEach(adm => { 
                adminList += `• ${adm.user.first_name} [<code>${adm.user.id}</code>]\n`; 
            });
            return ctx.reply(adminList, { parse_mode: 'HTML' });
        }

        // Generic confirmation from YAML for basic actions
        ctx.reply(getMsg('action_done', { action: cmd.toUpperCase() }), { parse_mode: 'HTML' });

    } catch (e) {
        console.error(`Admin Command Error (${cmd}):`, e);
        ctx.reply("❌ ᴀᴄᴛɪᴏɴ ꜰᴀɪʟᴇᴅ! ᴄʜᴇᴄᴋ ᴍʏ ᴘᴇʀᴍɪꜱꜱɪᴏɴꜱ.");
    }
};
