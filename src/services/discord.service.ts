import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import type { DiscordOAuthInfo } from "../database/store.js";

dotenv.config();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "";
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "";
const DISCORD_API_BASE_URL = process.env.DISCORD_API_BASE_URL || "https://discord.com/api/v10";

export interface ExchangeTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export async function exchangeCodeForToken(code: string): Promise<DiscordOAuthInfo> {
  const params = new URLSearchParams();
  params.set("client_id", DISCORD_CLIENT_ID);
  params.set("client_secret", DISCORD_CLIENT_SECRET);
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", DISCORD_REDIRECT_URI);

  const response = await fetch(`${DISCORD_API_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord OAuth token exchange failed (status ${response.status}): ${text}`);
  }

  const data = (await response.json()) as ExchangeTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export async function refreshOAuthToken(refreshToken: string): Promise<DiscordOAuthInfo> {
  const params = new URLSearchParams();
  params.set("client_id", DISCORD_CLIENT_ID);
  params.set("client_secret", DISCORD_CLIENT_SECRET);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);

  const response = await fetch(`${DISCORD_API_BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord OAuth token refresh failed (status ${response.status}): ${text}`);
  }

  const data = (await response.json()) as ExchangeTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
  };
}

export interface PatchProfilePayload {
  username?: string;
  metadata?: Record<string, string>;
  data?: {
    primary?: Record<string, any>;
    dynamic?: Array<{
      type: number;
      name: string;
      value: any;
    }>;
  };
}

export async function patchApplicationIdentityProfile(
  userId: string,
  externalUserId: string,
  payload: PatchProfilePayload
): Promise<boolean> {
  const url = `${DISCORD_API_BASE_URL}/applications/${DISCORD_CLIENT_ID}/users/${userId}/identities/${externalUserId}/profile`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (DISCORD_TOKEN) {
    headers["Authorization"] = `Bot ${DISCORD_TOKEN}`;
  } else {
    throw new Error("Missing Bot Token (DISCORD_TOKEN) in configuration.");
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return true;
  }

  const text = await response.text();
  console.error(`Failed to PATCH application profile (status ${response.status}):`, text);
  throw new Error(`Failed to update application profile (status ${response.status}): ${text}`);
}

export async function getDiscordUser(userId: string): Promise<any | null> {
  if (!DISCORD_TOKEN) return null;
  
  const response = await fetch(`${DISCORD_API_BASE_URL}/users/${userId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bot ${DISCORD_TOKEN}`,
    },
  });

  if (response.ok) {
    return response.json();
  }
  return null;
}

export async function ensureWidgetConfigExists() {
  const url = `${DISCORD_API_BASE_URL}/applications/${DISCORD_CLIENT_ID}/widget-configs`;
  const headers = {
    "Authorization": `Bot ${DISCORD_TOKEN}`,
    "Content-Type": "application/json",
  };

  try {
    const getRes = await fetch(url, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log("[Init] Widget configuration already exists for this application.");
        return;
      }
    }
    console.log("[Init] No widget configuration found. Publishing default layout...");
    
    const surfacesPath = path.join(process.cwd(), "src", "config", "default-surfaces.json");
    const surfacesData = await fs.readFile(surfacesPath, "utf-8");
    const surfaces = JSON.parse(surfacesData);

    const postRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        display_name: "Profile Widget",
        surfaces: surfaces
      }),
    });

    if (postRes.ok) {
      const postData = await postRes.json();
      const configId = postData.config_id;
      const pubRes = await fetch(url + '/' + configId + '/publish', {
        method: 'POST',
        headers
      });
      if (pubRes.ok) {
        console.log("[Init] Successfully published widget configuration to Discord!");
      } else {
        console.error("[Init] Failed to publish draft configuration:", await pubRes.text());
      }
    } else {
      const text = await postRes.text();
      if (text.includes("40119") || text.includes("already exists")) {
        console.log("[Init] Widget configuration already exists for this application.");
      } else {
        console.error("[Init] Failed to create draft widget configuration:", text);
      }
    }
  } catch (err) {
    console.error("[Init] Error ensuring widget configuration:", err);
  }
}
