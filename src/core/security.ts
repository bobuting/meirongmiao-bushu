import crypto from "node:crypto";

export function hashPassword(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function verifyPassword(raw: string, hash: string): boolean {
  return hashPassword(raw) === hash;
}

function secretKey(): Buffer {
  const appSecret = process.env.APP_SECRET_KEY?.trim();
  const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  const raw =
    appSecret && appSecret.length > 0
      ? appSecret
      : nodeEnv === "test"
        ? "test-only-app-secret-key"
        : null;
  if (!raw) {
    throw new Error("[security] APP_SECRET_KEY is required outside NODE_ENV=test.");
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(cipherText: string): string {
  const payload = Buffer.from(cipherText, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskSecret(raw: string): string {
  if (raw.length <= 4) {
    return "*".repeat(raw.length);
  }
  return `${raw.slice(0, 2)}${"*".repeat(Math.max(raw.length - 4, 4))}${raw.slice(-2)}`;
}
