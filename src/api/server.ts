import { createServer } from "http";
import {
  initJsonStore,
  getAllAccounts,
  updateUserAccount,
} from "../database/store.js";
import {
  refreshOAuthToken,
  patchApplicationIdentityProfile,
  exchangeCodeForToken,
  getDiscordUser,
} from "../services/discord.service.js";
import { DynamicDataType } from "../types/widget.types.js";
import { getListuneUserStats } from "../services/listune.service.js";
import { WIDGET_MAPPING } from "../config/widget-layout.js";
import { formatMemberSince } from "../utils/date.js";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3000;
const WIDGET_BOT_AVATAR_URL =
  process.env.WIDGET_BOT_AVATAR_URL ||
  "https://listune.app/android-chrome-512x512.png";


export async function startServer(): Promise<void> {
  const server = createServer(async (req, res) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);

    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      // Health check
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            service: "Listune Profile Widget",
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (req.method === "GET" && url.pathname === "/oauth/discord/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (!state) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(
            "Link Failed\nMissing State Parameter\n\nCould not determine your Discord account context."
          );
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(
            "Link Failed\nAuthorization Code Missing\n\nNo OAuth code was returned by Discord."
          );
          return;
        }

        const userId = String(state);

        try {
          const tokenInfo = await exchangeCodeForToken(code);
          const success = await updateUserAccount(userId, {
            discordOAuth: tokenInfo,
            externalAccountId: `EXT-${userId.slice(-8)}`,
          });

          if (!success) {
            throw new Error("Failed to save credentials to storage.");
          }

          res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(
            "✅ Successfully Authenticated\n\nYour Listune account has been linked!\n\nYou can safely close this window and run /widget refresh in Discord to update your profile card."
          );
        } catch (error: any) {
          console.error("[OAuth] Authentication error:", error);
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          res.end(
            `Link Failed\nAuthentication Failed\n\n${error?.message || String(error)}`
          );
        }
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    } catch (err) {
      console.error("[HTTP] Server error:", err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });

  server.listen(PORT, () => {
    console.log(`[Server] HTTP server started on http://localhost:${PORT}`);
  });

  const enableDaily = process.env.AUTO_REFRESH_DAILY === "true";
  if (enableDaily) {
    const runDailyRefresh = async () => {
      try {
        console.log("[RefreshJob] Starting daily refresh...");
        const accounts = await getAllAccounts();

        for (const account of accounts) {
          const userId = account.userId;
          const oauth = account.discordOAuth;
          if (!oauth) continue;

          try {
            if (Date.now() >= oauth.expiresAt) {
              console.log(`[RefreshJob] Refreshing token for ${userId}`);
              const newTokens = await refreshOAuthToken(oauth.refreshToken);
              await updateUserAccount(userId, { discordOAuth: newTokens });
            }

            const externalAccountId =
              account.externalAccountId || `EXT-${userId.slice(-8)}`;
            const stats = await getListuneUserStats(userId);
            if (!stats) {
              console.warn(
                `[RefreshJob] Could not fetch stats for ${userId}`
              );
              continue;
            }

            // Fetch original Discord User to override "Listune User" fallback
            const discordUser = await getDiscordUser(userId);
            if (discordUser) {
              if (stats.displayName === "Listune User") {
                stats.displayName = discordUser.global_name || discordUser.username;
              }
              if (stats.username === userId) {
                stats.username = discordUser.username;
              }
              if (!stats.userAvatarUrl && discordUser.avatar) {
                stats.userAvatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png?size=256`;
              }
            }

            // Build payload
            const payload = {
              username: "Listune",
              metadata: {},
              data: {
                primary: {
                  server_name: "Listune",
                  user_id: externalAccountId,
                  rank_name: stats.topTrack,
                  highest_rank: stats.topArtist,
                  playtime_hours: 0,
                  total_wins: stats.tracksPlayed,
                  total_games: stats.likedSongs,
                },
                dynamic: [
                  {
                    type: DynamicDataType.IMAGE,
                    name: WIDGET_MAPPING.AVATAR_PRIMARY,
                    value: { url: account.customImage || stats.userAvatarUrl || WIDGET_BOT_AVATAR_URL },
                  },
                  {
                    type: DynamicDataType.IMAGE,
                    name: WIDGET_MAPPING.AVATAR_ICON,
                    value: { url: account.customImage || stats.userAvatarUrl || WIDGET_BOT_AVATAR_URL },
                  },
                  {
                    type: DynamicDataType.IMAGE,
                    name: WIDGET_MAPPING.AVATAR_PREVIEW,
                    value: { url: account.customImage || stats.userAvatarUrl || WIDGET_BOT_AVATAR_URL },
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
                    value: "let music find you at listune.app",
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

            await patchApplicationIdentityProfile(
              userId,
              externalAccountId,
              payload
            );
            await updateUserAccount(userId, {
              lastRefreshAt: new Date().toISOString(),
            });
            console.log(
              `[RefreshJob] Successfully refreshed profile for ${userId}`
            );
          } catch (innerErr) {
            console.warn(
              `[RefreshJob] Failed to refresh ${userId}:`,
              innerErr
            );
          }
        }

        console.log("[RefreshJob] Daily refresh completed.");
      } catch (err) {
        console.error("[RefreshJob] Error during daily refresh:", err);
      }
    };

    const scheduleNextRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
      const timeToWait = nextMidnight.getTime() - now.getTime();
      
      console.log(`[RefreshJob] Next auto-refresh scheduled in ${(timeToWait / 1000 / 60 / 60).toFixed(2)} hours (at 00:00 UTC).`);
      
      setTimeout(async () => {
        await runDailyRefresh();
        scheduleNextRefresh();
      }, timeToWait);
    };

    // Execute once immediately on startup
    runDailyRefresh().catch((e) => console.error(e));
    // Then schedule subsequent runs for exactly 00:00 UTC
    scheduleNextRefresh();
  } else {
    console.log("[Server] AUTO_REFRESH_DAILY disabled.");
  }
}

const isDirectRun =
  process.argv[1]?.replace(/\\/g, "/").endsWith("api/server.ts") ||
  process.argv[1]?.replace(/\\/g, "/").endsWith("api/server.js");

if (isDirectRun) {
  initJsonStore()
    .then(() => startServer())
    .catch((err) => {
      console.error("[Server] Fatal error:", err);
      process.exit(1);
    });
}
