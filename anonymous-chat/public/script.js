const TelegramWebApp = window.Telegram.WebApp;
TelegramWebApp.ready();
const userId = TelegramWebApp.initDataUnsafe.user.id;

const messageList = document.getElementById('message-list');
const inputMessage = document.getElementById('input-message');
const partnerSpan = document.getElementById('partner');

function adjustHeight() {
    messageList.style.height = `${window.innerHeight - 100}px`; // 50px header + 50px input
}
window.addEventListener('resize', adjustHeight);
adjustHeight();

async function updateChat() {
    const response = await fetch(`/api/chat?userId=${userId}`);
    const data = await response.json();
    partnerSpan.textContent = data.partner ? `ID${data.partner.slice(0, 4)}` : 'Ищем...';
    messageList.innerHTML = data.messages.map(msg => `
        <div class="message ${msg.senderId === userId ? 'user' : 'partner'}">
            ${msg.message}
        </div>
    `).join('');
    messageList.scrollTop = messageList.scrollHeight;
}

async function sendMessage() {
    const message = inputMessage.value.trim();
    if (!message) return;
    await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, message })
    });
    inputMessage.value = '';
    updateChat();
}

setInterval(updateChat, 2000);
updateChat(); 