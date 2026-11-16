import { SubBots } from "meowsab";

export let subs;
let starting = false;

export async function subBots(client) {
  if (subs) return subs;

  if (starting) {
    while (starting) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (subs) return subs;
  }

  starting = true;

  try {
    const manager = new SubBots({
      root: "./sub",
      storage: "auto",
      code: process.env.SUB_BOT_CODE || "VII71234",
      main: client,
      settings: {},
    });

    manager.on("ready", (sock) => {
      console.log("RICO SubBot ready:", sock.user?.id);
    });

    await manager.start();

    subs = manager;
    globalThis.subBots = manager;

    console.log("RICO SubBots system started.");

    return subs;
  } catch (error) {
    subs = undefined;
    globalThis.subBots = undefined;
    console.error("RICO SubBots startup error:", error);
    throw error;
  } finally {
    starting = false;
  }
}
