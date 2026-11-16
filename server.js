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

// رموز وصول مؤقتة تربط المتصفح برقمه
const sessions = new Map();
const requests = new Map();
const pending = new Set();

function getSubs() {
  return globalThis.subBots;
}

function validPhone(phone) {
  return /^\d{8,15}$/.test(phone);
}

function rateLimit(ip) {
  const now = Date.now();
  const old = requests.get(ip) || [];
  const recent = old.filter(t => now - t < 10 * 60 * 1000);

  if (recent.length >= 3) return false;

  recent.push(now);
  requests.set(ip, recent);
  return true;
}

function getSession(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  return sessions.get(token);
}

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    name: "RICO BOT",
    status: "running"
  });
});

// طلب كود الاقتران
app.post("/api/pair", async (req, res) => {
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

    if (existing?.connected) {
      return res.status(409).json({
        success: false,
        message: "هذا الرقم متصل بالفعل."
      });
    }

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "توجد جلسة سابقة لهذا الرقم. افصلها أولاً."
      });
    }

    // استخدم الخدمة لرقمك أو رقم صاحبه وافق على الربط فقط
    const code = await subs.addBot(phone);

    if (!code || typeof code !== "string") {
      return res.status(500).json({
        success: false,
        message: "لم يتم إنشاء كود الاقتران."
      });
    }

    const token = crypto.randomBytes(32).toString("hex");

    // لا نخزن كود الاقتران في قاعدة البيانات أو السجلات
    sessions.set(token, phone);

    return res.json({
      success: true,
      code,
      token,
      message: "تم تجهيز كود الاقتران."
    });

  } catch (error) {
    console.error("Pairing request failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر تجهيز كود الاقتران."
    });
  } finally {
    pending.delete(phone);
  }
});

// حالة رقم صاحب رمز الوصول فقط
app.get("/api/my/status", async (req, res) => {
  const phone = getSession(req);

  if (!phone) {
    return res.status(401).json({
      success: false,
      message: "انتهت صلاحية الجلسة."
    });
  }

  try {
    const bot = await getSubs()?.get(phone);

    return res.json({
      success: true,
      connected: Boolean(bot?.connected)
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "تعذر جلب الحالة."
    });
  }
});

// فصل جلسة صاحب رمز الوصول فقط
app.post("/api/my/disconnect", async (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

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

    return res.json({
      success: true,
      message: "تم فصل الجلسة."
    });
  } catch (error) {
    console.error("Disconnect failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "تعذر فصل الجلسة."
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

export function startWebServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`RICO BOT running on port ${PORT}`);
      resolve(server);
    });

    server.once("error", reject);
  });
}
