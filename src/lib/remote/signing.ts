import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto'
import { CLOCK_SKEW_MS } from './policy'

/**
 * Proof that a request came from a machine the owner approved.
 *
 * Every request a remote session makes is signed with an Ed25519 private key
 * the CLI generated and never sends anywhere. The server holds the public half
 * on a `remote-devices` row and checks the signature before it looks anything
 * else up.
 *
 * ## What this actually proves, and what it does not
 *
 * It proves that the private half of a key the owner approved signed *this*
 * method, *this* path, *this* body, within two minutes of now. That is all,
 * and the docstring says so rather than letting the word "device" do work it
 * cannot: a key file copied to another machine is a valid device, and nothing
 * that runs on an ordinary developer laptop can tell the difference.
 *
 * It is still far better than the obvious alternative. A machine fingerprint —
 * hostname, OS, MAC address, some hash of the three — is a string the client
 * chooses, so it is forgeable by anyone who can send a header, and it changes
 * when a laptop updates, so it fails constantly in the direction of locking
 * the owner out. A keypair fails in neither direction and is revocable by
 * unticking a box.
 *
 * ## The canonical string
 *
 *     remote-v1\n<METHOD>\n<pathname>\n<timestamp>\n<nonce>\n<sha256(body)>
 *
 * Every part is there for a reason:
 *
 *   - the **method and path** so a signature captured from one endpoint cannot
 *     be replayed against another;
 *   - the **timestamp** so a signature is not valid for ever;
 *   - the **nonce** so it is not valid twice inside the window;
 *   - the **body hash** rather than the body, so this stays cheap on a large
 *     JSON patch and so the string is always one line per part.
 *
 * The version prefix is not decoration. If the string ever has to change, an
 * old CLI signing the old string must fail rather than be interpreted as
 * having signed the new one, and the prefix is what makes that automatic.
 */

export const SIGNING_VERSION = 'remote-v1'

export const HEADER = {
  key: 'x-remote-key',
  timestamp: 'x-remote-timestamp',
  nonce: 'x-remote-nonce',
  signature: 'x-remote-signature',
} as const

export const bodyDigest = (body: string): string =>
  createHash('sha256').update(body, 'utf8').digest('hex')

export const canonicalString = (parts: {
  method: string
  path: string
  timestamp: string | number
  nonce: string
  body: string
}): string =>
  [
    SIGNING_VERSION,
    parts.method.toUpperCase(),
    parts.path,
    String(parts.timestamp),
    parts.nonce,
    bodyDigest(parts.body),
  ].join('\n')

/* -------------------------------------------------------------------------- */
/* Replay                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Nonces seen inside the clock-skew window.
 *
 * In memory, so it is per process: behind two instances, a signature replayed
 * within two minutes could land on the instance that has not seen it. That is
 * a real limit and `docs/REMOTE.md` states it rather than implying it away.
 * The alternatives are a row per request in SQLite — which this network writes
 * through a single file — or a shared store this project does not have and is
 * not adding for one feature.
 *
 * The map is swept rather than left to grow. A cache keyed on a value the
 * caller supplies an unbounded number of is the rate limiter becoming the
 * denial of service, which `/api/rate` already has a note about.
 */
const seen = new Map<string, number>()

export const rememberNonce = (nonce: string, now: number = Date.now()): boolean => {
  if (seen.size > 10_000) {
    for (const [key, at] of seen) if (now - at > CLOCK_SKEW_MS * 2) seen.delete(key)
  }
  const previous = seen.get(nonce)
  if (previous !== undefined && now - previous <= CLOCK_SKEW_MS * 2) return false
  seen.set(nonce, now)
  return true
}

/** Test seam. Nothing in the app calls this. */
export const forgetNonces = (): void => seen.clear()

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

export type SignatureCheck =
  | { ok: true; publicKey: string }
  | { ok: false; reason: string }

const isFreshTimestamp = (raw: string, now: number): boolean => {
  const at = Number(raw)
  if (!Number.isFinite(at)) return false
  return Math.abs(now - at) <= CLOCK_SKEW_MS
}

/**
 * Verify the signature on a request.
 *
 * Order matters: the cheap, non-cryptographic rejections come first, so an
 * unsigned flood costs a header read rather than a key import. The public key
 * arrives in a header and is verified against *itself* here — this says "a
 * key signed this", not "an approved key signed this". Whether the key is one
 * the owner approved is a database question and belongs in `server.ts`, which
 * is the module that has one.
 */
export const checkSignature = (
  headers: Headers,
  method: string,
  path: string,
  body: string,
  now: number = Date.now(),
): SignatureCheck => {
  const publicKey = headers.get(HEADER.key)?.trim()
  const timestamp = headers.get(HEADER.timestamp)?.trim()
  const nonce = headers.get(HEADER.nonce)?.trim()
  const signature = headers.get(HEADER.signature)?.trim()

  if (!publicKey || !timestamp || !nonce || !signature) {
    return { ok: false, reason: 'Unsigned request.' }
  }
  if (!/^[0-9a-f]{32,64}$/.test(nonce)) {
    return { ok: false, reason: 'Bad nonce.' }
  }
  if (!isFreshTimestamp(timestamp, now)) {
    return {
      ok: false,
      reason:
        'The request timestamp is more than two minutes from this server’s clock. Check the clock on the machine running the CLI.',
    }
  }
  if (!rememberNonce(nonce, now)) {
    return { ok: false, reason: 'This request has already been seen.' }
  }

  let key
  try {
    key = createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    })
  } catch {
    return { ok: false, reason: 'That is not a public key this server can read.' }
  }

  if (key.asymmetricKeyType !== 'ed25519') {
    return { ok: false, reason: 'Device keys must be Ed25519.' }
  }

  const message = Buffer.from(canonicalString({ method, path, timestamp, nonce, body }), 'utf8')

  let valid = false
  try {
    /*
      `null` for the algorithm: Ed25519 hashes internally and node refuses a
      digest name here. Passing 'sha256' throws rather than verifying, which
      would read as a bad signature and send somebody hunting the wrong thing.
    */
    valid = verifySignature(null, message, key, Buffer.from(signature, 'base64'))
  } catch {
    return { ok: false, reason: 'Malformed signature.' }
  }

  return valid ? { ok: true, publicKey } : { ok: false, reason: 'Signature does not verify.' }
}
