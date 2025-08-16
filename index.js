const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const owners = ['1079022798523093032', '879476597927837816'];
const allowedChannels = ['1406085179617054802','1404168132054093956','1404169419353227335'];
const emojis = ['👍', '❤️', '😂', '😮', '🔥'];

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (owners.includes(message.author.id) && allowedChannels.includes(message.channel.id)) {
        for (const emoji of emojis) {
            await message.react(emoji).catch(console.error);
        }
    }
});

// استبدل بالمتغير البيئي
client.login(process.env.DISCORD_TOKEN);