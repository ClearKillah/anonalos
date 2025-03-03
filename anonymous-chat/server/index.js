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

// Глобальный массив для хранения пользователей в ожидании
let waitingUsers = [];

// Очистка неактивных пользователей из списка ожидания каждые 5 минут
setInterval(() => {
    console.log('Очистка неактивных пользователей из списка ожидания');
    console.log('Список ожидания до очистки:', waitingUsers);
    
    // Получаем всех пользователей, которые уже в чате
    db.all('SELECT telegram_id FROM users WHERE chat_id IS NOT NULL', [], (err, users) => {
        if (err) {
            console.error('Ошибка при получении пользователей в чате:', err);
            return;
        }
        
        // Создаем массив ID пользователей в чате
        const usersInChat = users.map(user => user.telegram_id);
        
        // Удаляем из списка ожидания пользователей, которые уже в чате
        waitingUsers = waitingUsers.filter(id => !usersInChat.includes(id));
        
        console.log('Список ожидания после очистки:', waitingUsers);
    });
}, 5 * 60 * 1000);

// Проверка и регистрация никнейма
app.post('/api/register', (req, res) => {
    const { userId, nickname } = req.body;
    
    if (!userId || !nickname) {
        return res.status(400).json({ error: 'Не указан userId или nickname' });
    }
    
    // Проверяем, что никнейм не занят
    db.get('SELECT * FROM users WHERE nickname = ? AND telegram_id != ?', [nickname, userId], (err, user) => {
        if (err) {
            console.error('Ошибка при проверке никнейма:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (user) {
            return res.status(400).json({ error: 'Этот никнейм уже занят' });
        }
        
        // Обновляем или добавляем пользователя с никнеймом
        db.run('INSERT OR REPLACE INTO users (telegram_id, nickname, last_activity_time) VALUES (?, ?, ?)', 
            [userId, nickname, Date.now()], (err) => {
                if (err) {
                    console.error('Ошибка при сохранении никнейма:', err);
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }
                
                res.json({ success: true, nickname });
            });
    });
});

// Получить информацию о пользователе
app.get('/api/user', (req, res) => {
    const userId = req.query.userId;
    
    if (!userId) {
        return res.status(400).json({ error: 'Не указан userId' });
    }
    
    // Проверяем, существует ли пользователь, если нет - создаем
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Ошибка при получении информации о пользователе:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!user) {
            // Создаем нового пользователя
            db.run('INSERT INTO users (telegram_id, last_activity_time) VALUES (?, ?)', 
                [userId, Date.now()], (err) => {
                    if (err) {
                        console.error('Ошибка при создании пользователя:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    // Возвращаем информацию о новом пользователе
                    res.json({ 
                        hasNickname: false,
                        nickname: null,
                        inChat: false
                    });
                });
            return;
        }
        
        res.json({ 
            hasNickname: !!user.nickname,
            nickname: user.nickname || null,
            inChat: !!user.chat_id
        });
    });
});

