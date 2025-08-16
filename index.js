import {
  Client, GatewayIntentBits, Partials,
  REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder
} from 'discord.js';

/* ===================== إعداد العميل ===================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,      // لتميـمات/تايم آوت ومكافحة الرايد
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = process.env.OWNER_ID || '';         // حط آيديك هنا في Variables
const OWNER_ROLE_ID = process.env.OWNER_ROLE_ID || '';// (اختياري) رول الأونر لو عندك رول مخصص

/* ===================== تخزين إعدادات السيرفرات (بالذاكرة) ===================== */
// ملاحظة: بما أننا بدون قاعدة بيانات، القيم تتصفّر بعد إعادة تشغيل البوت
const selectedMessages = new Map(); // guildId -> [messageIds]
const botAdminRole = new Map();     // guildId -> roleId (الرول المسموح له يدير البوت)
const logChannelId = new Map();     // guildId -> channelId (قناة اللوج)
const disabledCommands = new Map(); // guildId -> boolean (تعطيل/تفعيل الأوامر)
const moduleToggles = new Map();    // guildId -> { antiSpam, antiLinks, antiMention }

/* ===================== أوامر السلاش ===================== */
const commands = [
  new SlashCommandBuilder().setName('thd')
    .setDescription('تحديد رسالة باستخدام المنشن')
    .addUserOption(o => o.setName('user').setDescription('العضو').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('thd1')
    .setDescription('تحديد عدد من الرسائل')
    .addIntegerOption(o => o.setName('count').setDescription('عدد الرسائل').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('clean')
    .setDescription('حذف الرسائل المحددة مسبقًا')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('cleanedall')
    .setDescription('حذف كل الرسائل بالقناة')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder().setName('messagecounter')
    .setDescription('📊 عدّ كل رسائل القناة الحالية'),

  // إعدادات
  new SlashCommandBuilder().setName('setlog')
    .setDescription('تعيين قناة اللوج')
    .addChannelOption(o => o.setName('channel').setDescription('قناة اللوج').setRequired(true)),

  new SlashCommandBuilder().setName('setadminrole')
    .setDescription('تعيين رول المسؤول عن البوت')
    .addRoleOption(o => o.setName('role').setDescription('رول الإدارة للبوت').setRequired(true)),

  new SlashCommandBuilder().setName('modules')
    .setDescription('تفعيل/تعطيل وحدات الحماية')
    .addStringOption(o => o.setName('name').setDescription('antiSpam / antiLinks / antiMention').setRequired(true))
    .addBooleanOption(o => o.setName('enable').setDescription('تفعيل؟').setRequired(true)),

  new SlashCommandBuilder().setName('menubot')
    .setDescription('منيو تحكم البوت'),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ تم رفع أوامر السلاش');
  } catch (e) { console.error(e); }
})();

/* ===================== أدوات الصلاحيات ===================== */
function isOwnerMember(member) {
  const hasOwnerRole = OWNER_ROLE_ID ? member.roles.cache.has(OWNER_ROLE_ID) : false;
  return member.id === OWNER_ID || hasOwnerRole;
}
function canManageBot(member, guildId) {
  const adminR = botAdminRole.get(guildId);
  return isOwnerMember(member)
      || member.permissions.has(PermissionFlagsBits.Administrator)
      || (adminR && member.roles.cache.has(adminR));
}
function userCanOnlyRate(member, guildId) {
  // إذا ما عنده أي صلاحية، نخليه يقدر يقيّم فقط
  return !canManageBot(member, guildId);
}

/* ===================== لوج مساعد ===================== */
async function sendLog(guild, embedOrContent) {
  const id = logChannelId.get(guild.id);
  if (!id) return;
  const ch = guild.channels.cache.get(id);
  if (!ch) return;
  ch.send(typeof embedOrContent === 'string' ? { content: embedOrContent } : { embeds: [embedOrContent] }).catch(() => {});
}

