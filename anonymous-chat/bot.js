const TelegramBot = require('node-telegram-bot-api');
// Непосредственно указываем значения для теста
const token = '8039344227:AAEDCP_902a3r52JIdM9REqUyPx-p2IVtxA'; // Telegram Bot Token
const webAppUrl = 'https://anonalos-production.up.railway.app/'; // Railway URL
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Начать анонимный чат', {
        reply_markup: {
            inline_keyboard: [[
                { text: 'Открыть чат', web_app: { url: webAppUrl } }
            ]]
        }
    });
});

console.log('Бот запущен'); 