
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 10000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1);

const sessions = new Map();
const requests = new Map();
const pending = new Set();
const adminSessions = new Map();

let webServer;

const getSubs = () => globalThis.subBots;

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function getPhone(req) {
  return sessions.get(getToken(req));
}

function validPhone(phone) {
  return /^\d{8,15}$/.test(phone);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function save() {
  if (typeof global.saveDB !== "function") {
    throw new Error("Database save function is unavailable");
  }
  return global.saveDB();
}

function rateLimit(ip) {
  const now = Date.now();
  const recent = (requests.get(ip) || [])
    .filter(time => now - time < 10 * 60 * 1000);

  if (recent.length >= 3) return false;

  recent.push(now);
  requests.set(ip, recent);
  return true;
}

function isAdmin(req) {
  const token = getToken(req);
  const expiry = adminSessions.get(token);

  if (!expiry || expiry < Date.now()) {
    adminSessions.delete(token);
    return false;
  }

  return true;
}

// كل الأخطاء ترجع JSON
app.use((err, req, res, next) => {
  console.error("RICO EXPRESS ERROR:", err);

  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    success: false,
    message: err.status === 400
      ? "بيانات الطلب غير صحيحة."
      : "حدث خطأ داخل الخادم."
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    name: "RICO BOT",
    status: "running",
    subBotsReady: Boolean(getSubs())
  });
});

// دخول المطور
app.post("/api/admin/login", async (req, res) => {
  try {
    const password = String(req.body?.password || "");
    const savedHash = global.db?.admin?.passwordHash;
    const initial = process.env.RICO_ADMIN_INITIAL_PASSWORD;

    if (!savedHash && !initial) {
      return res.status(503).json({
        success: false,
        message: "أضف كلمة المرور الأولية في إعدادات Render."
      });
    }

    const hash = crypto.createHash("sha256")
      .update(password)
      .digest("hex");

    const valid = savedHash ? hash === savedHash : password === initial;

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "كلمة المرور غير صحيحة."
      });
    }

    if (!savedHash) {
      global.db.admin = {
        passwordHash: hash,
        createdAt: new Date().toISOString()
      };
      await save();
    }

    const token = crypto.randomBytes(32).toString("hex");
    adminSessions.set(token, Date.now() + 12 * 60 * 60 * 1000);

    res.json({ success: true, token });
  } catch (error) {
    console.error("RICO ADMIN LOGIN:", error);
    res.status(500).json({
      success: false,
      message: "تعذر تسجيل الدخول."
    });
  }
});

// تغيير كلمة المرور
app.post("/api/admin/password", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({
        success: false,
        message: "سجّل دخول المطور أولاً."
      });
    }

    const password = String(req.body?.password || "");

    if (password.length < 10) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون 10 أحرف على الأقل."
      });
    }

    global.db.admin.passwordHash = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    await save();

    res.json({
      success: true,
      message: "تم تغيير كلمة المرور."
    });
  } catch (error) {
    console.error("RICO PASSWORD ERROR:", error);
    res.status(500).json({
      success: false,
      message: "تعذر حفظ كلمة المرور."
    });
  }
});

// إحصائيات المطور
app.get("/api/admin/stats", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({
        success: false,
        message: "جلسة المطور غير صالحة."
      });
    }

    const stats = global.db?.stats || {};
    let list = [];

    try {
      list = await getSubs()?.list?.() || [];
    } catch (error) {
      console.error("RICO SUB LIST ERROR:", error);
    }

    res.json({
      success: true,
      totalInstalls: stats.totalInstalls || 0,
      installsToday: stats.installsByDay?.[today()] || 0,
      installed: list.length,
      connected: list.filter(bot => bot?.connected).length,
      installLimit: global.db?.settings?.installLimit ?? 10,
      maintenance: Boolean(global.db?.settings?.maintenance)
    });
  } catch (error) {
    console.error("RICO STATS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "تعذر جلب الإحصائيات."
    });
  }
});

