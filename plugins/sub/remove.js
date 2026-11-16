const handler = async (m, { text }) => {
  try {
    const sub = globalThis.subBots;

    if (!sub || typeof sub.list !== "function" || typeof sub.remove !== "function") {
      return m.reply("❌ نظام البوتات الفرعية غير متاح حالياً.");
    }

    if (!text?.trim()) {
      return m.reply(
        `╭━━〔 RICO BOT 〕━━╮\n\n` +
        `طريقة الاستخدام:\n\n` +
        `.فرعي_حذف 249XXXXXXXXX\n` +
        `.فرعي_حذف all\n\n` +
        `╰━━━━━━━━━━━━━━╯`
      );
    }

    const target = text.trim();
    const list = await sub.list();

    if (!list.length) {
      return m.reply("❌ لا توجد بوتات فرعية حالياً.");
    }

    if (target.toLowerCase() === "all") {
      let deleted = 0;
      let failed = 0;

      for (const bot of list) {
        if (!bot.phone) {
          failed++;
          continue;
        }

        try {
          await sub.remove(bot.phone);
          deleted++;
        } catch (error) {
          failed++;
          console.error(`RICO remove error (${bot.phone}):`, error);
        }
      }

      return m.reply(
        `╭━━〔 نتيجة الحذف 〕━━╮\n\n` +
        `✅ تم الحذف: ${deleted}\n` +
        `❌ فشل الحذف: ${failed}\n` +
        `📊 الإجمالي: ${list.length}\n\n` +
        `╰━━━━━━━━━━━━━━╯`
      );
    }

    const phone = target.replace(/\D/g, "");

    if (!phone || phone.length < 8 || phone.length > 15) {
      return m.reply("❌ الرقم غير صحيح. أرسله مع رمز الدولة بدون + أو مسافات.");
    }

    const bot = list.find(
      item => String(item.phone).replace(/\D/g, "") === phone
    );

    if (!bot) {
      return m.reply(`❌ لا يوجد بوت فرعي مسجل بالرقم: ${phone}`);
    }

    await sub.remove(bot.phone);

    return m.reply(
      `╭━━〔 RICO BOT 〕━━╮\n\n` +
      `✅ تم حذف البوت بنجاح.\n\n` +
      `👤 الاسم: ${bot.name || "بدون اسم"}\n` +
      `📱 الرقم: ${phone}\n\n` +
      `╰━━━━━━━━━━━━━━╯`
    );

  } catch (error) {
    console.error("RICO remove handler error:", error);
    return m.reply("❌ حدث خطأ أثناء حذف البوت الفرعي.");
  }
};

handler.command = ["فرعي_حذف"];
handler.owner = true;
handler.category = "subbots";

export default handler;
