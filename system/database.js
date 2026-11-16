import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync
} from "node:fs";

import path from "node:path";

const DB_DIR = "./system";
const DB_FILE = path.join(DB_DIR, "database.json");
const TEMP_FILE = path.join(DB_DIR, "database.tmp");

if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

if (!existsSync(DB_FILE)) {
  writeFileSync(DB_FILE, JSON.stringify({}, null, 2));
}

let database;

try {
  database = JSON.parse(readFileSync(DB_FILE, "utf8"));
} catch (error) {
  console.error("RICO DATABASE ERROR:", error);
  throw new Error("تعذر قراءة قاعدة البيانات. احتفظ بنسخة احتياطية وافحص database.json.");
}

if (!database || typeof database !== "object" || Array.isArray(database)) {
  throw new Error("صيغة قاعدة البيانات غير صحيحة.");
}

global.db = database;

// الإعدادات الافتراضية مع الحفاظ على الإعدادات القديمة
global.db.settings ||= {};
global.db.settings.installLimit ??= 10;

// حفظ آمن للبيانات
global.saveDB = () => {
  try {
    writeFileSync(
      TEMP_FILE,
      JSON.stringify(global.db, null, 2),
      "utf8"
    );

    renameSync(TEMP_FILE, DB_FILE);
    return true;
  } catch (error) {
    console.error("RICO DATABASE SAVE ERROR:", error);
    return false;
  }
};

console.log("RICO Database loaded successfully.");
