import { SubBots } from "meowsab";

export let subs;

export async function subBots(client) {
  if (subs) return subs;

  subs = new SubBots({
    root: "./sub",
    storage: "auto",
    code: process.env.SUB_BOT_CODE || "VII71234",
    main: client,
    settings: {},
  });

  globalThis.subBots = subs;

  subs.on("ready", (sock) => {
    console.log("RICO SubBot ready:", sock.user?.id);
  });

  await subs.start();

  return subs;
}
