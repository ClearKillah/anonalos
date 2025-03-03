const TelegramWebApp = window.Telegram.WebApp;
TelegramWebApp.ready();

// Получаем ID пользователя из Telegram
let userId;
try {
    userId = TelegramWebApp.initDataUnsafe.user.id;
    console.log('Получен userId из Telegram:', userId);
    
    // Проверка на валидность userId
    if (!userId) {
        console.error('userId не определен из Telegram WebApp');
        // Используем временный ID для тестирования
        userId = 'test_user_' + Math.floor(Math.random() * 1000000);
        console.log('Создан временный userId для тестирования:', userId);
    }
} catch (error) {
    console.error('Ошибка при получении userId из Telegram:', error);
    // Используем временный ID для тестирования
    userId = 'test_user_' + Math.floor(Math.random() * 1000000);
    console.log('Создан временный userId для тестирования:', userId);
}

// Функция для принудительного полноэкранного режима
function forceFullscreen() {
    // Расширяем приложение на весь экран
    TelegramWebApp.expand();
    
    // Устанавливаем полноэкранный режим
    if (TelegramWebApp.isExpanded) {
        console.log('Приложение в полноэкранном режиме');
    } else {
        console.log('Не удалось развернуть приложение на весь экран');
    }
    
    // Принудительно устанавливаем высоту для контейнеров
    document.body.style.height = `${window.innerHeight}px`;
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.height = `${window.innerHeight}px`;
    });
    
    // Пересчитываем высоту списка сообщений
    if (currentScreen === 'chat') {
        adjustHeight();
    }
}

