import { startWebServer } from "./server.js";

import { Client } from "meowsab";
import { subBots } from "./system/sub.js";
import "meowsab/safe";
import "./system/database.js";
import * as baileys from "baileys";
import notifications from "./system/notifications.js";

/* ========== RICO BOT CONFIG ========== */

const client = new Client({
  plugsdir: "plugins",
  prefix: [".", "!"],

  library: [baileys],

  sessionStorage: {
    type: "sqlite",
    path: "./session",
  },

  login: {
    method: "pair",
    number: process.env.BOT_NUMBER || "",
    code: process.env.BOT_CODE || "",
  },

  owners: process.env.OWNERS
    ? process.env.OWNERS.split(",").map(number => ({
        jid: `${number.trim()}@s.whatsapp.net`,
      }))
    : [],

  settings: {
    message_owner_only: false,
    private_mode: false,
    message_group_only: false,
    no_message_baileys: false,
    from_me: false,
  },
});

/* ========== BOT INFO ========== */

const { config } = client;

config.info = {
  nameBot: "RICO BOT",
  title: "RICO BOT | WhatsApp Bot Platform",

  channel: {
    isForwarded: true,
    forwardingScore: 1,
    forwardedNewsletterMessageInfo: {
      newsletterJid: "120363225356834044@newsletter",
      newsletterName: "RICO BOT",
      serverMessageId: 0,
    },
  },

  newsletter: {
    name: "RICO BOT",
    jid: "120363225356834044@newsletter",
  },

  images: [
    "https://raw.githubusercontent.com/MohamedVex/Lora-Upload1/main/uploads/1791910619812.jpg",
    "https://raw.githubusercontent.com/MohamedVex/Lora-Upload1/main/uploads/1791910652175.jpg",
    "https://raw.githubusercontent.com/MohamedVex/Lora-Upload1/main/uploads/1791910673893.jpg",
    "https://raw.githubusercontent.com/MohamedVex/Lora-Upload1/main/uploads/1791910702904.jpg",
  ],
};

/* ========== ERROR HANDLING ========== */

client.on("error", (err) => {
  console.error("RICO BOT ERROR:", err);
});

/* ========== NOTIFICATIONS ========== */

const plugins = client.plug();
plugins.notification(notifications);

/* ========== START ========== */

async function start() {
  try {
    console.log("Starting RICO BOT...");

    await client.connect();
    console.log("Main bot started.");

    await subBots(client);
    console.log("SubBots system started.");

    await startWebServer();
    console.log("RICO Web Platform started.");

    console.log("RICO BOT is ready.");
  } catch (error) {
    console.error("Startup error:", error);
    process.exitCode = 1;
  }
}

start();
