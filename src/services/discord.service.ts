import dotenv from "dotenv";
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
