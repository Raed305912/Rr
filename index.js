import { Client, GatewayIntentBits } from 'discord.js';

// إنشاء البوت مع النوايا المطلوبة
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// آي دي الأشخاص المسموح لهم
const owners = ['1079022798523093032', '879476597927837816'];

// آي دي القنوات المسموح فيها
const allowedChannels = ['1406085179617054802','1404168132054093956','1404164181866975242','1404166379061510354','1404169419353227335'];

// الإيموجيات اللي البوت يضيفها
const emojis = ['👍', '❤️', '😂', '😮', '🔥'];

client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // تجاهل رسائل البوت نفسه
    if (owners.includes(message.author.id) && allowedChannels.includes(message.channel.id)) {
        for (const emoji of emojis) {
            await message.react(emoji).catch(console.error);
        }
    }
});

// التحقق من وجود توكن البوت
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ Error: DISCORD_TOKEN not found!');
    process.exit(1);
}

// تسجيل الدخول
client.login(process.env.DISCORD_TOKEN);