const express = require('express');
const db = require('./db');
const { nanoid } = require('nanoid');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('../public'));

let waitingUsers = [];

app.get('/api/chat', (req, res) => {
    const userId = req.query.userId;
    db.get('SELECT chat_id FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user || !user.chat_id) {
            // Если нет чата, ищем партнера
            matchPartner(userId, res);
        } else {
            db.get('SELECT user1_id, user2_id FROM chats WHERE id = ?', [user.chat_id], (err, chat) => {
                if (err) return res.status(500).send(err);
                const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
                db.all('SELECT sender_id, message FROM messages WHERE chat_id = ? ORDER BY timestamp', 
                    [user.chat_id], (err, messages) => {
                        if (err) return res.status(500).send(err);
                        res.json({ partner: partnerId, messages });
                    });
            });
        }
    });
});

app.post('/api/send', (req, res) => {
    const { userId, message } = req.body;
    db.get('SELECT chat_id FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err || !user || !user.chat_id) return res.status(400).send('Чат не найден');
        db.run('INSERT INTO messages (chat_id, sender_id, message, timestamp) VALUES (?, ?, ?, ?)', 
            [user.chat_id, userId, message, Date.now()], (err) => {
                if (err) return res.status(500).send(err);
                res.sendStatus(200);
            });
    });
});

function matchPartner(userId, res) {
    db.get('SELECT telegram_id FROM users WHERE chat_id IS NULL AND telegram_id != ?', [userId], (err, partner) => {
        if (err) return res.status(500).send(err);
        if (!partner) {
            db.run('INSERT OR REPLACE INTO users (telegram_id, last_activity_time) VALUES (?, ?)', 
                [userId, Date.now()]);
            waitingUsers.push(userId);
            return res.json({ partner: null, messages: [] });
        }
        const chatId = nanoid();
        db.run('INSERT INTO chats (id, user1_id, user2_id) VALUES (?, ?, ?)', [chatId, userId, partner.telegram_id]);
        db.run('UPDATE users SET chat_id = ? WHERE telegram_id IN (?, ?)', [chatId, userId, partner.telegram_id]);
        res.json({ partner: partner.telegram_id, messages: [] });
    });
}

app.listen(port, () => console.log(`Сервер запущен на порту ${port}`)); 