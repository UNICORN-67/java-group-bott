import logging
from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

# 1. Setup Logging (to see errors in your console)
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

# 2. Start Command: Sends the button that opens your app
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # REPLACE with your actual Web App URL from @BotFather
    # Example: https://t.me/your_bot_user/app_name
    web_app_url = "https://yurimanager.netlify.app"
    
    # IMPORTANT: tg.sendData only works if opened via a KeyboardButton like this
    keyboard = [
        [KeyboardButton(text="Open Nexus Hub 🇮🇳", web_app=WebAppInfo(url=web_app_url))]
    ]
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    
    await update.message.reply_text(
        "✨ **Welcome to Nexus Hub** ✨\n\nTap the button below to view your patriotic profile.",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )

# 3. Web App Data Handler: Catches the message sent from index.html
async def handle_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # This reads the string sent via tg.sendData()
    received_data = update.effective_message.web_app_data.data
    user_name = update.effective_user.first_name
    
    # Send a confirmation back to the user in the chat
    await update.message.reply_text(
        f"🇮🇳 **Session Confirmed** 🇮🇳\n\n"
        f"User: {user_name}\n"
        f"Status: {received_data}\n\n"
        f"Jai Hind!"
    )

if __name__ == '__main__':
    # REPLACE 'YOUR_BOT_TOKEN' with the token you got from @BotFather
    application = ApplicationBuilder().token('7740494854:AAFEgBYHVdcQEAAh7GpPRf0tqLBoq_wzZeA').build()
    
    # Handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_app_data))
    
    print("Bot is alive and waiting for Tiranga Hub sessions... 🇮🇳")
    application.run_polling()