/* ===================== أنتي سبام/لينكات/منشن ===================== */
const msgBuckets = new Map(); // key: `${guildId}:${userId}` -> {count, firstTs}
const SPAM_WINDOW = 5000;     // 5s
const SPAM_LIMIT  = 8;        // 8 رسائل/5 ثواني => تايم آوت

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const gId = message.guild.id;
  const toggles = moduleToggles.get(gId) || { antiSpam: true, antiLinks: true, antiMention: true };

  // bypass لمن يدير البوت
  if (canManageBot(message.member, gId)) return;

  // antiLinks
  if (toggles.antiLinks && /(discord\.gg|discord\.com\/invite|https?:\/\/)/i.test(message.content)) {
    try { await message.delete(); } catch {}
    await message.channel.send({ content: `🚫 ${message.author}, الروابط غير مسموحة هنا.` }).then(m=>setTimeout(()=>m.delete().catch(()=>{}), 4000));
    await sendLog(message.guild, new EmbedBuilder().setColor(0xE74C3C).setTitle('حذف رابط').setDescription(`**${message.author.tag}** حاول نشر رابط في <#${message.channel.id}>`));
    return;
  }

  // antiMention (منشن جماعي)
  if (toggles.antiMention) {
    const mentions = (message.mentions.users?.size || 0) + (message.mentions.roles?.size || 0);
    if (mentions >= 6) {
      try { await message.delete(); } catch {}
      await message.channel.send({ content: `🚫 ${message.author}, منشن مبالغ فيه.` }).then(m=>setTimeout(()=>m.delete().catch(()=>{}), 4000));
      await sendLog(message.guild, new EmbedBuilder().setColor(0xE67E22).setTitle('منشن مبالغ فيه').setDescription(`**${message.author.tag}** ذكر ${mentions} مرة.`));
      return;
    }
  }

  // antiSpam (rate limit)
  if (toggles.antiSpam) {
    const key = `${gId}:${message.author.id}`;
    const now = Date.now();
    const b = msgBuckets.get(key) || { count: 0, firstTs: now };
    if (now - b.firstTs > SPAM_WINDOW) { b.count = 0; b.firstTs = now; }
    b.count += 1; msgBuckets.set(key, b);

    if (b.count > SPAM_LIMIT) {
      // تايم آوت 10 دقائق
      try {
        await message.member.timeout(10 * 60 * 1000, 'Spam detected');
        await sendLog(message.guild, new EmbedBuilder().setColor(0xF1C40F).setTitle('تايم آوت - سبام')
          .setDescription(`**${message.author.tag}** تم إيقافه مؤقتاً بسبب سبام.`));
      } catch {}
    }
  }
});

