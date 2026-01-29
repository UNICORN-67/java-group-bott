import os
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, Request, Response
from telegram import Update, Bot
from telegram.ext import Application, MessageHandler, filters

# --- 1. CONFIGURATION ---
TOKEN = os.getenv("7740494854:AAFFLULc0lJ_Py2E0rj7RzNi1pCYeSfLOE0")
DATABASE_URL = os.getenv("DATABASE_URL") # Get this from Neon.tech
app = FastAPI()

# Initialize Bot and Dispatcher
bot = Bot(token=TOKEN)
application = Application.builder().token(TOKEN).build()

# --- 2. THE MINI APP (HTML) ---
HTML_CONTENT = """
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { font-family: sans-serif; text-align: center; background: #fff; padding: 20px; }
        .score { font-size: 50px; color: #2481cc; font-weight: bold; }
        button { background: #2481cc; color: white; border: none; padding: 15px; width: 100%; border-radius: 10px; font-size: 18px; }
    </style>
</head>
<body>
    <h2 id="user">Player</h2>
    <div class="score" id="s">0</div>
    <button onclick="tap()">TAP!</button>
    <button onclick="send()" style="background:#31a667; margin-top:10px;">SUBMIT SCORE</button>
    <script>
        const tg = window.Telegram.WebApp;
        let score = 0;
        document.getElementById('user').innerText = tg.initDataUnsafe?.user?.first_name || "Guest";
        function tap() { score++; document.getElementById('s').innerText = score; tg.HapticFeedback.impactOccurred('light'); }
        function send() { tg.sendData(JSON.stringify({score: score, name: tg.initDataUnsafe?.user?.first_name})); }
        tg.ready();
    </script>
</body>
</html>
"""

# --- 3. POSTGRESQL DATABASE LOGIC ---
def get_db_connection():
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def init_db():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS scores (id BIGINT PRIMARY KEY, name TEXT, high_score INTEGER)")
    conn.commit()
    cur.close()
    conn.close()

async def handle_data(update: Update, context):
    data = json.loads(update.effective_message.web_app_data.data)
    user_id = update.effective_user.id
    name = data['name']
    score = data['score']

    conn = get_db_connection()
    cur = conn.cursor()
    # PostgreSQL UPSERT syntax
    cur.execute("""
        INSERT INTO scores (id, name, high_score) VALUES (%s, %s, %s)
        ON CONFLICT(id) DO UPDATE SET high_score = GREATEST(scores.high_score, EXCLUDED.high_score)
    """, (user_id, name, score))
    conn.commit()
    cur.close()
    conn.close()

    await update.message.reply_text(f"✅ Score saved to PostgreSQL!")

# Register handler
application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_data))

# --- 4. ROUTES ---
@app.get("/")
async def index():
    return Response(content=HTML_CONTENT, media_type="text/html")

@app.post("/webhook")
async def webhook_handler(request: Request):
    data = await request.json()
    # Process the update through the Telegram application
    async with application:
        update = Update.de_json(data, bot)
        await application.process_update(update)
    return {"status": "ok"}

# Initialize DB on startup
init_db()
