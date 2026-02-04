const axios = require('axios');

module.exports = async (ctx, text) => {
    try {
        // Cleaning text (mention hatane ke liye)
        const cleanText = text.replace(/yuri/gi, '').trim();

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [
                { 
                    role: "system", 
                    content: "You are Yuri, a witty, helpful, and slightly sarcastic girl. Speak in natural Hinglish (Hindi + English). Keep replies short and engaging." 
                },
                { role: "user", content: cleanText }
            ],
            max_tokens: 100,
            temperature: 0.8
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const reply = response.data.choices[0].message.content;
        await ctx.reply(reply, { reply_to_message_id: ctx.message.message_id });

    } catch (e) {
        console.error("AI Error:", e.response ? e.response.data : e.message);
        // Error par funny fallback
        ctx.reply("Bhai, dimaag thoda garam ho gaya hai mera, baad mein baat karte hain! 🙄");
    }
};
