import os
import sqlite3
import json
import threading
import schedule
import time
from datetime import datetime
from fastapi import FastAPI, Response
from telegram import Update
from telegram.ext import Application, MessageHandler, filters, ContextTypes
import uvicorn

# --- 1. THE MINI APP (HTML) ---
HTML_CONTENT = """
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        body { font-family: sans-serif; text-align: center; background: #fff; padding: 20px; }
        .score { font-size: 50px; color: #2481cc; font-weight: bold; margin: 10px 0; }
        button { background: #2481cc; color: white; border: none; padding: 15px; width: 100%; border-radius: 10px; font-size: 18px; cursor: pointer; }
        .hall { margin-top: 20px; text-align: left; font-size: 14px; border-top: 1px solid #eee; padding-top: 10px; }
    </style>
</head>
<body>
    <h2 id="user">Player</h2>
    <div class="score" id="s">0</div>
    <button onclick="tap()">TAP TO WIN!</button>
    <button onclick="send()" style="background:#31a667; margin-top:10px;">SUBMIT DAILY SCORE</button>
    <div class="hall" id="hall">Loading Hall of Fame...</div>
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

# --- 2. SQL DATABASE LOGIC ---
DB_NAME = "leaderboard.db"

def init_db():
    with sqlite3.connect(DB_NAME) as conn:
        # Current daily scores
        conn.execute("CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY, name TEXT, high_score INTEGER)")
        # Permanent winners history
        conn.execute("CREATE TABLE IF NOT EXISTS hall_of_fame (date TEXT PRIMARY KEY, winner TEXT, score INTEGER)")

def archive_daily_winner():
    """The Midnight Reset Logic"""
    today = datetime.now().strftime("%Y-%m-%d")
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        # Find the top player of the day
        cursor.execute("SELECT name, high_score FROM scores ORDER BY high_score DESC LIMIT 1")
        winner = cursor.fetchone()
        
        if winner:
            # SQL: Move winner to Hall of Fame
            conn.execute("INSERT INTO hall_of_fame (date, winner, score) VALUES (?, ?, ?)", (today, winner[0], winner[1]))
            # SQL: Clear daily scores for a fresh start
            conn.execute("DELETE FROM scores")
            print(f"Hall of Fame updated: {winner[0]} won with {winner[1]}!")
        conn.commit()

# --- 3. THE BOT LOGIC ---
async def handle_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = json.loads(update.effective_message.web_app_data.data)
    user_id = update.effective_user.id
    name = data['name']
    score = data['score']

    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("INSERT INTO scores (id, name, high_score) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET high_score = MAX(high_score, EXCLUDED.high_score)", (user_id, name, score))
        cur = conn.execute("SELECT (SELECT COUNT(*) FROM scores WHERE high_score > ?) + 1", (score,))
        rank = cur.fetchone()[0]

    await update.message.reply_text(f"🏆 Score Recorded!\n{name}, you are currently Ranked #{rank} for today!")

# --- 4. THE WEB SERVER ---
app = FastAPI()

@app.get("/")
async def get_index():
    return Response(content=HTML_CONTENT, media_type="text/html")

# --- 5. BACKGROUND SCHEDULER ---
def run_scheduler():
    schedule.every().day.at("00:00").do(archive_daily_winner)
    while True:
        schedule.run_pending()
        time.sleep(60)

# --- 6. STARTUP ---
def run_bot():
    bot_app = Application.builder().token("YOUR_BOT_TOKEN").build()
    bot_app.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_data))
    bot_app.run_polling()

if __name__ == "__main__":
    init_db()
    # Install 'schedule' via: pip install schedule
    threading.Thread(target=run_scheduler, daemon=True).start()
    threading.Thread(target=run_bot, daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=8000)
