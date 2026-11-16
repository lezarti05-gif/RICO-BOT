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

let webServer;

function getSubs() {
  return globalThis.subBots;
}

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

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function getPhone(req) {
  return sessions.get(getToken(req));
}

app.get("/api/status", (req, res) => {
  res.json({
    success: true,
    name: "RICO BOT",
    status: "running"
  });
});

// إنشاء كود الاقتران
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

    // يجب أن يكون الرقم ملكك أو لديك موافقة صاحبه.
    const code = await subs.addBot(phone);

    if (!code || typeof code !== "string") {
      return res.status(500).json({
        success: false,
        message: "لم يتم إنشاء كود الاقتران."
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, phone);

    // يرجع الكود لصاحب هذا الطلب فقط.
    return res.json({
      success: true,
      code,
      token,
      message: "تم تجهيز كود الاقتران."
    });

  } catch (error) {
    console.error("RICO PAIR ERROR:", error.message);

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
    const subs = getSubs();
    const bot = await subs?.get(phone);

    return res.json({
      success: true,
      connected: Boolean(bot?.connected)
    });

  } catch (error) {
    console.error("RICO STATUS ERROR:", error.message);

    return res.status(500).json({
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
    const subs = getSubs();

    if (!subs) {
      return res.status(503).json({
        success: false,
        message: "نظام البوتات غير متاح."
      });
    }

    await subs.remove(phone);
    sessions.delete(token);

    return res.json({
      success: true,
      message: "تم فصل الجلسة."
    });

  } catch (error) {
    console.error("RICO DISCONNECT ERROR:", error.message);

    return res.status(500).json({
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
