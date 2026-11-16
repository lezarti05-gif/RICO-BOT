
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
const getToken = req => {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};
const getPhone = req => sessions.get(getToken(req));

function validPhone(phone) {
  return /^\d{8,15}$/.test(phone);
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

function admin(req) {
  const token = getToken(req);
  const expiry = adminSessions.get(token);

  if (!expiry || expiry < Date.now()) {
    adminSessions.delete(token);
    return false;
  }

  return true;
}

function save() {
  return global.saveDB?.() ?? Promise.resolve(false);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    name: "RICO BOT",
    status: "running"
  });
});

// تسجيل الدخول الأولي للمطور
app.post("/api/admin/login", async (req, res) => {
  const password = String(req.body?.password || "");
  const savedHash = global.db.admin?.passwordHash;
  const initial = process.env.RICO_ADMIN_INITIAL_PASSWORD;

  if (!savedHash && !initial) {
    return res.status(503).json({
      success: false,
      message: "أضف RICO_ADMIN_INITIAL_PASSWORD في إعدادات Render."
    });
  }

  let valid = false;

  if (savedHash) {
    const hash = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    valid = hash === savedHash;
  } else {
    valid = password === initial;
  }

  if (!valid) {
    return res.status(401).json({
      success: false,
      message: "كلمة المرور غير صحيحة."
    });
  }

  if (!savedHash) {
    global.db.admin = {
      passwordHash: crypto.createHash("sha256")
        .update(password)
        .digest("hex"),
      createdAt: new Date().toISOString()
    };
    await save();
  }

  const token = crypto.randomBytes(32).toString("hex");
  adminSessions.set(token, Date.now() + 12 * 60 * 60 * 1000);

  res.json({ success: true, token });
});

// تغيير كلمة مرور المطور
app.post("/api/admin/password", async (req, res) => {
  if (!admin(req)) {
    return res.status(401).json({ success: false });
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
});

// إحصائيات لوحة المطور
app.get("/api/admin/stats", async (req, res) => {
  if (!admin(req)) {
    return res.status(401).json({ success: false });
  }

  const stats = global.db.stats || {};
  const subs = getSubs();
  let connected = 0;
  let installed = 0;

  try {
    const list = await subs?.list?.() || [];
    installed = list.length;
    connected = list.filter(bot => bot?.connected).length;
  } catch (error) {
    console.error("RICO STATS ERROR:", error);
  }

  res.json({
    success: true,
    totalInstalls: stats.totalInstalls || 0,
    installsToday: stats.installsByDay?.[today()] || 0,
    installed,
    connected,
    installLimit: global.db.settings?.installLimit ?? 10,
    maintenance: Boolean(global.db.settings?.maintenance)
  });
});

// تعديل حد التنصيب
app.post("/api/admin/settings", async (req, res) => {
  if (!admin(req)) {
    return res.status(401).json({ success: false });
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

  res.json({ success: true });
});

// إنشاء كود الاقتران
app.post("/api/pair", async (req, res) => {
  if (global.db.settings?.maintenance) {
    return res.status(503).json({
      success: false,
      message: "المنصة تحت الصيانة حالياً."
    });
  }

  const phone = String(req.body?.phone || "").replace(/\D/g, "");

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

  const subs = getSubs();

  if (!subs) {
    return res.status(503).json({
      success: false,
      message: "نظام البوتات الفرعية لم يبدأ بعد."
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
    const limit = Number(global.db.settings?.installLimit ?? 10);

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
        message: "لم يتم إنشاء كود الاقتران."
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, phone);

    return res.json({
      success: true,
      code,
      token,
      message: "تم تجهيز كود الاقتران."
    });

  } catch (error) {
    console.error("RICO PAIR ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "تعذر تجهيز كود الاقتران."
    });
  } finally {
    pending.delete(phone);
  }
});

// حالة الاتصال
app.get("/api/my/status", async (req, res) => {
  const phone = getPhone(req);

  if (!phone) {
    return res.status(401).json({
      success: false,
      message: "الجلسة غير صالحة."
    });
  }

  try {
    const bot = await getSubs()?.get(phone);

    res.json({
      success: true,
      connected: Boolean(bot?.connected)
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "تعذر جلب حالة الاتصال."
    });
  }
});

// قطع الاتصال
app.post("/api/my/disconnect", async (req, res) => {
  const token = getToken(req);
  const phone = sessions.get(token);

  if (!phone) {
    return res.status(401).json({
      success: false,
      message: "الجلسة غير صالحة."
    });
  }

  try {
    await getSubs().remove(phone);
    sessions.delete(token);

    res.json({
      success: true,
      message: "تم فصل الجلسة."
    });
  } catch {
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
