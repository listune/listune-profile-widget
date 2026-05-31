import dotenv from "dotenv";
dotenv.config();

import { initJsonStore } from "./database/store.js";
import { startServer } from "./api/server.js";
import { startBot } from "./bot/index.js";

async function main() {
  console.log("─────────────────────────────────────────");
  console.log("  Listune Profile Widget");
  console.log("─────────────────────────────────────────");

  try {
    await initJsonStore();
  } catch (err) {
    console.error("[Init] Failed to initialize storage:", err);
    console.warn("[Init] Continuing anyway — some features may not work.");
  }

  try {
    await startServer();
  } catch (err) {
    console.error("[Init] Failed to start HTTP server:", err);
  }

  try {
    await startBot();
  } catch (err) {
    console.error("[Init] Failed to start Discord bot:", err);
  }

  console.log("─────────────────────────────────────────");
  console.log("  All services started.");
  console.log("─────────────────────────────────────────");
}

main().catch((err) => {
  console.error("[Fatal] Unrecoverable startup error:", err);
  process.exit(1);
});