// Поиск пользователей по никнейму
app.get('/api/users/search', (req, res) => {
    const { query, userId } = req.query;
    
    if (!query || !userId) {
        return res.status(400).json({ error: 'Не указан запрос или userId' });
    }
    
    // Ищем пользователей с похожим никнеймом, исключая текущего пользователя
    db.all('SELECT telegram_id, nickname FROM users WHERE nickname LIKE ? AND telegram_id != ? LIMIT 10', 
        [`%${query}%`, userId], (err, users) => {
            if (err) {
                console.error('Ошибка при поиске пользователей:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            res.json({ users: users || [] });
        });
});

// Начать чат с конкретным пользователем
app.post('/api/chat/start', (req, res) => {
    const { userId, partnerId } = req.body;
    
    if (!userId || !partnerId) {
        return res.status(400).json({ error: 'Не указан userId или partnerId' });
    }
    
    // Проверяем, что оба пользователя не находятся в чатах
    db.get('SELECT chat_id FROM users WHERE telegram_id IN (?, ?) AND chat_id IS NOT NULL', 
        [userId, partnerId], (err, user) => {
            if (err) {
                console.error('Ошибка при проверке статуса пользователей:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            if (user) {
                return res.status(400).json({ error: 'Один из пользователей уже находится в чате' });
            }
            
            const chatId = uuidv4();
            
            // Создаем чат
            db.run('INSERT INTO chats (id, user1_id, user2_id) VALUES (?, ?, ?)', 
                [chatId, userId, partnerId], (err) => {
                    if (err) {
                        console.error('Ошибка при создании чата:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    // Обновляем статусы пользователей
                    db.run('UPDATE users SET chat_id = ? WHERE telegram_id IN (?, ?)',
                        [chatId, userId, partnerId], (err) => {
                            if (err) {
                                console.error('Ошибка при обновлении статусов:', err);
                                return res.status(500).json({ error: 'Ошибка базы данных' });
                            }
                            
                            res.json({ success: true, chatId });
                        });
                });
        });
});

app.get('/api/chat', (req, res) => {
    const userId = req.query.userId;
    
    // Проверка на валидность userId
    if (!userId) {
        return res.status(400).json({ error: 'Не указан userId' });
    }
    
    db.get('SELECT chat_id, nickname FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Ошибка при поиске пользователя:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!user) {
            return res.status(400).json({ error: 'Пользователь не найден' });
        }
        
        // Если никнейм не задан, возвращаем статус
        if (!user.nickname) {
            return res.json({ needNickname: true });
        }
        
        if (!user.chat_id) {
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
                console.log('Чат не найден, сбрасываем chat_id для пользователя:', userId);
                db.run('UPDATE users SET chat_id = NULL WHERE telegram_id = ?', [userId], (err) => {
                    if (err) console.error('Ошибка при сбросе chat_id:', err);
                    return matchPartner(userId, res);
                });
                return;
            }
            
            // Проверяем, что оба ID пользователей существуют
            if (!chat.user1_id || !chat.user2_id) {
                console.error('Поврежденные данные чата:', chat);
                db.run('UPDATE users SET chat_id = NULL WHERE telegram_id = ?', [userId], (err) => {
                    if (err) console.error('Ошибка при сбросе chat_id:', err);
                    return matchPartner(userId, res);
                });
                return;
            }
            
            const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
            
            // Получаем никнейм партнера
            db.get('SELECT nickname FROM users WHERE telegram_id = ?', [partnerId], (err, partner) => {
                if (err) {
                    console.error('Ошибка при получении никнейма партнера:', err);
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }
                
                db.all('SELECT sender_id, message, timestamp FROM messages WHERE chat_id = ? ORDER BY timestamp', 
                    [user.chat_id], (err, messages) => {
                        if (err) {
                            console.error('Ошибка при получении сообщений:', err);
                            return res.status(500).json({ error: 'Ошибка базы данных' });
                        }
                        
                        // Убедимся, что у всех сообщений есть timestamp и другие необходимые поля
                        const processedMessages = (messages || []).map(msg => {
                            const result = {
                                sender_id: msg.sender_id || userId,
                                message: msg.message || '',
                                timestamp: msg.timestamp || Date.now()
                            };
                            return result;
                        });
                        
                        res.json({ 
                            partner: partnerId, 
                            partnerNickname: partner ? partner.nickname : 'Unknown', 
                            messages: processedMessages
                        });
                    });
            });
        });
    });
});

// Отправка сообщения
app.post('/api/message', (req, res) => {
    const { userId, message, timestamp } = req.body;
    
    if (!userId || !message) {
        return res.status(400).json({ error: 'Не указан userId или message' });
    }
    
    // Получаем информацию о чате пользователя
    db.get('SELECT chat_id FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Ошибка при получении информации о пользователе:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!user || !user.chat_id) {
            console.error('Пользователь не в чате:', userId);
            return res.status(400).json({ error: 'Вы не находитесь в чате' });
        }
        
        // Добавляем сообщение в базу данных
        const currentTime = timestamp || Date.now();
        db.run('INSERT INTO messages (chat_id, sender_id, message, timestamp) VALUES (?, ?, ?, ?)', 
            [user.chat_id, userId, message, currentTime], (err) => {
                if (err) {
                    console.error('Ошибка при сохранении сообщения:', err);
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }
                
                res.json({ success: true, timestamp: currentTime });
            });
    });
});

