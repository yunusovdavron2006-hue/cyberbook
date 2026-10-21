import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'; // no ambiguous chars

/** Human-friendly booking reference, e.g. CB-7K2M9XQD. */
export function generateBookingReference(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `CB-${out}`;
}

/** Human-friendly group-booking reference, e.g. GRP-7K2M9XQD. */
export function generateGroupReference(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `GRP-${out}`;
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  const n = randomBytes(4).readUInt32BE(0) % max;
  return n.toString().padStart(digits, '0');
}
