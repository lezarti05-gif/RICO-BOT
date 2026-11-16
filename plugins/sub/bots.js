const bots = async (m) => {
  try {
    const sub = globalThis.subBots;

    if (!sub || typeof sub.list !== "function") {
      return m.reply("❌ نظام البوتات الفرعية غير متاح حالياً.");
    }

    const list = await sub.list();

    if (!list.length) {
      return m.reply("📭 لا توجد بوتات فرعية منصّبة حالياً.");
    }

    const connected = list.filter(bot => bot.connected).length;
    const disconnected = list.length - connected;

    const totalMessages = list.reduce(
      (total, bot) => total + (Number(bot.messages) || 0),
      0
    );

    const connectionRate = (
      (connected / list.length) * 100
    ).toFixed(1);

    const details = list.map((bot, i) => {
      return [
        `╭─「 ${i + 1}. ${bot.name || "بدون اسم"} 」`,
        `│ 📱 الرقم: ${bot.phone || "غير معروف"}`,
        `│ 🆔 المعرّف: ${bot.id || "غير معروف"}`,
        `│ 📡 الحالة: ${bot.connected ? "🟢 متصل" : "🔴 غير متصل"}`,
        `│ 💬 الرسائل: ${Number(bot.messages) || 0}`,
        `╰────────────`
      ].join("\n");
    }).join("\n\n");

    const output = [
      "╭━━〔 RICO BOT 〕━━╮",
      "",
      "📊 إحصائيات البوتات الفرعية",
      "",
      `🤖 إجمالي البوتات: ${list.length}`,
      `🟢 المتصلة: ${connected}`,
      `🔴 غير المتصلة: ${disconnected}`,
      `📈 نسبة الاتصال: ${connectionRate}%`,
      `💬 إجمالي الرسائل: ${totalMessages}`,
      "",
      "╰━━━━━━━━━━━━━━╯",
      "",
      "📋 تفاصيل البوتات:",
      "",
      details
    ].join("\n");

    return m.reply(output);

  } catch (error) {
    console.error("RICO bots statistics error:", error);
    return m.reply("❌ حدث خطأ أثناء جلب إحصائيات البوتات.");
  }
};

bots.command = ["بوتات"];
bots.category = "subbots";

export default bots;
