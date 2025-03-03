const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN; // Задайте в Railway
const webAppUrl = process.env.WEB_APP_URL;    // Задайте в Railway
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