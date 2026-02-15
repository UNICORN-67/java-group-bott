# 🛡️ Anti-Barrier Ultimate Bot & Mini App

Ek advanced Telegram Mini App aur Bot jo Next.js aur Vercel KV (Redis) ka use karke aapke group ko raiders, copyright content, aur admin abuse se bachata hai.

## ✨ Features

* **🔒 Strict Barrier (Join Requests):** Koi bhi member bina Bot ki permission ke join nahi kar sakta. Bot user ki safety check karta hai.
* **🕵️ Admin Watchtower:** Admins ki har activity par nazar rakhta hai. Sirf Owner ko pata hota hai ki kaunsa admin kis user ko la raha hai.
* **🚫 Anti-Copyright & Media:** Movie files, unsafe links, aur copyright content ko automatically delete karta hai.
* **👑 Owner-Only Dashboard:** Ek Next.js Mini App jahan se sirf aap (Owner) settings control kar sakte hain aur logs dekh sakte hain.
* **⚡ Serverless:** Vercel par hosting ke liye optimize kiya gaya hai.

## 🛠️ Tech Stack

- **Framework:** Next.js (App Router) 
- **Database:** Vercel KV (Redis)
- **Bot Engine:** Telegram Bot API (Webhooks)
- **Styling:** Tailwind CSS / CSS Modules

## 🚀 Setup Instructions

### 1. Environment Variables
Vercel dashboard par ye keys set karein:
- `BOT_TOKEN`: BotFather se mila hua token.
- `OWNER_ID`: Aapki numerical Telegram ID.
- `KV_URL`: Vercel KV dashboard se.
- `KV_REST_API_TOKEN`: Vercel KV dashboard se.

### 2. Webhook Setup
Deployment ke baad, niche diye gaye URL ko apne browser mein paste karein (values change karke):
`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-domain.vercel.app/api/webhook`

### 3. Bot Permissions
Bot ko apne Telegram group mein **Admin** banayein aur ye permissions dein:
- Delete Messages
- Ban Users
- Invite Users via Link (Approve Join Requests ke liye)

## 📁 Project Structure
- `/app/api/webhook`: Bot ki main logic (Anti-Link, Anti-Copyright, Join Requests).
- `/app/api/settings`: Redis mein settings update karne ke liye.
- `/app/page.tsx`: Owner-Only Mini App Dashboard.