// Настраиваем цвета для соответствия теме Telegram
function updateTelegramTheme() {
    // Получаем цвета из Telegram WebApp
    document.documentElement.style.setProperty('--tg-theme-bg-color', TelegramWebApp.themeParams.bg_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-text-color', TelegramWebApp.themeParams.text_color || '#000000');
    document.documentElement.style.setProperty('--tg-theme-hint-color', TelegramWebApp.themeParams.hint_color || '#999999');
    document.documentElement.style.setProperty('--tg-theme-link-color', TelegramWebApp.themeParams.link_color || '#2481cc');
    document.documentElement.style.setProperty('--tg-theme-button-color', TelegramWebApp.themeParams.button_color || '#2481cc');
    document.documentElement.style.setProperty('--tg-theme-button-text-color', TelegramWebApp.themeParams.button_text_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', TelegramWebApp.themeParams.secondary_bg_color || '#f1f1f1');
}

// Вызываем функцию при загрузке и изменении темы
updateTelegramTheme();
TelegramWebApp.onEvent('themeChanged', updateTelegramTheme);

// Устанавливаем обработчик закрытия приложения
TelegramWebApp.onEvent('viewportChanged', () => {
    forceFullscreen();
    adjustHeight();
});

// DOM элементы
const nicknameScreen = document.getElementById('nickname-screen');
const nicknameInput = document.getElementById('nickname-input');
const nicknameSubmit = document.getElementById('nickname-submit');
const nicknameError = document.getElementById('nickname-error');

const searchScreen = document.getElementById('search-screen');
const randomChat = document.getElementById('random-chat');
const searchLoading = document.getElementById('search-loading');
const searchTimer = document.getElementById('search-timer');

const chatScreen = document.getElementById('chat-screen');
const partnerSpan = document.getElementById('partner');
const messageList = document.getElementById('message-list');
const inputMessage = document.getElementById('input-message');
const sendButton = document.getElementById('send-button');
const findUser = document.getElementById('find-user');
const endChat = document.getElementById('end-chat');

// Состояние приложения
let currentPartner = null;
let currentScreen = 'nickname'; // nickname, search, chat
let userNickname = null;
let isInChat = false;
let searchTimerId = null;
let searchStartTime = 0;

// Инициализация
async function init() {
    try {
        // Сразу разворачиваем на весь экран
        forceFullscreen();
        
        console.log('Инициализация приложения, userId:', userId);
        
        // Проверяем, что userId определен
        if (!userId) {
            console.error('userId не определен при инициализации');
            showScreen('nickname');
            return;
        }
        
        const response = await fetch(`/api/user?userId=${userId}`);
        
        // Проверяем статус ответа
        if (!response.ok) {
            console.error('Ошибка API при инициализации:', response.status, response.statusText);
            showScreen('nickname');
            return;
        }
        
        const data = await response.json();
        console.log('Получены данные пользователя:', data);
        
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
        // В случае ошибки показываем экран никнейма
        showScreen('nickname');
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
            // Сбрасываем UI поиска при переходе на экран поиска
            randomChat.classList.remove('hidden');
            searchLoading.classList.add('hidden');
            stopSearchTimer();
            break;
        case 'chat':
            chatScreen.classList.remove('hidden');
            adjustHeight(); // Настраиваем высоту чата
            break;
    }
    
    forceFullscreen(); // Обновляем полноэкранный режим
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

// Начать случайный чат
async function startRandomChat() {
    console.log('Функция startRandomChat вызвана');
    try {
        // Показываем индикатор загрузки и скрываем кнопку
        console.log('Показываем индикатор загрузки');
        randomChat.classList.add('hidden');
        searchLoading.classList.remove('hidden');
        
        // Запускаем таймер
        searchStartTime = Date.now();
        startSearchTimer();
        
        // Запрашиваем чат
        console.log('Отправляем запрос на поиск собеседника');
        
        // Функция для периодического опроса сервера
        const findPartner = async () => {
            const response = await fetch(`/api/chat?userId=${userId}`);
            const data = await response.json();
            
            console.log('Получен ответ от сервера:', data);
            
            // Проверяем ответ
            if (data.error) {
                console.error('Ошибка API:', data.error);
                alert(data.error);
                stopSearchTimer();
                randomChat.classList.remove('hidden');
                searchLoading.classList.add('hidden');
                return false;
            }
            
            // Если партнер найден
            if (data.partner) {
                // Останавливаем таймер
                stopSearchTimer();
                
                // Переходим в чат
                isInChat = true;
                showScreen('chat');
                updateChat();
                return true;
            }
            
            // Если партнер не найден, возвращаем false
            return false;
        };
        
        // Первая попытка найти партнера
        const found = await findPartner();
        
        // Если партнер не найден с первой попытки, запускаем периодический опрос
        if (!found) {
            console.log('Партнер не найден с первой попытки, запускаем периодический опрос');
            
            // Интервал для периодического опроса (каждые 3 секунды)
            const intervalId = setInterval(async () => {
                try {
                    const found = await findPartner();
                    
                    // Если партнер найден, останавливаем интервал
                    if (found) {
                        clearInterval(intervalId);
                    }
                    
                    // Если прошло больше 60 секунд, предлагаем пользователю остановить поиск
                    if (Date.now() - searchStartTime > 60000 && !found) {
                        if (confirm('Поиск занимает много времени. Хотите продолжить поиск?')) {
                            // Пользователь хочет продолжить, обновляем время начала
                            searchStartTime = Date.now();
                        } else {
                            // Пользователь хочет остановить поиск
                            clearInterval(intervalId);
                            stopSearchTimer();
                            randomChat.classList.remove('hidden');
                            searchLoading.classList.add('hidden');
                        }
                    }
                } catch (error) {
                    console.error('Ошибка при периодическом опросе:', error);
                }
            }, 3000);
        }
    } catch (error) {
        console.error('Ошибка при начале случайного чата:', error);
        alert('Не удалось начать случайный чат');
        
        // Восстанавливаем интерфейс
        stopSearchTimer();
        randomChat.classList.remove('hidden');
        searchLoading.classList.add('hidden');
    }
}

// Функция для запуска таймера поиска
function startSearchTimer() {
    // Сбрасываем таймер
    searchTimer.textContent = '0';
    
    // Запускаем интервал обновления
    searchTimerId = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - searchStartTime) / 1000);
        searchTimer.textContent = elapsedSeconds;
    }, 1000);
}

