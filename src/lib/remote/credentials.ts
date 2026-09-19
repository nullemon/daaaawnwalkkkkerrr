import { createHmac, randomInt, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Every piece of secret or semi-secret string material a remote session uses,
 * in one module, so the difference between the two kinds is stated once.
 *
 * There are two, and conflating them is the mistake `docs/REMOTE.md` is mostly
 * about:
 *
 *   - **The code** is sixteen characters a human reads off a terminal and
 *     compares with a web page. It is displayed in two places on purpose, so
 *     it is not confidential, and nothing in this codebase accepts it as
 *     authorisation for anything. Its only job is letting a person confirm
 *     that the session they are approving is the one in front of them.
 *
 *   - **The token** is 256 bits the server mints, hands to the CLI once, and
 *     stores only as an HMAC. It is the credential. It is never typed, never
 *     rendered, and never leaves the process that generated it except in the
 *     one response that delivers it.
 *
 * Both are generated from `crypto`. `Math.random` is seeded from the clock and
 * its output is recoverable from a handful of samples, which for a code that
 * appears on a screen would be merely embarrassing and for a token would be
 * the whole security of the feature.
 */

/**
 * The code alphabet: thirty-one characters, with every visually ambiguous
 * glyph removed.
 *
 * No `0`/`O`, no `1`/`I`/`L`. A person reads this off one screen and types it
 * into another, and the cost of an ambiguous glyph is not a security problem —
 * it is somebody deciding the tool is broken because their correct code was
 * refused twice.
 *
 * Upper case only for the same reason. A mixed-case code doubles the alphabet
 * and halves the chance of it being transcribed correctly, and the entropy is
 * not what is doing the work here — a sixteen-character code over this
 * alphabet is a shade under 80 bits, which is ample for telling one pending
 * session from another and irrelevant to everything the code is not for.
 *
 * Written out literally rather than derived by removing characters from a
 * range, because a derivation is the sort of cleverness that silently changes
 * length when somebody tidies it. The unit test pins the exact string, its
 * length, and that none of the ambiguous glyphs is in it.
 */
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const CODE_LENGTH = 16
export const CODE_GROUP = 4

/**
 * A fresh code.
 *
 * `randomInt` rather than `randomBytes(1) % 31`: the modulo of a byte by
 * anything that does not divide 256 is biased towards the low end of the
 * alphabet, which over a database of sessions is a visible pattern and over a
 * credential would be a real weakness. `randomInt` rejects and re-draws.
 */
export const newCode = (length: number = CODE_LENGTH): string => {
  let code = ''
  for (let index = 0; index < length; index += 1) {
    code += CODE_CHARS[randomInt(CODE_CHARS.length)]
  }
  return code
}

/** `K7QD-3XMH-9RTV-P2WY` — the form a person reads and types. */
export const formatCode = (code: string): string =>
  (code.match(new RegExp(`.{1,${CODE_GROUP}}`, 'g')) ?? []).join('-')

/**
 * What somebody typed, reduced to what was meant.
 *
 * Accepts the grouped form and the ungrouped one, any case, with spaces —
 * a code pasted out of a terminal arrives with whatever whitespace the
 * terminal wrapped it in, and refusing that would be refusing the ordinary
 * case. Characters outside the alphabet are dropped rather than rejected so
 * that `O` typed for `0` fails the comparison instead of failing a format
 * check with a different message; there is one wrong-code path, not two.
 */
export const normaliseCode = (input: string): string =>
  input
    .toUpperCase()
    .split('')
    .filter((character) => CODE_CHARS.includes(character))
    .join('')

/**
 * Constant-time comparison of two codes.
 *
 * `timingSafeEqual` throws on a length mismatch, which would leak the length
 * through an exception and crash the route, so the lengths are compared first
 * and a mismatch returns false without touching it. The lengths are not secret
 * — every code is sixteen characters.
 */
export const codesMatch = (typed: string, stored: string): boolean => {
  const a = Buffer.from(normaliseCode(typed), 'utf8')
  const b = Buffer.from(normaliseCode(stored), 'utf8')
  if (a.length === 0 || a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

/** 256 bits, base64url, for an `Authorization: Remote <token>` header. */
export const newToken = (): string => randomBytes(32).toString('base64url')

/**
 * What goes in the database in place of the token.
 *
 * HMAC and not a bare SHA-256: a token is 256 random bits, so a rainbow table
 * is not the threat — but `PAYLOAD_SECRET` in the key means that a dump of the
 * sessions table on its own cannot be checked against a token an attacker
 * already holds, and it means rotating `PAYLOAD_SECRET` ends every live
 * session. Both are worth the one line.
 */
export const hashToken = (token: string, secret: string): string =>
  createHmac('sha256', secret).update(`remote-token:${token}`).digest('hex')

/**
 * Compare a presented token against the stored hash, in constant time.
 *
 * The lookup that follows is by hash, so an attacker cannot use a timing
 * difference here to walk a token out character by character — but the hash is
 * still compared somewhere, and doing it the safe way costs nothing.
 */
export const tokenMatches = (token: string, storedHash: string, secret: string): boolean => {
  const computed = Buffer.from(hashToken(token, secret), 'utf8')
  const stored = Buffer.from(storedHash ?? '', 'utf8')
  if (stored.length !== computed.length) return false
  return timingSafeEqual(computed, stored)
}

/**
 * A device's public key, as something a human can read out and compare.
 *
 * Eight groups of four hex characters from the SHA-256 of the key. Shown in
 * the CLI and in the admin, and the two being the same is how the owner knows
 * the row they are enabling is the machine they are sitting at.
 */
export const fingerprint = (publicKeyBase64: string): string => {
  const digest = createHmac('sha256', 'remote-device').update(publicKeyBase64).digest('hex')
  return (digest.slice(0, 32).match(/.{4}/g) ?? []).join(':')
}
