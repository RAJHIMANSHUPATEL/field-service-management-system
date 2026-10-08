import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Seals a successor refresh token for the short grace window, so the database never holds a
// usable raw token. AES-256-GCM with a key derived (HKDF-SHA256) from JWT_REFRESH_SECRET and the
// owning row's id as associated data, so a sealed value cannot be moved to another row.
const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET is not set");
  }
  return Buffer.from(hkdfSync("sha256", secret, "field-service/refresh-grace", "successor-token/v1", 32));
}

export function sealToken(token: string, ownerId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(ownerId));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

// Returns null when the value is malformed, was sealed for another row, or the key changed.
export function openToken(sealed: string, ownerId: string): string | null {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    return null;
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(ownerId));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
