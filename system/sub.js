
import { SubBots } from "meowsab";

export let subs;

let starting = false;
let startPromise = null;

export async function subBots(client) {
  if (subs) return subs;

  if (startPromise) {
    return await startPromise;
  }

  starting = true;

  startPromise = (async () => {
    try {
      console.log("Starting RICO SubBots...");

      const manager = new SubBots({
        root: "./sub",
        storage: "auto",
        code: process.env.SUB_BOT_CODE || "VII71234",
        main: client,
        settings: {},
      });

      manager.on("ready", (sock) => {
        console.log(
          "RICO SubBot ready:",
          sock?.user?.id || "Unknown user"
        );
      });

      manager.on("error", (error) => {
        console.error("RICO SubBot ERROR:", error);
      });

      await manager.start();

      if (!manager) {
        throw new Error("SubBots manager was not created.");
      }

      subs = manager;
      globalThis.subBots = manager;

      console.log("RICO SubBots system started successfully.");

      return manager;

    } catch (error) {
      subs = undefined;
      globalThis.subBots = undefined;

      console.error(
        "RICO SubBots startup error:",
        error?.stack || error
      );

      throw error;

    } finally {
      starting = false;
      startPromise = null;
    }
  })();

  return await startPromise;
}
