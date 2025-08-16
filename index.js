import { 
  Client, GatewayIntentBits, Partials, REST, Routes, 
  SlashCommandBuilder, PermissionFlagsBits, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder 
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const selectedMessages = new Map(); 
let adminRoleId = null; // الرول المخصص للبوت

// ================ تسجيل الأوامر ================
const commands = [
  new SlashCommandBuilder()
    .setName('thd')
    .setDescription('تحديد رسالة باستخدام المنشن')
    .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  
  new SlashCommandBuilder()
    .setName('thd1')
    .setDescription('تحديد عدد من الرسائل')
    .addIntegerOption(option => option.setName('count').setDescription('عدد الرسائل').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('clean')
    .setDescription('حذف الرسائل المحددة'),

  new SlashCommandBuilder()
    .setName('cleanedall')
    .setDescription('حذف كل الرسائل في القناة'),

  new SlashCommandBuilder()
    .setName('messagecounter')
    .setDescription('يحسب عدد الرسائل في القناة'),

  new SlashCommandBuilder()
    .setName('menubot')
    .setDescription('📌 فتح منيو التحكم للبوت'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⚡️ Started refreshing application (/) commands.');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// ================ حماية البوت (أونر + أدمن) ================
function canUseBot(interaction) {
  const isOwner = interaction.guild.ownerId === interaction.user.id;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
  const hasCustomRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
  return isOwner || isAdmin || hasCustomRole;
}

// ================ الأحداث ================
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (!canUseBot(interaction)) {
      return interaction.reply({ content: '❌ ليس لديك صلاحية لاستخدام البوت', ephemeral: true });
    }

    const guildId = interaction.guildId;

    // thd
    if (interaction.commandName === 'thd') {
      const user = interaction.options.getUser('user');
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const msg = messages.find(m => m.author.id === user.id);
      if (!msg) return interaction.reply({ content: '❌ ما تم العثور على رسالة لهذا العضو', ephemeral: true });
      
      if (!selectedMessages.has(guildId)) selectedMessages.set(guildId, []);
      selectedMessages.get(guildId).push(msg.id);
      
      interaction.reply({ content: `✅ تم تحديد الرسالة من ${user.username}`, ephemeral: true });
    }

    // thd1
    if (interaction.commandName === 'thd1') {
      const count = interaction.options.getInteger('count');
      const messages = await interaction.channel.messages.fetch({ limit: count });
      if (!selectedMessages.has(guildId)) selectedMessages.set(guildId, []);
      selectedMessages.get(guildId).push(...messages.map(m => m.id));
      
      interaction.reply({ content: `✅ تم تحديد ${count} رسالة`, ephemeral: true });
    }

    // clean
    if (interaction.commandName === 'clean') {
      const ids = selectedMessages.get(guildId) || [];
      if (ids.length === 0) return interaction.reply({ content: '❌ لا يوجد رسائل محددة', ephemeral: true });

      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter(m => ids.includes(m.id));
      await interaction.channel.bulkDelete(toDelete, true);

      selectedMessages.set(guildId, []);
      interaction.reply({ content: '✅ تم حذف الرسائل المحددة' });
    }

    // cleanedall
    if (interaction.commandName === 'cleanedall') {
      let lastId;
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const messages = await interaction.channel.messages.fetch(options);
        if (messages.size === 0) break;
        await interaction.channel.bulkDelete(messages, true);
        lastId = messages.last().id;
      }
      selectedMessages.set(guildId, []);
      interaction.reply({ content: '✅ تم حذف كل الرسائل في القناة' });
    }

    // messagecounter
    if (interaction.commandName === 'messagecounter') {
      let allMessages = [];
      let lastId;
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const messages = await interaction.channel.messages.fetch(options);
        allMessages = allMessages.concat(Array.from(messages.values()));
        if (messages.size !== 100) break;
        lastId = messages.last().id;
      }
      interaction.reply({ content: `📊 عدد كل الرسائل في القناة: ${allMessages.length}`, ephemeral: true });
    }

    // menubot
    if (interaction.commandName === 'menubot') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('addRole').setLabel('➕ إضافة رول للبوت').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rights').setLabel('📜 الحقوق').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rate').setLabel('⭐ تقييم البوت').setStyle(ButtonStyle.Success),
      );

      await interaction.reply({ content: '📌 منيو التحكم:', components: [row], ephemeral: true });
    }
  }

  // ========== الأزرار ==========
  if (interaction.isButton()) {
    if (interaction.customId === 'rights') {
      await interaction.reply({ 
        content: `👑 الحقوق:\nالاسم: رائد المطيري\nيوزر: @_r10d\nسيرفري: https://discord.gg/qcYnSujM5H`, 
        ephemeral: true 
      });
    }

    if (interaction.customId === 'addRole') {
      await interaction.reply({ content: '🔹 ارسل ايدي الرول الآن لإضافته كمشرف للبوت.', ephemeral: true });
      const filter = m => m.author.id === interaction.user.id;
      const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', m => {
        adminRoleId = m.content.trim();
        m.reply(`✅ تم تعيين الرول (${adminRoleId}) كمشرف للبوت`);
      });
    }

    if (interaction.customId === 'rate') {
      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('rateMenu')
          .setPlaceholder('اختر عدد النجوم')
          .addOptions(
            [1, 2, 3, 4, 5].map(n => ({ label: `${n} ⭐`, value: n.toString() }))
          )
      );
      await interaction.reply({ content: '🌟 اختر تقييمك:', components: [menu], ephemeral: true });
    }
  }

  // ========== القائمة (التقييم) ==========
  if (interaction.isStringSelectMenu() && interaction.customId === 'rateMenu') {
    const stars = interaction.values[0];
    await interaction.reply({ content: `✨ شكراً لك على تقييمك (${stars} ⭐)`, ephemeral: true });

    // يرسل لك بالخاص اسم + يوزر + عدد النجوم
    const owner = await client.users.fetch(process.env.OWNER_ID); 
    owner.send(`📢 ${interaction.user.username} (${interaction.user.tag}) قيم البوت: ${stars} ⭐`);
  }
});

client.login(process.env.DISCORD_TOKEN);