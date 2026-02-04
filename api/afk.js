module.exports = async (ctx, db, getMsg) => {
    try {
        const reason = ctx.message.text.split(' ').slice(1).join(' ') || "Busy right now!";
        const user = ctx.from;

        await db.collection('afk').updateOne(
            { uid: user.id.toString() },
            { 
                $set: { 
                    name: user.first_name, 
                    reason: reason,
                    time: new Date()
                } 
            },
            { upsert: true }
        );

        ctx.reply(getMsg('afk_set', { name: user.first_name, reason }), { parse_mode: 'HTML' });
    } catch (e) {
        console.error("AFK Error:", e);
    }
};
