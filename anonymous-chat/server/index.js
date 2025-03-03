const express = require('express');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Статические файлы - фикс для Railway
const publicPath = path.join(__dirname, '../public');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath));

let waitingUsers = [];

app.get('/api/chat', (req, res) => {
    const userId = req.query.userId;
    
    // Проверка на валидность userId
    if (!userId) {
        return res.status(400).json({ error: 'Не указан userId' });
    }
    
    db.get('SELECT chat_id FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Ошибка при поиске пользователя:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!user || !user.chat_id) {
            // Если нет чата, ищем партнера
            return matchPartner(userId, res);
        }
        
        db.get('SELECT user1_id, user2_id FROM chats WHERE id = ?', [user.chat_id], (err, chat) => {
            if (err) {
                console.error('Ошибка при поиске чата:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            // Если чат не найден или поврежден, сбрасываем состояние пользователя
            if (!chat) {
                db.run('UPDATE users SET chat_id = NULL WHERE telegram_id = ?', [userId], (err) => {
                    if (err) console.error('Ошибка при сбросе chat_id:', err);
                    return matchPartner(userId, res);
                });
                return;
            }
            
            const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
            
            db.all('SELECT sender_id, message FROM messages WHERE chat_id = ? ORDER BY timestamp', 
                [user.chat_id], (err, messages) => {
                    if (err) {
                        console.error('Ошибка при получении сообщений:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    res.json({ partner: partnerId, messages: messages || [] });
                });
        });
    });
});

app.post('/api/send', (req, res) => {
    const { userId, message } = req.body;
    
    // Проверка входных данных
    if (!userId || !message) {
        return res.status(400).json({ error: 'Не указан userId или сообщение' });
    }
    
    db.get('SELECT chat_id FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Ошибка при поиске пользователя:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!user || !user.chat_id) {
            return res.status(400).json({ error: 'Чат не найден' });
        }
        
        // Проверяем, что чат существует
        db.get('SELECT id FROM chats WHERE id = ?', [user.chat_id], (err, chat) => {
            if (err || !chat) {
                if (err) console.error('Ошибка при проверке чата:', err);
                return res.status(400).json({ error: 'Чат не найден или завершен' });
            }
            
            db.run('INSERT INTO messages (chat_id, sender_id, message, timestamp) VALUES (?, ?, ?, ?)', 
                [user.chat_id, userId, message, Date.now()], (err) => {
                    if (err) {
                        console.error('Ошибка при сохранении сообщения:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    // Обновляем время активности пользователя
                    db.run('UPDATE users SET last_activity_time = ? WHERE telegram_id = ?', [Date.now(), userId]);
                    
                    res.status(200).json({ success: true });
                });
        });
    });
});

function matchPartner(userId, res) {
    console.log('Поиск партнера для:', userId);
    
    db.get('SELECT telegram_id FROM users WHERE chat_id IS NULL AND telegram_id != ? LIMIT 1', [userId], (err, partner) => {
        if (err) {
            console.error('Ошибка при поиске партнера:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!partner) {
            console.log('Партнер не найден, добавляем в список ожидания:', userId);
            
            // Добавляем или обновляем пользователя в БД
            db.run('INSERT OR REPLACE INTO users (telegram_id, chat_id, last_activity_time) VALUES (?, NULL, ?)', 
                [userId, Date.now()], (err) => {
                    if (err) console.error('Ошибка при добавлении пользователя:', err);
                });
                
            // Добавляем в список ожидания, если его там еще нет
            if (!waitingUsers.includes(userId)) {
                waitingUsers.push(userId);
            }
            
            return res.json({ partner: null, messages: [] });
        }
        
        console.log('Найден партнер:', partner.telegram_id);
        
        const chatId = uuidv4();
        console.log('Создаем чат:', chatId);
        
        // Создаем запись чата в базе
        db.run('INSERT INTO chats (id, user1_id, user2_id) VALUES (?, ?, ?)', 
            [chatId, userId, partner.telegram_id], (err) => {
                if (err) {
                    console.error('Ошибка при создании чата:', err);
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }
                
                // Обновляем записи пользователей с новым ID чата
                db.run('UPDATE users SET chat_id = ? WHERE telegram_id IN (?, ?)', 
                    [chatId, userId, partner.telegram_id], (err) => {
                        if (err) {
                            console.error('Ошибка при обновлении пользователей:', err);
                            return res.status(500).json({ error: 'Ошибка базы данных' });
                        }
                        
                        // Удаляем пользователей из списка ожидания
                        waitingUsers = waitingUsers.filter(id => id !== userId && id !== partner.telegram_id);
                        
                        res.json({ partner: partner.telegram_id, messages: [] });
                    });
            });
    });
}

// Обработка ошибок должна быть последней
app.use((err, req, res, next) => {
  console.error('Необработанная ошибка:', err);
  res.status(500).send('Внутренняя ошибка сервера');
});

app.listen(port, () => console.log(`Сервер запущен на порту ${port}`)); 