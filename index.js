import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';

// إنشاء البوت مع النوايا المطلوبة
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// آي دي الأشخاص المسموح لهم لميزة الرياكشن
const owners = ['1079022798523093032', '879476597927837816'];
// آي دي القنوات المسموح فيها للرياكشن
const allowedChannels = ['1406085179617054802', '1404168132054093956', '1404169419353227335'];
// الإيموجيات اللي البوت يضيفها
const emojis = ['👍', '❤️', '😂', '😮', '🔥'];

// قائمة احتياطية لميمز لو الـ API تعطّل
const fallbackMemes = [
  'https://i.imgur.com/6XjK8.png',
  'https://i.imgur.com/4M7IWwP.jpeg',
  'https://i.imgur.com/o7P2i9G.jpeg',
  'https://i.imgur.com/0rW3Z1N.jpeg',
  'https://i.imgur.com/1N3bY5C.jpeg'
];

// كولداون بسيط عشان ما ينSpam الأمر
const cooldown = new Map(); // key: userId, val: timestamp
const MEME_COOLDOWN_MS = 5000; // 5 ثواني

client.on('messageCreate', async (message) => {
  // تجاهل رسائل البوت
  if (message.author.bot) return;

  // ===== ميزة الرياكشن القديمة =====
  try {
    if (owners.includes(message.author.id) && allowedChannels.includes(message.channel.id)) {
      for (const emoji of emojis) {
        await message.react(emoji).catch(() => {});
      }
    }
  } catch (e) {
    console.error('Reaction error:', e);
  }

  // ===== أمر !ميم =====
  try {
    if (message.content.trim().toLowerCase().startsWith('!ميم')) {
      // تحقّق الكولداون
      const now = Date.now();
      const last = cooldown.get(message.author.id) || 0;
      if (now - last < MEME_COOLDOWN_MS) {
        const waitSec = Math.ceil((MEME_COOLDOWN_MS - (now - last)) / 1000);
        return message.reply(`⏳ جرب بعد ${waitSec} ثانية.`);
      }
      cooldown.set(message.author.id, now);

      // حاول تجيب ميم من الـ API
      let memeTitle = 'ميم عشوائي';
      let memeImg = null;
      let memePost = null;

      try {
        // Node 18 فيه fetch مدمج
        const res = await fetch('https://meme-api.com/gimme');
        if (res.ok) {
          const data = await res.json();
          // الحقلين الشائعة: title, url, postLink
          memeTitle = data.title || memeTitle;
          memeImg = data.url || null;
          memePost = data.postLink || null;
        }
      } catch {
        // تجاهل، بنستخدم احتياطي تحت
      }

      // لو ما جاب صورة من API، استخدم احتياطي
      if (!memeImg) {
        memeImg = fallbackMemes[Math.floor(Math.random() * fallbackMemes.length)];
      }

      const embed = new EmbedBuilder()
        .setTitle(memeTitle)
        .setImage(memeImg)
        .setFooter({ text: '😄 طلب: !ميم' });

      if (memePost) embed.setURL(memePost);

      await message.channel.send({ embeds: [embed] });
    }
  } catch (e) {
    console.error('Meme command error:', e);
    await message.reply('❌ صار خطأ أثناء جلب الميم. جرب مرة ثانية.');
  }
});

// التحقق من وجود توكن البوت
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Error: DISCORD_TOKEN not found!');
  process.exit(1);
}

// تسجيل الدخول
client.login(process.env.DISCORD_TOKEN);