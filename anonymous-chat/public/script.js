const TelegramWebApp = window.Telegram.WebApp;
TelegramWebApp.ready();
const userId = TelegramWebApp.initDataUnsafe.user.id;

// Расширяем приложение на весь экран
TelegramWebApp.expand();

// Настраиваем цвета для соответствия теме Telegram
document.documentElement.style.setProperty('--bg-color', TelegramWebApp.themeParams.bg_color);
document.documentElement.style.setProperty('--text-color', TelegramWebApp.themeParams.text_color);
document.documentElement.style.setProperty('--hint-color', TelegramWebApp.themeParams.hint_color);
document.documentElement.style.setProperty('--link-color', TelegramWebApp.themeParams.link_color);
document.documentElement.style.setProperty('--button-color', TelegramWebApp.themeParams.button_color || '#2481cc');
document.documentElement.style.setProperty('--button-text-color', TelegramWebApp.themeParams.button_text_color || '#ffffff');

// Устанавливаем обработчик закрытия приложения
TelegramWebApp.onEvent('viewportChanged', adjustHeight);
TelegramWebApp.onEvent('themeChanged', () => {
    // Обновляем цвета при изменении темы
    document.documentElement.style.setProperty('--bg-color', TelegramWebApp.themeParams.bg_color);
    document.documentElement.style.setProperty('--text-color', TelegramWebApp.themeParams.text_color);
    document.documentElement.style.setProperty('--hint-color', TelegramWebApp.themeParams.hint_color);
    document.documentElement.style.setProperty('--link-color', TelegramWebApp.themeParams.link_color);
    document.documentElement.style.setProperty('--button-color', TelegramWebApp.themeParams.button_color || '#2481cc');
    document.documentElement.style.setProperty('--button-text-color', TelegramWebApp.themeParams.button_text_color || '#ffffff');
});

// Отключаем прокрутку родительского окна
TelegramWebApp.enableClosingConfirmation();

// DOM элементы
const nicknameScreen = document.getElementById('nickname-screen');
const searchScreen = document.getElementById('search-screen');
const chatScreen = document.getElementById('chat-screen');

const nicknameInput = document.getElementById('nickname-input');
const nicknameSubmit = document.getElementById('nickname-submit');
const nicknameError = document.getElementById('nickname-error');

const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
const backToChat = document.getElementById('back-to-chat');
const randomChat = document.getElementById('random-chat');

const findUser = document.getElementById('find-user');
const endChat = document.getElementById('end-chat');
const messageList = document.getElementById('message-list');
const inputMessage = document.getElementById('input-message');
const sendButton = document.getElementById('send-button');
const partnerSpan = document.getElementById('partner');

// Состояние приложения
let currentPartner = null;
let currentScreen = 'nickname'; // nickname, search, chat
let userNickname = null;
let isInChat = false;

// Инициализация
async function init() {
    try {
        const response = await fetch(`/api/user?userId=${userId}`);
        const data = await response.json();
        
        if (data.hasNickname) {
            userNickname = data.nickname;
            
            // Если пользователь в чате, сразу переходим в чат
            if (data.inChat) {
                isInChat = true;
                showScreen('chat');
                updateChat();
            } else {
                // Иначе показываем экран поиска
                showScreen('search');
            }
        } else {
            // Если у пользователя нет никнейма, показываем экран регистрации
            showScreen('nickname');
        }
    } catch (error) {
        console.error('Ошибка инициализации:', error);
    }
}

// Управление экранами
function showScreen(screen) {
    currentScreen = screen;
    
    nicknameScreen.classList.add('hidden');
    searchScreen.classList.add('hidden');
    chatScreen.classList.add('hidden');
    
    switch (screen) {
        case 'nickname':
            nicknameScreen.classList.remove('hidden');
            break;
        case 'search':
            searchScreen.classList.remove('hidden');
            break;
        case 'chat':
            chatScreen.classList.remove('hidden');
            adjustHeight(); // Настраиваем высоту чата
            break;
    }
}

// Отправка и сохранение никнейма
async function saveNickname() {
    const nickname = nicknameInput.value.trim();
    
    if (!nickname) {
        nicknameError.textContent = 'Никнейм не может быть пустым';
        return;
    }
    
    if (nickname.length < 3) {
        nicknameError.textContent = 'Никнейм должен содержать не менее 3 символов';
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, nickname })
        });
        
        const data = await response.json();
        
        if (data.error) {
            nicknameError.textContent = data.error;
            return;
        }
        
        userNickname = nickname;
        showScreen('search');
        
    } catch (error) {
        console.error('Ошибка сохранения никнейма:', error);
        nicknameError.textContent = 'Ошибка при сохранении никнейма';
    }
}

// Поиск пользователей по никнейму
async function searchUsers() {
    const query = searchInput.value.trim();
    
    if (!query) {
        searchResults.innerHTML = '<div class="no-results">Введите никнейм для поиска</div>';
        return;
    }
    
    try {
        const response = await fetch(`/api/users/search?query=${encodeURIComponent(query)}&userId=${userId}`);
        const data = await response.json();
        
        if (data.error) {
            searchResults.innerHTML = `<div class="error">${data.error}</div>`;
            return;
        }
        
        if (!data.users || data.users.length === 0) {
            searchResults.innerHTML = '<div class="no-results">Пользователи не найдены</div>';
            return;
        }
        
        // Отображаем результаты
        searchResults.innerHTML = data.users.map(user => `
            <div class="user-result">
                <div class="nickname">${user.nickname}</div>
                <button class="start-chat" data-id="${user.telegram_id}">Начать чат</button>
            </div>
        `).join('');
        
        // Добавляем обработчики для кнопок
        document.querySelectorAll('.start-chat').forEach(button => {
            button.addEventListener('click', () => startChatWithUser(button.dataset.id));
        });
        
    } catch (error) {
        console.error('Ошибка поиска пользователей:', error);
        searchResults.innerHTML = '<div class="error">Ошибка при поиске пользователей</div>';
    }
}

