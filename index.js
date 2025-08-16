import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// تخزين الرسائل المحددة
const selectedMessages = new Map(); 
// تخزين رول الادمن للبوت
let botAdminRoles = new Map(); // key: guildId, value: roleId
// تعطيل الأوامر
let disabledCommands = new Map(); // key: guildId, value: true/false

// تسجيل الاوامر
const commands = [
  new SlashCommandBuilder()
    .setName('thd')
    .setDescription('تحديد رسالة باستخدام المنشن')
    .addUserOption(option => option.setName('user').setDescription('العضو').setRequired(true)),

  new SlashCommandBuilder()
    .setName('thd1')
    .setDescription('تحديد عدد من الرسائل')
    .addIntegerOption(option => option.setName('count').setDescription('عدد الرسائل').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clean')
    .setDescription('حذف الرسائل المحددة مسبقًا'),

  new SlashCommandBuilder()
    .setName('cleanedall')
    .setDescription('حذف كل الرسائل في القناة'),

  new SlashCommandBuilder()
    .setName('messagecounter')
    .setDescription('يحسب عدد كل الرسائل في القناة'),

  new SlashCommandBuilder()
    .setName('menubot')
    .setDescription('منيو تحكم البوت')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Slash commands تم رفعها بنجاح');
  } catch (error) {
    console.error(error);
  }
})();

