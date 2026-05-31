import dotenv from "dotenv";

dotenv.config();

const LISTUNE_API_BASE_URL = (process.env.LISTUNE_API_BASE_URL || "https://listune.app").replace(/\/$/, "");
const LISTUNE_API_SECRET = process.env.LISTUNE_API_SECRET || "";

export interface NormalizedListuneStats {
  userId: string;
  displayName: string;
  username: string;
  userAvatarUrl: string | null;
  topTrack: string;
  topArtist: string;
  tracksPlayed: number;
  listenTime: string;
  likedSongs: number;
  premiumStatus: string;
  memberSince: string | null;
}

function apiHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${LISTUNE_API_SECRET}`,
  };
}

function truncate(str: string, max: number = 24): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}


export async function getListuneUserStats(
  discordId: string
): Promise<NormalizedListuneStats | null> {
  const stats: NormalizedListuneStats = {
    userId: discordId,
    displayName: "Listune User",
    username: discordId,
    userAvatarUrl: null,
    topTrack: "No data",
    topArtist: "No data",
    tracksPlayed: 0,
    listenTime: "0h",
    likedSongs: 0,
    premiumStatus: "Free",
    memberSince: null,
  };

  try {
    const widgetRes = await fetch(
      `${LISTUNE_API_BASE_URL}/v1/widget/users/${discordId}`,
      { method: "GET", headers: apiHeaders() }
    );

    if (!widgetRes.ok) {
      console.warn(
        `[ListuneAPI] Widget endpoint returned ${widgetRes.status} for user ${discordId}`
      );
      if (widgetRes.status >= 500) return null;
    } else {
      const widgetJson: any = await widgetRes.json();
      if (widgetJson?.success && widgetJson.data) {
        const d = widgetJson.data;
        stats.displayName = d.displayName || stats.displayName;
        stats.userAvatarUrl = d.avatarURL || null;
        stats.tracksPlayed = d.tracksPlayed ?? 0;
        stats.listenTime = d.listenTime || "0h";
        stats.likedSongs = d.likedSongs ?? 0;
        stats.premiumStatus = d.premiumStatus || "Free";
        stats.memberSince = d.memberSince || d.createdAt || d.joinedAt || null;
      }
    }
    const statsRes = await fetch(
      `${LISTUNE_API_BASE_URL}/v1/users/${discordId}/stats`,
      { method: "GET", headers: apiHeaders() }
    );

    if (statsRes.ok) {
      const statsJson: any = await statsRes.json();
      if (statsJson?.success && statsJson.data) {
        const d = statsJson.data;
        if (d.username) stats.username = d.username;
        if (d.displayName && stats.displayName === "Listune User") {
          stats.displayName = d.displayName;
        }
        if (d.avatarURL && !stats.userAvatarUrl) {
          stats.userAvatarUrl = d.avatarURL;
        }
        if (!stats.memberSince && (d.memberSince || d.createdAt || d.joinedAt)) {
          stats.memberSince = d.memberSince || d.createdAt || d.joinedAt;
        }
        if (Array.isArray(d.topTracks) && d.topTracks.length > 0) {
          const track = d.topTracks[0];
          stats.topTrack = truncate(track.name || "Unknown Track");
        }
        if (Array.isArray(d.topArtists) && d.topArtists.length > 0) {
          const artist = d.topArtists[0];
          stats.topArtist = truncate(artist.name || "Unknown Artist");
        }
      }
    } else {
      console.warn(
        `[ListuneAPI] Stats endpoint returned ${statsRes.status} for user ${discordId}`
      );
    }

    return stats;
  } catch (error) {
    console.error("[ListuneAPI] Error fetching Listune stats:", error);
    return null;
  }
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${LISTUNE_API_BASE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
