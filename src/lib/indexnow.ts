/**
 * The IndexNow key: what counts as one, and which one is live.
 *
 * IndexNow verifies ownership by fetching `https://<host>/<key>.txt` and
 * checking the body is that same key. So the key is *published* by design — it
 * is not a credential, and nothing here treats it as one.
 *
 * ## Why there is a resolver at all
 *
 * The key used to be only a file: `public/<key>.txt`, generated once and
 * committed. That works, and it is still the floor. What it cannot do is let
 * the owner set or rotate their own key, which needs a deploy under that
 * scheme. So the key is now a field on Site settings, and this module decides
 * which of the two is live.
 *
 * Blank means "use the one that shipped", never "serve nothing" — the same
 * rule every editable field on this network follows, and the reason an empty
 * settings record renders the site the code does. See docs/COPY.md.
 *
 * ## Why one pattern, exported
 *
 * Three places have to agree on the shape of a key: the admin field that
 * refuses a bad one, `proxy.ts` which recognises `/<key>.txt` by shape and
 * must not let it be read as a wiki slug, and the route that serves it. A
 * mismatch between any two of them is a 404 on the key file, which IndexNow
 * reports as a rejected submission with no indication of which half is wrong.
 * `tools/indexnow.mjs` restates the pattern because it is plain node and
 * cannot import this; `indexnow.test.ts` pins the two against each other.
 *
 * Kept free of Payload types so it can be unit-tested without a database — the
 * same reason `legal.ts` and `host-label.ts` are written this way.
 */

/**
 * The IndexNow specification's own rule: 8 to 128 characters, drawn from
 * a–z, A–Z, 0–9 and the hyphen. Bing issues 32 hex characters; a key you
 * generate yourself is usually the same, but the engines accept the wider set
 * and refusing it here would reject a key somebody already has in use.
 */
export const KEY_PATTERN = /^[a-zA-Z0-9-]{8,128}$/

/**
 * The `<key>.txt` filename, which is what `proxy.ts` matches a first path
 * segment against.
 *
 * The `.txt` is what makes this safe to match by shape rather than by name: no
 * game slug can contain a dot, because `slugField` strips it, so a key file
 * can never be mistaken for a wiki and a wiki can never shadow a key file.
 * Matching by shape is also what makes rotating the key a settings change
 * rather than a routing change.
 */
export const KEY_FILE_PATTERN = /^[a-zA-Z0-9-]{8,128}\.txt$/

export const isIndexNowKey = (value: unknown): value is string =>
  typeof value === 'string' && KEY_PATTERN.test(value.trim())

/**
 * @returns null when the key is usable, or a sentence for whoever is typing it
 *   into the admin.
 *
 * A refusal rather than a warning, for the same reason the accent colour is
 * refused: this is measurable, and the failure it prevents is invisible. A key
 * the admin accepted but the engines will not is a submission rejected with
 * HTTP 422 and a body that says only that verification failed — it does not
 * say whether the key was malformed or the file was unreachable, and there is
 * nothing on the site to look at either way.
 */
export const indexNowKeyRefusal = (value: string): string | null => {
  const key = value.trim()
  if (!key) return null
  if (key.length < 8 || key.length > 128) {
    return `An IndexNow key must be 8 to 128 characters; this is ${key.length}.`
  }
  if (!KEY_PATTERN.test(key)) {
    const offenders = [...new Set(key.replace(/[a-zA-Z0-9-]/g, '').split(''))].join(' ')
    return `An IndexNow key may only contain a–z, A–Z, 0–9 and hyphens. Remove: ${offenders || 'the whitespace'}`
  }
  return null
}

/** Where the key came from, so a caller can say so rather than guess. */
export type KeySource = 'settings' | 'env' | 'shipped'

export type ResolvedKey = { key: string; source: KeySource } | null

/**
 * Which key this deployment is actually serving.
 *
 * The order is the order of intent: what the owner typed into the admin, then
 * what the environment was told, then the key that shipped in the repository.
 * Every consumer resolves in this order — the route that serves the file and
 * the submitting script both — because the engines compare the key in the
 * submission against the body of the file, and a script resolving differently
 * from the site is exactly the mismatch this module exists to prevent.
 *
 * An invalid stored key is *ignored*, not fatal. The admin refuses one at the
 * point of entry, so a bad value here arrived some other way (a direct API
 * write, a restored backup), and falling back to the shipped key keeps
 * verification working instead of taking the key file down with it.
 */
export const resolveIndexNowKey = (candidates: {
  settings?: string | null
  env?: string | null
  shipped?: string | null
}): ResolvedKey => {
  const order: [KeySource, string | null | undefined][] = [
    ['settings', candidates.settings],
    ['env', candidates.env],
    ['shipped', candidates.shipped],
  ]
  for (const [source, value] of order) {
    const key = typeof value === 'string' ? value.trim() : ''
    if (key && KEY_PATTERN.test(key)) return { key, source }
  }
  return null
}
