import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import 'dotenv/config';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// تخزين الرسائل المحددة
const selectedMessages = new Map(); // key: guildId, value: array of message IDs

// تسجيل الـ Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('thd')
    .setDescription('تحديد رسالة باستخدام المنشن')
    .addUserOption(option => option.setName('user').setDescription('العضو الذي تريد تحديد رسالته').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  
  new SlashCommandBuilder()
    .setName('thd1')
    .setDescription('تحديد عدد من الرسائل')
    .addIntegerOption(option => option.setName('count').setDescription('عدد الرسائل لتحديدها').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('clean')
    .setDescription('حذف الرسائل المحددة مسبقًا')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('cleanedall')
    .setDescription('حذف كل الرسائل في القناة')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⚡️ Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;

  if (interaction.commandName === 'thd') {
    const user = interaction.options.getUser('user');
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const msg = messages.find(m => m.author.id === user.id);
    if (!msg) return interaction.reply({ content: '❌ ما تم العثور على رسالة لهذا العضو', ephemeral: true });
    
    if (!selectedMessages.has(guildId)) selectedMessages.set(guildId, []);
    selectedMessages.get(guildId).push(msg.id);
    
    interaction.reply({ content: `✅ تم تحديد الرسالة من ${user.username}`, ephemeral: true });
  }

  if (interaction.commandName === 'thd1') {
    const count = interaction.options.getInteger('count');
    const messages = await interaction.channel.messages.fetch({ limit: count });
    if (!selectedMessages.has(guildId)) selectedMessages.set(guildId, []);
    selectedMessages.get(guildId).push(...messages.map(m => m.id));
    
    interaction.reply({ content: `✅ تم تحديد ${count} رسالة`, ephemeral: true });
  }

  if (interaction.commandName === 'clean') {
    const ids = selectedMessages.get(guildId) || [];
    if (ids.length === 0) return interaction.reply({ content: '❌ لا يوجد رسائل محددة للحذف', ephemeral: true });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const toDelete = messages.filter(m => ids.includes(m.id));
    await interaction.channel.bulkDelete(toDelete, true);

    selectedMessages.set(guildId, []); // مسح التخزين بعد الحذف
    interaction.reply({ content: '✅ تم حذف الرسائل المحددة\nحقوق السيرفر', ephemeral: false });
  }

  if (interaction.commandName === 'cleanedall') {
    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    await interaction.channel.bulkDelete(messages, true);
    selectedMessages.set(guildId, []); // مسح التخزين بعد الحذف
    interaction.reply({ content: '✅ تم حذف كل الرسائل في القناة\nحقوق السيرفر', ephemeral: false });
  }
});

client.login(process.env.DISCORD_TOKEN);