// Завершить чат
app.post('/api/chat/end', (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ error: 'Не указан userId' });
    }
    
    db.get('SELECT chat_id FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Ошибка при поиске пользователя:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!user || !user.chat_id) {
            return res.status(400).json({ error: 'Чат не найден' });
        }
        
        // Получаем партнера
        db.get('SELECT user1_id, user2_id FROM chats WHERE id = ?', [user.chat_id], (err, chat) => {
            if (err || !chat) {
                if (err) console.error('Ошибка при получении чата:', err);
                
                // В любом случае сбрасываем chat_id пользователя
                db.run('UPDATE users SET chat_id = NULL WHERE telegram_id = ?', [userId]);
                return res.json({ success: true });
            }
            
            const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
            
            // Помечаем чат как завершенный и сбрасываем chat_id у обоих пользователей
            db.run('UPDATE chats SET ended = 1 WHERE id = ?', [user.chat_id], (err) => {
                if (err) console.error('Ошибка при завершении чата:', err);
                
                db.run('UPDATE users SET chat_id = NULL WHERE telegram_id IN (?, ?)', 
                    [userId, partnerId], (err) => {
                        if (err) console.error('Ошибка при обновлении пользователей:', err);
                        
                        res.json({ success: true });
                    });
            });
        });
    });
});

