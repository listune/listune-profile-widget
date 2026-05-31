import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  getUserAccount,
  updateUserAccount,
  deleteUserAccount,
} from "../../database/store.js";
import {
  patchApplicationIdentityProfile,
  refreshOAuthToken,
} from "../../services/discord.service.js";
import { DynamicDataType } from "../../types/widget.types.js";
import {
  getListuneUserStats,
  checkApiHealth,
} from "../../services/listune.service.js";
import type { NormalizedListuneStats } from "../../services/listune.service.js";
import { WIDGET_MAPPING } from "../../config/widget-layout.js";
import { formatMemberSince } from "../../utils/date.js";

dotenv.config();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "";
const WIDGET_BOT_AVATAR_URL =
  process.env.WIDGET_BOT_AVATAR_URL ||
  "https://listune.app/android-chrome-512x512.png";

const OAUTH_LINK = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
  DISCORD_CLIENT_ID
)}&response_type=code&redirect_uri=${encodeURIComponent(
  DISCORD_REDIRECT_URI
)}&scope=openid+sdk.social_layer`;


function isValidSnowflake(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

export const data = new SlashCommandBuilder()
  .setName("widget")
  .setDescription("Manage your Listune profile widget")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription(
        "Link your Discord account and set up the Listune profile widget"
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("refresh")
      .setDescription(
        "Refresh your Listune stats on your Discord profile card"
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("Show your widget link status and info")
  )
  .addSubcommand((sub) =>
    sub
      .setName("disconnect")
      .setDescription("Remove your Listune widget link")
  )
  .addSubcommand((sub) =>
    sub
      .setName("image")
      .setDescription("Set a custom image for your profile widget")
      .addStringOption((opt) =>
        opt
          .setName("url")
          .setDescription("Direct URL to a PNG, JPG, or GIF image")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("scripts")
      .setDescription("Get the browser console script to add the widget to your profile layout")
  );

function buildWidgetPayload(
  stats: NormalizedListuneStats,
  externalAccountId: string,
  customImage?: string
) {
  return {
    username: "Listune",
    metadata: {},
    data: {
      primary: {
        server_name: "Listune",
        user_id: externalAccountId,
        rank_name: stats.topTrack,
        highest_rank: stats.topArtist,
        playtime_hours: parseListenTimeToHours(stats.listenTime),
        total_wins: stats.tracksPlayed,
        total_games: stats.likedSongs,
      },
      dynamic: [
        {
          type: DynamicDataType.IMAGE,
          name: WIDGET_MAPPING.AVATAR_PRIMARY,
          value: { url: customImage || stats.userAvatarUrl || WIDGET_BOT_AVATAR_URL },
        },
        {
          type: DynamicDataType.IMAGE,
          name: WIDGET_MAPPING.AVATAR_ICON,
          value: { url: customImage || stats.userAvatarUrl || WIDGET_BOT_AVATAR_URL },
        },
        {
          type: DynamicDataType.IMAGE,
          name: WIDGET_MAPPING.AVATAR_PREVIEW,
          value: { url: customImage || stats.userAvatarUrl || WIDGET_BOT_AVATAR_URL },
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.PREVIEW_TEXT,
          value: "Your Music, Your Taste",
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.MINI_TEXT,
          value: "Your Music, Your Taste",
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.ACTIVITY_TEXT,
          value: "Listune",
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.DISPLAY_NAME,
          value: stats.displayName,
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.USERNAME,
          value: `@${stats.username}`,
        },
        // Top Track
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.TOP_TRACK_VALUE,
          value: stats.topTrack,
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.TOP_TRACK_LABEL,
          value: "Top Track",
        },
        // Top Artist
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.TOP_ARTIST_VALUE,
          value: stats.topArtist,
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.TOP_ARTIST_LABEL,
          value: "Top Artist",
        },
        // Tracks Played
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.TRACKS_PLAYED_VALUE,
          value: stats.tracksPlayed.toString(),
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.TRACKS_PLAYED_LABEL,
          value: "Tracks Played",
        },
        // Listen Time
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.LISTEN_TIME_VALUE,
          value: stats.listenTime,
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.LISTEN_TIME_LABEL,
          value: "Listen Time",
        },
        // Liked Songs
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.LIKED_SONGS_VALUE,
          value: stats.likedSongs.toString(),
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.LIKED_SONGS_LABEL,
          value: "Liked Songs",
        },
        // Member Since
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.MEMBER_SINCE_VALUE,
          value: formatMemberSince(stats.memberSince),
        },
        {
          type: DynamicDataType.TEXT,
          name: WIDGET_MAPPING.MEMBER_SINCE_LABEL,
          value: "Member Since",
        },
      ],
    },
  };
}


function parseListenTimeToHours(listenTime: string): number {
  const hMatch = listenTime.match(/(\d+)h/);
  const mMatch = listenTime.match(/(\d+)m/);
  const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
  const minutes = mMatch ? parseInt(mMatch[1], 10) : 0;
  return Math.round((hours + minutes / 60) * 10) / 10;
}

async function handleSetImage(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const account = await getUserAccount(userId);

  if (!account || !account.discordOAuth) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Not Linked")
      .setDescription("You must link your account first using `/widget setup`.")
      .setColor(0xff0000);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const url = interaction.options.getString("url", true);
  
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    const embed = new EmbedBuilder()
      .setTitle("❌ Invalid URL")
      .setDescription("Please provide a valid image URL starting with http:// or https://")
      .setColor(0xff0000);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  await updateUserAccount(userId, { customImage: url });

  const embed = new EmbedBuilder()
    .setTitle("✅ Custom Image Set")
    .setDescription("Your profile widget will now use this image. Running `/widget refresh` to update...")
    .setColor(0x00c853)
    .setImage(url);

  await interaction.editReply({ embeds: [embed] });

  await handleRefresh(interaction, true);
}

async function handleSetup(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const targetUserId = interaction.user.id;

  const state = encodeURIComponent(targetUserId);
  const url = `${OAUTH_LINK}&state=${state}`;

  const embed = new EmbedBuilder()
    .setTitle("🎵 Listune Widget Setup")
    .setDescription(
      "Click the button below to link your Discord account and display your **Listune** music stats directly on your profile card!\n\n" +
      "After linking, run `/widget scripts` to get the installation script, then run `/widget refresh` to update your profile."
    )
    .setColor(0x5865f2)
    .setThumbnail(WIDGET_BOT_AVATAR_URL)
    .setFooter({ text: "Listune • Music Stats Widget" });

  const button = new ButtonBuilder()
    .setLabel("Link Account")
    .setStyle(ButtonStyle.Link)
    .setURL(url);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

async function handleScript(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const scriptContent = fs.readFileSync(path.join(process.cwd(), "src/config/script.js"), "utf8");

  const embed = new EmbedBuilder()
    .setTitle("🛠️ Widget Installation Script")
    .setDescription(
      "Copy the script below and run it in your browser console on the Discord Web app (F12 > Console) to pin the widget to your profile.\n\n" +
      "```javascript\n" + scriptContent + "\n```"
    )
    .setColor(0x5865f2);

  await interaction.editReply({ embeds: [embed] });
}

async function handleRefresh(
  interaction: ChatInputCommandInteraction,
  isFromImageUpdate: boolean = false
): Promise<void> {
  const userId = interaction.user.id;

  const account = await getUserAccount(userId);
  if (!account || !account.discordOAuth) {
    if (!isFromImageUpdate) {
      const embed = new EmbedBuilder()
        .setTitle("No Linked Account")
        .setDescription(
          "You need to link your account first. Run `/widget setup` to get started."
        )
        .setColor(0xff0000);
      await interaction.editReply({ embeds: [embed] });
    }
    return;
  }

  const oauth = account.discordOAuth;

  if (Date.now() >= oauth.expiresAt) {
    try {
      console.log(`[Widget] Refreshing Discord OAuth token for user: ${userId}`);
      const newTokens = await refreshOAuthToken(oauth.refreshToken);
      await updateUserAccount(userId, { discordOAuth: newTokens });
    } catch (refreshErr) {
      console.error(`[Widget] Token refresh failed for ${userId}:`, refreshErr);
      const embed = new EmbedBuilder()
        .setTitle("Re-authentication Required")
        .setDescription(
          "Your Discord authentication has expired and could not be auto-refreshed. Please run `/widget setup` again."
        )
        .setColor(0xffaa00);
      await interaction.editReply({ embeds: [embed] });
      return;
    }
  }

  try {
    const externalAccountId =
      account.externalAccountId || `EXT-${userId.slice(-8)}`;
    const listuneStats = await getListuneUserStats(userId);
    if (!listuneStats) {
      const embed = new EmbedBuilder()
        .setTitle("API Error")
        .setDescription(
          "Could not fetch your Listune stats right now. Make sure you have used the Listune bot before."
        )
        .setColor(0xffaa00);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const discordUser = interaction.user;
    if (listuneStats.displayName === "Listune User") {
      listuneStats.displayName =
        discordUser.globalName || discordUser.displayName || discordUser.username;
    }
    if (listuneStats.username === userId) {
      listuneStats.username = discordUser.username;
    }
    if (!listuneStats.userAvatarUrl) {
      listuneStats.userAvatarUrl = discordUser.displayAvatarURL({ size: 256 });
    }
    const payload = buildWidgetPayload(listuneStats, externalAccountId, account.customImage);
    const success = await patchApplicationIdentityProfile(
      userId,
      externalAccountId,
      payload
    );
    if (success) {
      await updateUserAccount(userId, {
        lastRefreshAt: new Date().toISOString(),
      });

      if (!isFromImageUpdate) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Profile Card Updated")
          .setDescription(
            "Your Listune music stats have been refreshed on your Discord profile!"
          )
          .setColor(0x00c853)
          .setThumbnail(WIDGET_BOT_AVATAR_URL)
          .addFields(
            {
              name: "🎵 Top Track",
              value: listuneStats.topTrack,
              inline: true,
            },
            {
              name: "🎤 Top Artist",
              value: listuneStats.topArtist,
              inline: true,
            },
            {
              name: "🎧 Tracks Played",
              value: String(listuneStats.tracksPlayed),
              inline: true,
            },
            {
              name: "⏱️ Listen Time",
              value: listuneStats.listenTime,
              inline: true,
            },
            {
              name: "❤️ Liked Songs",
              value: String(listuneStats.likedSongs),
              inline: true,
            },
            {
              name: "⭐ Member Since",
              value: formatMemberSince(listuneStats.memberSince),
              inline: true,
            }
          )
          .setFooter({ text: "Listune • Music Stats Widget" });

        await interaction.editReply({ embeds: [embed] });
      }
    } else {
      throw new Error("Discord API update returned unsuccessful status.");
    }
  } catch (err: any) {
    console.error("[Widget] Refresh failed:", err);
    if (!isFromImageUpdate) {
      const embed = new EmbedBuilder()
        .setTitle("Refresh Failed")
        .setDescription(
          `Failed to update your profile widget:\n\`\`\`\n${err?.message || err}\n\`\`\``
        )
        .setColor(0xff0000);
      await interaction.editReply({ embeds: [embed] });
    }
  }
}

