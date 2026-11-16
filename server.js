
import express from "express";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 10000;
const INITIAL_ADMIN_CODE = "RICO-START-7319";
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

async function save() {
  if (typeof global.saveDB !== "function") {
    throw new Error("Database save function is unavailable.");
  }

  const result = await global.saveDB();

  if (result === false) {
    throw new Error("Database could not save changes.");
  }
}

function makePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password, savedHash) {
  if (!savedHash || typeof savedHash !== "string") return false;

  const parts = savedHash.split(":");
  if (parts.length !== 2) return false;

  const [salt, storedHash] = parts;

  try {
    const hash = crypto.scryptSync(password, salt, 64);
    const stored = Buffer.from(storedHash, "hex");

    return stored.length === hash.length &&
      crypto.timingSafeEqual(hash, stored);
  } catch {
    return false;
  }
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

function createAdminSession(res) {
  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  res.json({ success: true, token });
}

// أخطاء الطلبات
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

// حالة المنصة
app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    name: "RICO BOT",
    status: "running",
    subBotsReady: Boolean(getSubs()),
    adminActivated: Boolean(global.db?.admin?.passwordHash)
  });
});

// حالة إعداد لوحة المطور
app.get("/api/admin/setup-status", (req, res) => {
  res.json({
    success: true,
    activated: Boolean(global.db?.admin?.passwordHash)
  });
});

// التفعيل الأولي - يُستخدم مرة واحدة فقط
app.post("/api/admin/activate", async (req, res) => {
  try {
    if (global.db?.admin?.passwordHash) {
      return res.status(403).json({
        success: false,
        message: "تم تفعيل لوحة المطور مسبقاً. استخدم كلمة مرورك."
      });
    }

    const activationCode = String(req.body?.activationCode || "");
    const newPassword = String(req.body?.newPassword || "");

    if (activationCode !== INITIAL_ADMIN_CODE) {
      return res.status(401).json({
        success: false,
        message: "كود التفعيل الأولي غير صحيح."
      });
    }

    if (newPassword.length < 10 || newPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون بين 10 و128 حرفاً."
      });
    }

    global.db.admin = {
      passwordHash: makePasswordHash(newPassword),
      activatedAt: new Date().toISOString()
    };

    await save();

    console.log("RICO developer dashboard activated.");

    createAdminSession(res);
  } catch (error) {
    console.error("RICO ADMIN ACTIVATION ERROR:", error);

    res.status(500).json({
      success: false,
      message: "تعذر تفعيل لوحة المطور أو حفظ كلمة المرور."
    });
  }
});

// تسجيل دخول المطور بعد التفعيل
app.post("/api/admin/login", (req, res) => {
  try {
    const password = String(req.body?.password || "");
    const savedHash = global.db?.admin?.passwordHash;

    if (!savedHash) {
      return res.status(403).json({
        success: false,
        needsActivation: true,
        message: "يجب تفعيل لوحة المطور أولاً."
      });
    }

    if (!checkPassword(password, savedHash)) {
      return res.status(401).json({
        success: false,
        message: "كلمة المرور غير صحيحة."
      });
    }

    createAdminSession(res);
  } catch (error) {
    console.error("RICO ADMIN LOGIN ERROR:", error);

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

    if (password.length < 10 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "كلمة المرور يجب أن تكون بين 10 و128 حرفاً."
      });
    }

    global.db.admin.passwordHash = makePasswordHash(password);
    global.db.admin.updatedAt = new Date().toISOString();

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

// تسجيل خروج المطور
app.post("/api/admin/logout", (req, res) => {
  adminSessions.delete(getToken(req));
  res.json({ success: true, message: "تم تسجيل الخروج." });
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

    res.json({
      success: true,
      message: "تم حفظ الإعدادات."
    });
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
        message: "نظام البوتات الفرعية لم يبدأ."
      });
    }

    if (
      typeof subs.get !== "function" ||
      typeof subs.list !== "function" ||
      typeof subs.addBot !== "function"
    ) {
      throw new Error("دوال إدارة الجلسات غير متوفرة.");
    }

    const existing = await subs.get(phone);

    if (existing) {
      return res.status(409).json({
        success: false,
        message: existing.connected
          ? "هذا الرقم متصل بالفعل."
          : "توجد جلسة سابقة لهذا الرقم."
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
      throw new Error("لم يتم إنشاء كود اقتران صالح.");
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, phone);

    global.db.stats ||= {};
    global.db.stats.totalInstalls =
      (global.db.stats.totalInstalls || 0) + 1;

    global.db.stats.installsByDay ||= {};
    global.db.stats.installsByDay[today()] =
      (global.db.stats.installsByDay[today()] || 0) + 1;

    await save();

    res.json({
      success: true,
      code,
      token,
      message: "تم تجهيز كود الاقتران."
    });
  } catch (error) {
    console.error("RICO PAIR ERROR:", error);

    res.status(500).json({
      success: false,
      message: "فشل التنصيب. راجع سجل الخادم."
    });
  } finally {
    pending.delete(phone);
  }
});

// حالة اتصال المستخدم
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

// قطع اتصال المستخدم
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

    if (!subs || typeof subs.remove !== "function") {
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

// الصفحة الرئيسية
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