// Функция для остановки таймера поиска
function stopSearchTimer() {
    if (searchTimerId) {
        clearInterval(searchTimerId);
        searchTimerId = null;
    }
    
    // Сбрасываем UI
    randomChat.classList.remove('hidden');
    searchLoading.classList.add('hidden');
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

// Функция для форматирования времени
function formatTime(timestamp) {
    if (!timestamp) return '';
    
    try {
        // Проверяем, является ли timestamp строкой и пытаемся преобразовать в число
        const timestampNum = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
        
        // Проверка на валидную дату
        if (isNaN(timestampNum)) {
            console.error('Невалидный timestamp:', timestamp);
            return '';
        }
        
        const date = new Date(timestampNum);
        if (isNaN(date.getTime())) {
            console.error('Невалидная дата из timestamp:', timestamp);
            return '';
        }
        
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error('Ошибка форматирования времени:', error, timestamp);
        return '';
    }
}

// Функция для группировки сообщений по отправителю
function groupMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return [];
    }
    
    const groups = [];
    let currentGroup = null;
    
    messages.forEach(msg => {
        // Проверяем наличие необходимых полей
        if (!msg || !msg.sender_id) {
            console.error('Некорректное сообщение:', msg);
            return;
        }
        
        // Если нет текущей группы или отправитель изменился, создаем новую группу
        if (!currentGroup || currentGroup.sender_id !== msg.sender_id) {
            currentGroup = {
                sender_id: msg.sender_id,
                messages: []
            };
            groups.push(currentGroup);
        }
        
        // Добавляем сообщение в текущую группу
        currentGroup.messages.push(msg);
    });
    
    return groups;
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
        
        // Проверяем наличие сообщений
        if (!data.messages || !Array.isArray(data.messages)) {
            console.error('Неверный формат сообщений:', data.messages);
            data.messages = []; // Устанавливаем пустой массив, чтобы избежать ошибок
        }
        
        // Логируем полученные сообщения для отладки
        console.log('Полученные сообщения:', JSON.stringify(data.messages));
        
        // Группируем сообщения по отправителю
        const messageGroups = groupMessages(data.messages);
        
        // Создаем HTML для сообщений в стиле Telegram
        messageList.innerHTML = messageGroups.map(group => {
            const isUser = group.sender_id === userId;
            const groupClass = isUser ? 'items-end' : 'items-start';
            
            return `
                <div class="flex flex-col ${groupClass} mb-4 w-full">
                    ${group.messages.map((msg, index) => {
                        // Безопасно получаем текст сообщения
                        const messageText = msg.message || '';
                        
                        // Безопасно форматируем время
                        const time = formatTime(msg.timestamp);
                        
                        // Показываем время только для последнего сообщения в группе
                        const showTime = index === group.messages.length - 1;
                        
                        // Стили для сообщений
                        const messageBg = isUser ? 'bg-tg-button text-white' : 'bg-white border border-gray-200';
                        const messageRadius = isUser ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md';
                        
                        return `
                            <div class="max-w-[80%] mb-1">
                                <div class="${messageBg} ${messageRadius} px-3 py-2 shadow-sm">
                                    <div>${messageText}</div>
                                    ${showTime && time ? `<div class="text-xs opacity-70 text-right mt-1">${time}</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }).join('');
        
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

// Добавляем обработчик с выводом в консоль для отладки
randomChat.addEventListener('click', function() {
    console.log('Кнопка "Найти собеседника" нажата');
    startRandomChat();
});

findUser.addEventListener('click', () => {
    console.log('Кнопка "Новый чат" нажата');
    showScreen('search');
});

endChat.addEventListener('click', function() {
    console.log('Кнопка "Выход" нажата');
    endCurrentChat();
});

sendButton.addEventListener('click', sendMessage);
inputMessage.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

// Дополнительные обработчики событий для полноэкранного режима
window.addEventListener('load', () => {
    init();
    forceFullscreen();
});
window.addEventListener('resize', forceFullscreen);
window.addEventListener('orientationchange', forceFullscreen);

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