const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('chat.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        nickname TEXT,
        chat_id TEXT,
        last_activity_time INTEGER
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        user1_id TEXT,
        user2_id TEXT,
        ended INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        sender_id TEXT,
        message TEXT,
        timestamp INTEGER
    )`);
});

module.exports = db; 