function matchPartner(userId, res) {
    console.log('Поиск партнера для:', userId);
    console.log('Текущий список ожидания:', waitingUsers);
    
    // Проверяем, что userId валидный
    if (!userId) {
        console.error('Невалидный userId при поиске партнера');
        return res.status(400).json({ error: 'Невалидный userId' });
    }
    
    // Проверяем, существует ли пользователь, если нет - создаем
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, user) => {
        if (err) {
            console.error('Ошибка при проверке пользователя:', err);
            return res.status(500).json({ error: 'Ошибка базы данных' });
        }
        
        if (!user) {
            // Создаем нового пользователя
            db.run('INSERT INTO users (telegram_id, last_activity_time) VALUES (?, ?)', 
                [userId, Date.now()], (err) => {
                    if (err) {
                        console.error('Ошибка при создании пользователя:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    // Рекурсивно вызываем matchPartner после создания пользователя
                    matchPartner(userId, res);
                });
            return;
        }
        
        // Обновляем время активности пользователя
        db.run('UPDATE users SET last_activity_time = ? WHERE telegram_id = ?', 
            [Date.now(), userId], (err) => {
                if (err) console.error('Ошибка при обновлении времени активности:', err);
            });
        
        // Проверяем, не находится ли пользователь уже в чате
        if (user.chat_id) {
            console.log('Пользователь уже в чате:', userId);
            // Получаем информацию о чате
            db.get('SELECT user1_id, user2_id FROM chats WHERE id = ?', [user.chat_id], (err, chat) => {
                if (err || !chat) {
                    console.error('Ошибка при получении информации о чате:', err);
                    // Сбрасываем chat_id и ищем нового партнера
                    db.run('UPDATE users SET chat_id = NULL WHERE telegram_id = ?', [userId], (err) => {
                        if (err) console.error('Ошибка при сбросе chat_id:', err);
                        // Рекурсивно вызываем matchPartner после сброса
                        matchPartner(userId, res);
                    });
                    return;
                }
                
                // Определяем ID партнера
                const partnerId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
                
                // Получаем никнейм партнера
                db.get('SELECT nickname FROM users WHERE telegram_id = ?', [partnerId], (err, partner) => {
                    if (err) {
                        console.error('Ошибка при получении никнейма партнера:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    // Получаем сообщения
                    db.all('SELECT sender_id, message, timestamp FROM messages WHERE chat_id = ? ORDER BY timestamp', 
                        [user.chat_id], (err, messages) => {
                            if (err) {
                                console.error('Ошибка при получении сообщений:', err);
                                return res.status(500).json({ error: 'Ошибка базы данных' });
                            }
                            
                            res.json({
                                partner: partnerId,
                                partnerNickname: partner ? partner.nickname : 'Аноним',
                                messages: messages || []
                            });
                        });
                });
            });
            return;
        }
        
        // Сначала проверяем, есть ли пользователи в списке ожидания
        if (waitingUsers.length > 0) {
            // Фильтруем список, исключая текущего пользователя
            const availableUsers = waitingUsers.filter(id => id !== userId);
            
            if (availableUsers.length > 0) {
                // Берем случайного пользователя из списка ожидания
                const randomIndex = Math.floor(Math.random() * availableUsers.length);
                const partnerId = availableUsers[randomIndex];
                
                console.log('Найден партнер из списка ожидания:', partnerId);
                
                // Удаляем обоих пользователей из списка ожидания
                waitingUsers = waitingUsers.filter(id => id !== userId && id !== partnerId);
                
                // Создаем чат
                createChat(userId, partnerId, res);
                return;
            }
        }
        
        // Если в списке ожидания никого нет, ищем в базе данных
        db.get('SELECT telegram_id FROM users WHERE chat_id IS NULL AND telegram_id != ? LIMIT 1', 
            [userId], (err, partner) => {
                if (err) {
                    console.error('Ошибка при поиске партнера:', err);
                    return res.status(500).json({ error: 'Ошибка базы данных' });
                }
                
                if (!partner) {
                    console.log('Партнер не найден, добавляем в список ожидания:', userId);
                    
                    // Добавляем или обновляем пользователя в БД
                    db.run('UPDATE users SET chat_id = NULL WHERE telegram_id = ?', 
                        [userId], (err) => {
                            if (err) console.error('Ошибка при обновлении пользователя:', err);
                        });
                        
                    // Добавляем в список ожидания, если его там еще нет
                    if (!waitingUsers.includes(userId)) {
                        waitingUsers.push(userId);
                        console.log('Текущий список ожидания после добавления:', waitingUsers);
                    }
                    
                    return res.json({ partner: null, messages: [] });
                }
                
                console.log('Найден партнер из БД:', partner.telegram_id);
                
                // Удаляем обоих пользователей из списка ожидания
                waitingUsers = waitingUsers.filter(id => id !== userId && id !== partner.telegram_id);
                
                // Создаем чат
                createChat(userId, partner.telegram_id, res);
            });
    });
}

// Вспомогательная функция для создания чата
function createChat(userId, partnerId, res) {
    const chatId = uuidv4();
    console.log('Создаем чат:', chatId, 'между', userId, 'и', partnerId);
    
    // Создаем запись чата в базе
    db.run('INSERT INTO chats (id, user1_id, user2_id) VALUES (?, ?, ?)', 
        [chatId, userId, partnerId], (err) => {
            if (err) {
                console.error('Ошибка при создании чата:', err);
                return res.status(500).json({ error: 'Ошибка базы данных' });
            }
            
            // Обновляем записи пользователей с новым ID чата
            db.run('UPDATE users SET chat_id = ? WHERE telegram_id IN (?, ?)', 
                [chatId, userId, partnerId], (err) => {
                    if (err) {
                        console.error('Ошибка при обновлении пользователей:', err);
                        return res.status(500).json({ error: 'Ошибка базы данных' });
                    }
                    
                    // Удаляем пользователей из списка ожидания
                    waitingUsers = waitingUsers.filter(id => id !== userId && id !== partnerId);
                    
                    // Получаем никнейм партнера
                    db.get('SELECT nickname FROM users WHERE telegram_id = ?', [partnerId], (err, partnerInfo) => {
                        if (err) {
                            console.error('Ошибка при получении никнейма партнера:', err);
                            return res.status(500).json({ error: 'Ошибка базы данных' });
                        }
                        
                        res.json({ 
                            partner: partnerId, 
                            partnerNickname: partnerInfo ? partnerInfo.nickname : 'Unknown',
                            messages: [] 
                        });
                    });
                });
        });
}

// Обработка ошибок должна быть последней
app.use((err, req, res, next) => {
    console.error('Необработанная ошибка:', err);
    res.status(500).send('Внутренняя ошибка сервера');
});

// Обработка 404 ошибок
app.use((req, res) => {
    res.status(404).json({ error: 'Запрашиваемый ресурс не найден' });
});

app.listen(port, () => console.log(`Сервер запущен на порту ${port}`)); 