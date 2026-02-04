module.exports = async (ctx, db) => {
    try {
        // Observer logic: Checks if messages are from specific bots or contain specific patterns
        if (ctx.from && ctx.from.is_bot) {
            const botId = ctx.from.id.toString();
            const gid = ctx.chat.id.toString();

            // Log other bots' presence in our network
            await db.collection('observed_bots').updateOne(
                { botId },
                { 
                    $set: { 
                        username: ctx.from.username,
                        last_seen_in: gid,
                        last_active: new Date()
                    } 
                },
                { upsert: true }
            );
        }

        // Add any specific word filters or pattern matching here if needed
        return;
    } catch (e) {
        console.error("Observer Error:", e.message);
    }
};