function hasAccess(interaction, needOwner = false) {
  const member = interaction.member;
  const guildId = interaction.guildId;
  const adminRole = botAdminRoles.get(guildId);

  if (needOwner) {
    return member.roles.cache.some(r => r.name.toLowerCase().includes("owner"));
  }

  return member.permissions.has(PermissionFlagsBits.Administrator) ||
    (adminRole && member.roles.cache.has(adminRole));
}

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const guildId = interaction.guildId;

    if (disabledCommands.get(guildId)) {
      return interaction.reply({ content: "⚠️ الأوامر معطلة حالياً من قبل الإدارة", ephemeral: true });
    }

    // اوامر الحذف والعد
    if (['thd','thd1','clean','cleanedall','messagecounter'].includes(interaction.commandName)) {
      if (!hasAccess(interaction)) {
        return interaction.reply({ content: "❌ ما عندك صلاحية تستخدم هذا الأمر", ephemeral: true });
      }
    }

    if (interaction.commandName === 'thd') {
      const user = interaction.options.getUser('user');
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const msg = messages.find(m => m.author.id === user.id);
      if (!msg) return interaction.reply({ content: '❌ ما تم العثور على رسالة', ephemeral: true });
      if (!selectedMessages.has(guildId)) selectedMessages.set(guildId, []);
      selectedMessages.get(guildId).push(msg.id);
      interaction.reply({ content: `✅ تم تحديد الرسالة من ${user.username}` });
    }

    if (interaction.commandName === 'thd1') {
      const count = interaction.options.getInteger('count');
      const messages = await interaction.channel.messages.fetch({ limit: count });
      if (!selectedMessages.has(guildId)) selectedMessages.set(guildId, []);
      selectedMessages.get(guildId).push(...messages.map(m => m.id));
      interaction.reply({ content: `✅ تم تحديد ${count} رسالة` });
    }

    if (interaction.commandName === 'clean') {
      const ids = selectedMessages.get(guildId) || [];
      if (ids.length === 0) return interaction.reply({ content: '❌ لا يوجد رسائل محددة', ephemeral: true });
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter(m => ids.includes(m.id));
      await interaction.channel.bulkDelete(toDelete, true);
      selectedMessages.set(guildId, []);
      interaction.reply({ content: '✅ تم حذف الرسائل المحددة' });
    }

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
      interaction.reply({ content: `📊 عدد كل الرسائل في القناة: ${allMessages.length}` });
    }

    if (interaction.commandName === 'menubot') {
      if (!hasAccess(interaction)) {
        return interaction.reply({ content: "❌ ما عندك صلاحية تفتح المنيو", ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('addRole').setLabel('➕ إضافة رول تحكم').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rights').setLabel('👤 حقوق البوت').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rate').setLabel('⭐ تقييم البوت').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('botInfo').setLabel('ℹ️ معلومات البوت').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('serverInfo').setLabel('📊 حالة السيرفر').setStyle(ButtonStyle.Secondary)
      );
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('restart').setLabel('🔄 إعادة تشغيل البوت').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('toggleCommands').setLabel('⛔ تعطيل/تفعيل الأوامر').setStyle(ButtonStyle.Secondary)
      );
      interaction.reply({ content: "📋 منيو تحكم البوت", components: [row,row2] });
    }
  }

  // ازرار
  if (interaction.isButton()) {
    const guildId = interaction.guildId;

    if (interaction.customId === 'addRole') {
      if (!hasAccess(interaction, true)) {
        return interaction.reply({ content: "❌ فقط الـ Owner يقدر يضيف رول تحكم", ephemeral: true });
      }
      const menu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('selectRole')
          .setPlaceholder('اختر رول للتحكم بالبوت')
          .addOptions(interaction.guild.roles.cache.map(role => ({
            label: role.name, value: role.id
          })))
      );
      return interaction.reply({ content: "🎭 اختر الرول:", components: [menu], ephemeral: true });
    }

    if (interaction.customId === 'rights') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("حقوق البوت")
          .setDescription("👤 رائد المطيري\n📱 يوزر: @_r10d\n🔗 [اضغط هنا للدخول السيرفر](https://discord.gg/qcYnSujM5H)")
          .setColor(0x00AEFF)
        ],
        ephemeral: true
      });
    }

    if (interaction.customId === 'rate') {
      const row = new ActionRowBuilder().addComponents(
        [1,2,3,4,5].map(num =>
          new ButtonBuilder().setCustomId(`rate_${num}`).setLabel(`${num}⭐`).setStyle(ButtonStyle.Secondary)
        )
      );
      return interaction.reply({ content: "اختر تقييمك للبوت:", components: [row], ephemeral: true });
    }

    if (interaction.customId.startsWith('rate_')) {
      const stars = interaction.customId.split('_')[1];
      await interaction.reply({ content: `✨ شكرا لك لتقييمك ${stars}⭐`, ephemeral: true });
      const logChannel = interaction.guild.systemChannel || interaction.channel;
      logChannel.send(`📢 ${interaction.user.username} (${interaction.user.id}) قيم البوت: ${stars}⭐`);
    }

    if (interaction.customId === 'botInfo') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle("معلومات البوت")
          .addFields(
            { name: "👾 اسم البوت", value: client.user.tag, inline: true },
            { name: "🌐 عدد السيرفرات", value: `${client.guilds.cache.size}`, inline: true },
            { name: "📡 البنق", value: `${client.ws.ping}ms`, inline: true }
          )
          .setColor(0x5865F2)
        ],
        ephemeral: true
      });
    }

    if (interaction.customId === 'serverInfo') {
      const guild = interaction.guild;
      const online = guild.members.cache.filter(m => m.presence?.status === 'online').size;
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`📊 حالة السيرفر: ${guild.name}`)
          .addFields(
            { name: "👥 عدد الأعضاء", value: `${guild.memberCount}`, inline: true },
            { name: "🟢 المتصلين الآن", value: `${online}`, inline: true },
            { name: "📁 عدد الرومات", value: `${guild.channels.cache.size}`, inline: true }
          )
          .setColor(0x2ECC71)
        ],
        ephemeral: true
      });
    }

    if (interaction.customId === 'restart') {
      if (!hasAccess(interaction, true)) {
        return interaction.reply({ content: "❌ فقط الـ Owner يقدر يعيد تشغيل البوت", ephemeral: true });
      }
      await interaction.reply({ content: "🔄 جاري إعادة تشغيل البوت...", ephemeral: true });
      process.exit(0);
    }

    if (interaction.customId === 'toggleCommands') {
      if (!hasAccess(interaction)) {
        return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });
      }
      const current = disabledCommands.get(guildId) || false;
      disabledCommands.set(guildId, !current);
      interaction.reply({ content: current ? "✅ تم تفعيل الأوامر" : "⛔ تم تعطيل الأوامر", ephemeral: true });
    }
  }

  // تحديد رول
  if (interaction.isStringSelectMenu() && interaction.customId === 'selectRole') {
    const roleId = interaction.values[0];
    botAdminRoles.set(interaction.guildId, roleId);
    interaction.reply({ content: `✅ تم تعيين رول ${interaction.guild.roles.cache.get(roleId).name} كـ رول تحكم للبوت`, ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);