/**
 * Password hashing utilities — wraps bcryptjs.
 *
 * Hashing happens BEFORE the registration transaction opens; plaintext never
 * crosses into repository/input types or logs.
 *
 * Work factor: 12 rounds (industry-standard for bcrypt as of 2025; ~250ms hash
 * time on commodity hardware — balances security vs. registration latency).
 */
import { compare, genSalt, hash } from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcrypt (12 rounds).
 * The plaintext is never stored, logged, or returned.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  const salt = await genSalt(BCRYPT_ROUNDS);
  return hash(plaintext, salt);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 * Returns true on match, false otherwise. Never throws on mismatch.
 */
export async function comparePassword(plaintext: string, storedHash: string): Promise<boolean> {
  return compare(plaintext, storedHash);
}