// إعدادات المطور
app.post("/api/admin/settings", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(401).json({
        success: false,
        message: "جلسة المطور غير صالحة."
      });
    }

    const limit = Number(req.body?.installLimit);

    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      return res.status(400).json({
        success: false,
        message: "حد التنصيب غير صحيح."
      });
    }

    global.db.settings ||= {};
    global.db.settings.installLimit = limit;

    if (typeof req.body.maintenance === "boolean") {
      global.db.settings.maintenance = req.body.maintenance;
    }

    await save();
    res.json({ success: true, message: "تم حفظ الإعدادات." });
  } catch (error) {
    console.error("RICO SETTINGS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "تعذر حفظ الإعدادات."
    });
  }
});

// طلب الاقتران
app.post("/api/pair", async (req, res) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");

  if (global.db?.settings?.maintenance) {
    return res.status(503).json({
      success: false,
      message: "المنصة تحت الصيانة حالياً."
    });
  }

  if (!validPhone(phone)) {
    return res.status(400).json({
      success: false,
      message: "رقم الهاتف غير صحيح."
    });
  }

  if (!rateLimit(req.ip || "unknown")) {
    return res.status(429).json({
      success: false,
      message: "محاولات كثيرة. حاول بعد فترة."
    });
  }

  if (pending.has(phone)) {
    return res.status(409).json({
      success: false,
      message: "يوجد طلب اقتران جارٍ لهذا الرقم."
    });
  }

  pending.add(phone);

  try {
    const subs = getSubs();

    if (!subs) {
      return res.status(503).json({
        success: false,
        message: "نظام البوتات الفرعية لم يبدأ. تحقق من تشغيله."
      });
    }

    const existing = await subs.get(phone);

    if (existing) {
      return res.status(409).json({
        success: false,
        message: existing.connected
          ? "هذا الرقم متصل بالفعل."
          : "توجد جلسة سابقة لهذا الرقم. افصلها أولاً."
      });
    }

    const list = await subs.list();
    const limit = Number(global.db?.settings?.installLimit ?? 10);

    if (list.length >= limit) {
      return res.status(403).json({
        success: false,
        message: `وصلنا للحد الأقصى للتنصيب (${limit}).`
      });
    }

    const code = await subs.addBot(phone);

    if (!code || typeof code !== "string") {
      return res.status(500).json({
        success: false,
        message: "نظام البوتات لم يرجع كود اقتران صالحاً."
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, phone);

    res.json({
      success: true,
      code,
      token,
      message: "تم تجهيز كود الاقتران."
    });
  } catch (error) {
    console.error("RICO PAIR ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: `فشل التنصيب: ${String(error?.message || "خطأ غير معروف").slice(0, 180)}`
      });
    }
  } finally {
    pending.delete(phone);
  }
});

// حالة الاتصال
app.get("/api/my/status", async (req, res) => {
  try {
    const phone = getPhone(req);

    if (!phone) {
      return res.status(401).json({
        success: false,
        message: "الجلسة غير صالحة."
      });
    }

    const bot = await getSubs()?.get(phone);

    res.json({
      success: true,
      connected: Boolean(bot?.connected)
    });
  } catch (error) {
    console.error("RICO STATUS ERROR:", error);
    res.status(500).json({
      success: false,
      message: "تعذر جلب حالة الاتصال."
    });
  }
});

// قطع الاتصال
app.post("/api/my/disconnect", async (req, res) => {
  try {
    const token = getToken(req);
    const phone = sessions.get(token);

    if (!phone) {
      return res.status(401).json({
        success: false,
        message: "الجلسة غير صالحة."
      });
    }

    const subs = getSubs();

    if (!subs) {
      return res.status(503).json({
        success: false,
        message: "نظام البوتات غير متاح."
      });
    }

    await subs.remove(phone);
    sessions.delete(token);

    res.json({
      success: true,
      message: "تم فصل الجلسة."
    });
  } catch (error) {
    console.error("RICO DISCONNECT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "تعذر فصل الاتصال."
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

export function startWebServer() {
  if (webServer) return Promise.resolve(webServer);

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, "0.0.0.0", () => {
      webServer = server;
      console.log(`RICO BOT running on port ${PORT}`);
      resolve(server);
    });

    server.once("error", reject);
  });
}