/* ===================== أوامر السلاش ===================== */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

  const gId = interaction.guildId;

  // تعطيل الأوامر العامة
  if (interaction.isChatInputCommand() && disabledCommands.get(gId)) {
    // لكن خلي تقييم البوت يشتغل دائمًا من المنيو؛ هنا فقط أوامر السلاش تتعطل.
    if (interaction.commandName !== 'menubot') {
      return interaction.reply({ content: '⛔ الأوامر معطلة حاليًا من الإدارة.', ephemeral: true });
    }
  }

  /* ======= أوامر الإدارة/التنظيف/العداد ======= */
  if (interaction.isChatInputCommand()) {
    // رسالة عدم الصلاحية: المستخدمين العاديين يقدرون يفتحون المنيو لكن بيظهر لهم التقييم فقط
    const isManager = canManageBot(interaction.member, gId);

    if (['thd','thd1','clean','cleanedall','messagecounter','setlog','setadminrole','modules'].includes(interaction.commandName) && !isManager) {
      return interaction.reply({ content: '❌ ما عندك صلاحية. تقدر تستخدم تقييم البوت من المنيو فقط.', ephemeral: true });
    }

    if (interaction.commandName === 'thd') {
      const user = interaction.options.getUser('user');
      const msgs = await interaction.channel.messages.fetch({ limit: 100 });
      const msg = msgs.find(m => m.author.id === user.id);
      if (!msg) return interaction.reply({ content: '❌ ما لقيت رسالة لهذا العضو', ephemeral: true });
      if (!selectedMessages.has(gId)) selectedMessages.set(gId, []);
      selectedMessages.get(gId).push(msg.id);
      await interaction.reply('✅ تم تحديد الرسالة');
      return;
    }

    if (interaction.commandName === 'thd1') {
      const count = interaction.options.getInteger('count');
      const msgs = await interaction.channel.messages.fetch({ limit: Math.min(count, 100) });
      if (!selectedMessages.has(gId)) selectedMessages.set(gId, []);
      selectedMessages.get(gId).push(...msgs.map(m => m.id));
      await interaction.reply(`✅ تم تحديد ${msgs.size} رسالة`);
      return;
    }

    if (interaction.commandName === 'clean') {
      const ids = selectedMessages.get(gId) || [];
      if (!ids.length) return interaction.reply({ content: '❌ لا يوجد رسائل محددة', ephemeral: true });
      const msgs = await interaction.channel.messages.fetch({ limit: 100 });
      const toDelete = msgs.filter(m => ids.includes(m.id));
      await interaction.channel.bulkDelete(toDelete, true);
      selectedMessages.set(gId, []);
      await interaction.reply('✅ تم حذف الرسائل المحددة');
      return;
    }

    if (interaction.commandName === 'cleanedall') {
      let lastId;
      let total = 0;
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const msgs = await interaction.channel.messages.fetch(options);
        if (!msgs.size) break;
        await interaction.channel.bulkDelete(msgs, true);
        total += msgs.size;
        lastId = msgs.last().id;
      }
      selectedMessages.set(gId, []);
      await interaction.reply(`✅ تم حذف كل الرسائل (${total})`);
      return;
    }

    if (interaction.commandName === 'messagecounter') {
      let count = 0;
      let lastId;
      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const msgs = await interaction.channel.messages.fetch(options);
        if (!msgs.size) break;
        count += msgs.size;
        lastId = msgs.last().id;
      }
      await interaction.reply(`📊 عدد كل الرسائل بالقناة: **${count}**`);
      return;
    }

    if (interaction.commandName === 'setlog') {
      const ch = interaction.options.getChannel('channel');
      logChannelId.set(gId, ch.id);
      await interaction.reply(`✅ تم تعيين قناة اللوج: <#${ch.id}>`);
      return;
    }

    if (interaction.commandName === 'setadminrole') {
      const role = interaction.options.getRole('role');
      botAdminRole.set(gId, role.id);
      await interaction.reply(`✅ تم تعيين رول إدارة البوت: **${role.name}**`);
      return;
    }

    if (interaction.commandName === 'modules') {
      const name = interaction.options.getString('name');
      const enable = interaction.options.getBoolean('enable');
      const current = moduleToggles.get(gId) || { antiSpam: true, antiLinks: true, antiMention: true };
      if (!['antispam','antilinks','antimention'].includes(name.toLowerCase())) {
        return interaction.reply({ content: '❌ اسم الموديول غير صحيح (antiSpam / antiLinks / antiMention)', ephemeral: true });
      }
      current[name.toLowerCase().replace('anti','anti')] = enable;
      moduleToggles.set(gId, current);
      await interaction.reply(`✅ ${name} أصبح: **${enable ? 'Enabled' : 'Disabled'}**`);
      return;
    }

    // ===== منيو التحكم =====
    if (interaction.commandName === 'menubot') {
      const isMgr = canManageBot(interaction.member, gId);

      // صف المديرين (كامل التحكم)
      const adminRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mb_addRole').setLabel('➕ إضافة رول تحكم').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mb_rights').setLabel('👤 الحقوق').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mb_rate').setLabel('⭐ تقييم البوت').setStyle(ButtonStyle.Success),
      );
      const adminRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mb_toggle_antispam').setLabel('AntiSpam ⛔/✅').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mb_toggle_antilinks').setLabel('AntiLinks ⛔/✅').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mb_toggle_antimention').setLabel('AntiMention ⛔/✅').setStyle(ButtonStyle.Secondary),
      );
      const adminRow3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mb_toggle_cmds').setLabel('تعطيل/تفعيل الأوامر').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mb_info_bot').setLabel('ℹ️ معلومات البوت').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mb_info_server').setLabel('📊 حالة السيرفر').setStyle(ButtonStyle.Secondary),
      );
      const ownerRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mb_restart').setLabel('🔄 إعادة تشغيل (Owner)').setStyle(ButtonStyle.Danger)
      );

      // صف المستخدم العادي (تقييم فقط + حقوق)
      const userRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mb_rights').setLabel('👤 الحقوق').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('mb_rate').setLabel('⭐ تقييم البوت').setStyle(ButtonStyle.Success),
      );

      if (!isMgr) {
        // يظهر له فقط التقييم والحقوق
        return interaction.reply({ content: '📋 منيو البوت (وضع المشاهدة):', components: [userRow], ephemeral: true });
      }

      // مدير/أدمن يشوف كل شيء
      const rows = [adminRow1, adminRow2, adminRow3];
      if (isOwnerMember(interaction.member)) rows.push(ownerRow);
      return interaction.reply({ content: '📋 منيو تحكم البوت:', components: rows, ephemeral: true });
    }

    return;
  }

  /* ======= أزرار المنيو ======= */
  if (interaction.isButton()) {
    const member = interaction.member;
    const isMgr = canManageBot(member, gId);

    // المستخدم العادي: نسمح فقط بالحقوق والتقييم
    if (!isMgr && !['mb_rights','mb_rate','rate_1','rate_2','rate_3','rate_4','rate_5'].includes(interaction.customId)) {
      return interaction.reply({ content: 'يمكنك استخدام تقييم البوت فقط من هنا ⭐', ephemeral: true });
    }

    // زر إضافة رول (Owner فقط)
    if (interaction.customId === 'mb_addRole') {
      if (!isOwnerMember(member)) {
        return interaction.reply({ content: '❌ فقط الـ Owner يقدر يضيف رول تحكم.', ephemeral: true });
      }
      const available = interaction.guild.roles.cache.map(r => `• ${r.name} — \`${r.id}\``).slice(0, 20).join('\n') || 'لا يوجد رولات؟';
      await interaction.reply({
        content: `أرسل الآن **ID** الرول المراد تعيينه لإدارة البوت خلال 30 ثانية.\n\nأقرب 20 رول:\n${available}`,
        ephemeral: true
      });
      const filter = m => m.author.id === interaction.user.id;
      const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });
      collector.on('collect', m => {
        const id = m.content.trim();
        if (!interaction.guild.roles.cache.has(id)) return m.reply('❌ ID غير صحيح.');
        botAdminRole.set(gId, id);
        m.reply(`✅ تم تعيين رول الإدارة للبوت: <@&${id}>`);
      });
      return;
    }

    // الحقوق
    if (interaction.customId === 'mb_rights') {
      const embed = new EmbedBuilder()
        .setTitle('حقوق البوت')
        .setDescription('👤 رائد المطيري\n📱 يوزر: @_r10d\n🔗 [سيرفر الدعم](https://discord.gg/qcYnSujM5H)')
        .setColor(0x3498DB);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // تقييم
    if (interaction.customId === 'mb_rate') {
      const row = new ActionRowBuilder().addComponents(
        [1,2,3,4,5].map(n => new ButtonBuilder()
          .setCustomId(`rate_${n}`)
          .setLabel(`${'⭐'.repeat(n)}`)
          .setStyle(ButtonStyle.Secondary))
      );
      return interaction.reply({ content: 'اختر تقييمك:', components: [row], ephemeral: true });
    }

    if (interaction.customId.startsWith('rate_')) {
      const stars = interaction.customId.split('_')[1];
      await interaction.reply({ content: `✨ شكرًا لك! تقييمك: ${stars}⭐`, ephemeral: true });
      // رسالة للمالك
      if (OWNER_ID) {
        client.users.fetch(OWNER_ID).then(u => {
          u.send(`⭐ تقييم جديد:\n• المستخدم: ${interaction.user.tag} (${interaction.user.id})\n• السيرفر: ${interaction.guild.name}\n• النجوم: ${stars}⭐`).catch(()=>{});
        }).catch(()=>{});
      }
      // لوج في السيرفر (لو محدد)
      await sendLog(interaction.guild, new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('تقييم جديد')
        .setDescription(`**${interaction.user.tag}** قيّم البوت: **${stars}⭐**`));
      return;
    }

    // تبديل الموديولز
    if (interaction.customId.startsWith('mb_toggle_')) {
      const name = interaction.customId.replace('mb_toggle_', ''); // antispam / antilinks / antimention
      const current = moduleToggles.get(gId) || { antiSpam: true, antiLinks: true, antiMention: true };
      if (!(name in current)) return interaction.reply({ content: '❌ موديول غير معروف.', ephemeral: true });
      current[name] = !current[name];
      moduleToggles.set(gId, current);
      await interaction.reply({ content: `🔧 ${name} الآن: **${current[name] ? 'Enabled' : 'Disabled'}**`, ephemeral: true });
      return;
    }

    // تعطيل/تفعيل الأوامر (للمدراء فقط)
    if (interaction.customId === 'mb_toggle_cmds') {
      const now = !(disabledCommands.get(gId) || false);
      disabledCommands.set(gId, now);
      return interaction.reply({ content: now ? '⛔ تم تعطيل الأوامر.' : '✅ تم تفعيل الأوامر.', ephemeral: true });
    }

    // معلومات البوت
    if (interaction.customId === 'mb_info_bot') {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('معلومات البوت')
          .addFields(
            { name: '👾 الاسم', value: client.user.tag, inline: true },
            { name: '🌐 عدد السيرفرات', value: `${client.guilds.cache.size}`, inline: true },
            { name: '📡 Ping', value: `${client.ws.ping}ms`, inline: true }
          )
          .setColor(0x5865F2)
        ],
        ephemeral: true
      });
    }

    // معلومات السيرفر
    if (interaction.customId === 'mb_info_server') {
      const g = interaction.guild;
      const online = g.members.cache.filter(m => m.presence?.status === 'online').size;
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`📊 ${g.name}`)
          .addFields(
            { name: '👥 الأعضاء', value: `${g.memberCount}`, inline: true },
            { name: '🟢 المتصلون', value: `${online}`, inline: true },
            { name: '📁 الرومات', value: `${g.channels.cache.size}`, inline: true }
          )
          .setColor(0x2ECC71)
        ],
        ephemeral: true
      });
    }

    // إعادة تشغيل (Owner فقط)
    if (interaction.customId === 'mb_restart') {
      if (!isOwnerMember(member)) {
        return interaction.reply({ content: '❌ فقط الـ Owner.', ephemeral: true });
      }
      await interaction.reply({ content: '🔄 جاري إعادة تشغيل البوت…', ephemeral: true });
      process.exit(0);
    }
  }
});

/* ===================== جاهزية ===================== */
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('/menubot | by Raed');
});
client.login(TOKEN);