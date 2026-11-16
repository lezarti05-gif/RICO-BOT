const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const handler = async (m, { conn, text, cli }) => {
  try {
    const subs = globalThis.subBots;

    if (!subs) {
      return m.reply("❌ نظام البوتات الفرعية غير متاح حالياً.");
    }

    const raw = text?.trim() || m.jid?.split("@")[0] || "";
    const digits = raw.replace(/\D/g, "");

    if (!digits || digits.length < 8 || digits.length > 15) {
      return m.reply(
        "📱 أرسل رقم واتساب مع رمز الدولة بدون + أو مسافات.\n\n" +
        "مثال:\n.تنصيب 249XXXXXXXXX"
      );
    }

    const list = await subs.list();
    const limit = Number(global.db?.settings?.installLimit) || 10;

    if (list.length >= limit) {
      return m.reply(`⛔ وصلنا للحد الأقصى للتنصيب (${limit}).`);
    }

    const existing = await subs.get(digits);

    if (existing?.connected) {
      return m.reply(`✅ الرقم ${digits} مرتبط بالفعل.`);
    }

    m.react?.("🤖");

    const code = await subs.addBot(digits);

    if (!code) {
      return m.reply("❌ تعذر إنشاء كود الاقتران. حاول مرة أخرى.");
    }

    const images = cli?.config?.info?.images || [];
    const channel = cli?.config?.info?.channel || {};

    const status = {
      key: {
        participant: `${m.sender.split("@")[0]}@s.whatsapp.net`,
        remoteJid: "status@broadcast",
        fromMe: false
      },
      message: {
        contactMessage: {
          displayName: m.pushName || "User",
          vcard:
            `BEGIN:VCARD\nVERSION:3.0\nFN:${m.pushName || "User"}\n` +
            `TEL;waid=${m.sender.split("@")[0]}:${m.sender.split("@")[0]}\nEND:VCARD`
        }
      },
      participant: "0@s.whatsapp.net"
    };

    await conn.buttonV2(
      m.chat,
      {
        text:
          `╭━━〔 RICO BOT 〕━━╮\n\n` +
          `📱 الرقم: ${digits}\n` +
          `🔑 كود الاقتران: ${code}\n\n` +
          `افتح واتساب في الهاتف المرتبط بالرقم، ` +
          `ثم الأجهزة المرتبطة واختر الربط باستخدام رقم الهاتف.\n\n` +
          `⚠️ لا تشارك كود الاقتران مع أي شخص.\n` +
          `╰━━━━━━━━━━━━━━╯`,
        footer: "RICO BOT",
        image: images[1],
        contextInfo: channel,
        buttons: [
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "نسخ الكود",
              copy_code: code
            })
          }
        ]
      },
      { quoted: status }
    );

    for (let i = 0; i < 40; i++) {
      await sleep(3000);

      const bot = await subs.get(digits);

      if (bot?.connected) {
        return conn.sendMessage(m.chat, {
          text:
            `✅ تم ربط البوت بنجاح!\n\n` +
            `📱 الرقم: ${digits}\n` +
            `🤖 البوت جاهز للاستخدام.\n` +
            `اكتب .اوامر لعرض المميزات.`
        });
      }
    }

    return conn.sendMessage(m.chat, {
      text:
        `⏱️ لم يتم تأكيد الاتصال حتى الآن.\n` +
        `تحقق من حالة الربط وحاول مجدداً إذا انتهت صلاحية الكود.`
    });

  } catch (error) {
    console.error("RICO install error:", error);

    return m.reply(
      "❌ حصل خطأ أثناء التنصيب.\n" +
      "راجع سجل الاستضافة لمعرفة السبب."
    );
  }
};

handler.command = ["تنصيب"];
handler.category = "subbots";

export default handler;