// Начать чат с конкретным пользователем
async function startChatWithUser(partnerId) {
    try {
        const response = await fetch('/api/chat/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, partnerId })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        isInChat = true;
        showScreen('chat');
        updateChat();
        
    } catch (error) {
        console.error('Ошибка при начале чата:', error);
        alert('Не удалось начать чат');
    }
}

// Начать случайный чат
async function startRandomChat() {
    try {
        await fetch(`/api/chat?userId=${userId}`);
        isInChat = true;
        showScreen('chat');
        updateChat();
    } catch (error) {
        console.error('Ошибка при начале случайного чата:', error);
        alert('Не удалось начать случайный чат');
    }
}

// Завершить текущий чат
async function endCurrentChat() {
    if (!isInChat) return;
    
    try {
        const response = await fetch('/api/chat/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(data.error);
            return;
        }
        
        isInChat = false;
        currentPartner = null;
        messageList.innerHTML = '';
        showScreen('search');
        
    } catch (error) {
        console.error('Ошибка при завершении чата:', error);
        alert('Не удалось завершить чат');
    }
}

// Улучшенная функция регулировки высоты
function adjustHeight() {
    const headerHeight = 70; // Высота заголовка с учетом padding
    const inputHeight = 70; // Высота поля ввода с учетом padding
    
    // Сохраняем положение скролла
    const scrollPosition = messageList.scrollTop;
    const wasAtBottom = scrollPosition + messageList.clientHeight >= messageList.scrollHeight - 10;
    
    // Вычисляем доступную высоту и применяем
    const availableHeight = window.innerHeight - headerHeight - inputHeight;
    messageList.style.height = `${availableHeight}px`;
    
    // Восстанавливаем положение скролла
    if (wasAtBottom) {
        messageList.scrollTop = messageList.scrollHeight;
    } else {
        messageList.scrollTop = scrollPosition;
    }
}

// Обновление чата
async function updateChat() {
    if (currentScreen !== 'chat') return;
    
    try {
        const response = await fetch(`/api/chat?userId=${userId}`);
        const data = await response.json();
        
        if (data.error) {
            console.error('Ошибка API:', data.error);
            return;
        }
        
        // Если нужно ввести никнейм, переходим на соответствующий экран
        if (data.needNickname) {
            showScreen('nickname');
            return;
        }
        
        // Если нет партнера, показываем "Ищем..."
        if (!data.partner) {
            partnerSpan.textContent = 'Ищем...';
            messageList.innerHTML = '';
            return;
        }
        
        // Обновляем информацию о партнере
        currentPartner = data.partner;
        partnerSpan.textContent = data.partnerNickname || 'Unknown';
        
        // Проверка, нужно ли прокручивать вниз
        const wasAtBottom = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 10;
        
        // Обновляем сообщения
        messageList.innerHTML = data.messages.map(msg => `
            <div class="message ${msg.sender_id === userId ? 'user' : 'partner'}">
                ${msg.message}
            </div>
        `).join('');
        
        // Прокручиваем вниз только если пользователь уже был внизу
        if (wasAtBottom) {
            messageList.scrollTop = messageList.scrollHeight;
        }
    } catch (error) {
        console.error('Ошибка обновления чата:', error);
    }
}

// Отправка сообщения
async function sendMessage() {
    const message = inputMessage.value.trim();
    if (!message) return;
    
    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, message })
        });
        
        const result = await response.json();
        if (result.error) {
            console.error('Ошибка отправки:', result.error);
            return;
        }
        
        inputMessage.value = '';
        await updateChat();
        messageList.scrollTop = messageList.scrollHeight; // Прокрутка вниз после отправки
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
    }
}

// Обработчики событий
nicknameSubmit.addEventListener('click', saveNickname);
nicknameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        saveNickname();
    }
});

searchInput.addEventListener('input', () => {
    if (searchInput.value.trim().length >= 2) {
        searchUsers();
    }
});

backToChat.addEventListener('click', () => {
    if (isInChat) {
        showScreen('chat');
    }
});

randomChat.addEventListener('click', startRandomChat);
findUser.addEventListener('click', () => showScreen('search'));
endChat.addEventListener('click', endCurrentChat);

sendButton.addEventListener('click', sendMessage);
inputMessage.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

// Обработка изменения размера окна
window.addEventListener('resize', () => {
    setTimeout(adjustHeight, 100);
});

// Обработка фокуса на поле ввода (появление клавиатуры)
inputMessage.addEventListener('focus', () => {
    setTimeout(() => {
        adjustHeight();
        messageList.scrollTop = messageList.scrollHeight;
    }, 300);
});

// Обработка потери фокуса (скрытие клавиатуры)
inputMessage.addEventListener('blur', () => {
    setTimeout(adjustHeight, 300);
});

// Интервал обновления чата
setInterval(() => {
    if (currentScreen === 'chat') {
        updateChat();
    }
}, 2000);

// Запуск приложения
init(); 