async function handleStatus(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const userId = interaction.user.id;
  const account = await getUserAccount(userId);

  const apiReachable = await checkApiHealth();

  if (!account || !account.discordOAuth) {
    const embed = new EmbedBuilder()
      .setTitle("📊 Widget Status")
      .setDescription("You have not linked your account yet.")
      .setColor(0x9e9e9e)
      .addFields(
        { name: "Linked", value: "❌ No", inline: true },
        {
          name: "API Status",
          value: apiReachable ? "✅ Online" : "❌ Offline",
          inline: true,
        }
      )
      .setFooter({ text: "Run /widget setup to get started" });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📊 Widget Status")
    .setColor(0x5865f2)
    .setThumbnail(WIDGET_BOT_AVATAR_URL)
    .addFields(
      { name: "Linked", value: "✅ Yes", inline: true },
      { name: "User ID", value: `\`${userId}\``, inline: true },
      {
        name: "External ID",
        value: `\`${account.externalAccountId || "N/A"}\``,
        inline: true,
      },
      {
        name: "Last Refresh",
        value: account.lastRefreshAt
          ? `<t:${Math.floor(new Date(account.lastRefreshAt).getTime() / 1000)}:R>`
          : "Never",
        inline: true,
      },
      {
        name: "OAuth Expires",
        value: account.discordOAuth.expiresAt
          ? `<t:${Math.floor(account.discordOAuth.expiresAt / 1000)}:R>`
          : "Unknown",
        inline: true,
      },
      {
        name: "API Status",
        value: apiReachable ? "✅ Online" : "❌ Offline",
        inline: true,
      }
    )
    .setFooter({ text: "Listune • Music Stats Widget" });

  await interaction.editReply({ embeds: [embed] });
}

async function handleDisconnect(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const userId = interaction.user.id;
  const account = await getUserAccount(userId);

  if (!account) {
    const embed = new EmbedBuilder()
      .setTitle("Not Linked")
      .setDescription("You don't have an active widget link to disconnect.")
      .setColor(0x9e9e9e);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const deleted = await deleteUserAccount(userId);

  if (deleted) {
    const embed = new EmbedBuilder()
      .setTitle("🔌 Widget Disconnected")
      .setDescription(
        "Your Listune widget link has been removed. Your Discord profile card will no longer update.\n\nRun `/widget setup` to re-link."
      )
      .setColor(0xffaa00);
    await interaction.editReply({ embeds: [embed] });
  } else {
    const embed = new EmbedBuilder()
      .setTitle("Error")
      .setDescription("Failed to disconnect. Please try again later.")
      .setColor(0xff0000);
    await interaction.editReply({ embeds: [embed] });
  }
}

export async function execute(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "setup":
      await handleSetup(interaction);
      break;
    case "refresh":
      await handleRefresh(interaction);
      break;
    case "status":
      await handleStatus(interaction);
      break;
    case "disconnect":
      await handleDisconnect(interaction);
      break;
    case "image":
      await handleSetImage(interaction);
      break;
    case "scripts":
      await handleScript(interaction);
      break;
    default:
      await interaction.editReply({
        content: "Unknown subcommand.",
      });
  }
}
