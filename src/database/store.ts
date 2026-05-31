import fs from "fs";
import path from "path";

export interface DiscordOAuthInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
}

export interface UserAccount {
  userId: string;
  discordOAuth?: DiscordOAuthInfo;
  externalAccountId?: string;
  customImage?: string;
  lastRefreshAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoreData {
  users: Record<string, UserAccount>;
}

const DB_PATH = path.resolve(
  process.cwd(),
  process.env.JSON_DB_PATH || "./data/widget-store.json"
);

function ensureDirectory(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readDb(): StoreData {
  if (!fs.existsSync(DB_PATH)) {
    return { users: {} };
  }

  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && !parsed.users && typeof parsed === "object") {
      const migrated: StoreData = { users: {} };
      for (const key of Object.keys(parsed)) {
        if (parsed[key]?.userId) {
          migrated.users[key] = parsed[key];
        }
      }
      return migrated;
    }

    return parsed as StoreData;
  } catch (error) {
    console.error("[Store] Error reading database file, resetting:", error);
    return { users: {} };
  }
}

function writeDb(data: StoreData): void {
  try {
    ensureDirectory();
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, DB_PATH);
  } catch (error) {
    console.error("[Store] Error writing database file:", error);
  }
}

export async function initJsonStore(): Promise<void> {
  ensureDirectory();
  if (!fs.existsSync(DB_PATH)) {
    writeDb({ users: {} });
  }
  console.log(`[Store] Using JSON storage at ${DB_PATH}`);
}

export async function getUserAccount(
  userId: string
): Promise<UserAccount | null> {
  const db = readDb();
  return db.users[userId] || null;
}

export async function updateUserAccount(
  userId: string,
  updateData: Partial<Omit<UserAccount, "userId" | "createdAt">>
): Promise<boolean> {
  try {
    const db = readDb();
    const existing = db.users[userId];
    const now = new Date().toISOString();

    if (existing) {
      db.users[userId] = {
        ...existing,
        ...updateData,
        updatedAt: now,
      };
    } else {
      db.users[userId] = {
        userId,
        ...updateData,
        createdAt: now,
        updatedAt: now,
      };
    }

    writeDb(db);
    return true;
  } catch (error) {
    console.error(`[Store] Error updating account for user ${userId}:`, error);
    return false;
  }
}


export async function deleteUserAccount(userId: string): Promise<boolean> {
  try {
    const db = readDb();
    if (!db.users[userId]) return false;
    delete db.users[userId];
    writeDb(db);
    return true;
  } catch (error) {
    console.error(`[Store] Error deleting account for user ${userId}:`, error);
    return false;
  }
}

export async function getAllAccounts(): Promise<UserAccount[]> {
  const db = readDb();
  return Object.values(db.users).filter(
    (account) => account.discordOAuth != null
  );
}
