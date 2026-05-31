import { Client, GatewayIntentBits, Events, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import * as widgetCommand from "./commands/widget.js";

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "";
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";

const commandsMap = new Map<string, any>();
commandsMap.set(widgetCommand.data.name, widgetCommand);

async function registerCommands() {
  if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
    console.error("[Bot] Missing DISCORD_TOKEN or DISCORD_CLIENT_ID to register commands.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  const body = Array.from(commandsMap.values()).map((cmd) => cmd.data.toJSON());

  try {
    console.log("[Bot] Registering application (/) commands...");
    await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), { body });
    console.log("[Bot] Successfully registered application (/) commands.");
  } catch (error) {
    console.error("[Bot] Failed to register commands:", error);
  }
}

export async function startBot(): Promise<void> {
  if (!DISCORD_TOKEN) {
    console.warn("[Bot] DISCORD_TOKEN not set. The bot will not start.");
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[Bot] Logged in as ${c.user.tag}`);
    await registerCommands();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandsMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[Bot] Error executing /${interaction.commandName}:`, error);
      const replyOptions = {
        content: "There was an error while executing this command!",
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(replyOptions);
      } else {
        await interaction.reply(replyOptions);
      }
    }
  });

  await client.login(DISCORD_TOKEN);
}

const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").endsWith("bot/index.ts") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("bot/index.js");

if (isDirectRun) {
  startBot().catch((err) => {
    console.error("[Bot] Fatal error:", err);
    process.exit(1);
  });
}
