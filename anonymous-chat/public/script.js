const TelegramWebApp = window.Telegram.WebApp;
TelegramWebApp.ready();
const userId = TelegramWebApp.initDataUnsafe.user.id;

const messageList = document.getElementById('message-list');
const inputMessage = document.getElementById('input-message');
const partnerSpan = document.getElementById('partner');

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

// Вызываем при изменении размера окна
window.addEventListener('resize', () => {
    setTimeout(adjustHeight, 100); // Небольшая задержка для iOS
});

// Обработка фокуса на поле ввода (появление клавиатуры)
inputMessage.addEventListener('focus', () => {
    // Задержка для появления клавиатуры
    setTimeout(() => {
        adjustHeight();
        messageList.scrollTop = messageList.scrollHeight; // Скролл вниз
    }, 300);
});

// Обработка потери фокуса (скрытие клавиатуры)
inputMessage.addEventListener('blur', () => {
    setTimeout(adjustHeight, 300);
});

// Инициализация высоты
adjustHeight();

async function updateChat() {
    try {
        const response = await fetch(`/api/chat?userId=${userId}`);
        const data = await response.json();
        
        if (data.error) {
            console.error('Ошибка API:', data.error);
            return;
        }
        
        partnerSpan.textContent = data.partner ? `ID${data.partner.slice(0, 4)}` : 'Ищем...';
        
        // Проверка, нужно ли прокручивать вниз
        const wasAtBottom = messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 10;
        
        // Добавление временных меток для отладки (можно удалить в продакшн)
        const timestamp = new Date().toLocaleTimeString();
        
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

// Добавляем обработчик клавиши Enter
inputMessage.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

// Обновление чата каждые 2 секунды
setInterval(updateChat, 2000);
updateChat(); 