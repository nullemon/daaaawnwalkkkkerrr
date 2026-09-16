/**
 * Is this string usable as the label in front of the network's domain?
 *
 * Creating a wiki creates a host. `proxy.ts` maps any single label onto the
 * matching first path segment, and the deployment answers on `*.<domain>` with
 * a wildcard certificate, so there is no DNS record and no certificate to add
 * per wiki — the eighth one is a row in the admin and nothing else.
 *
 * What there *was* no check for is whether the label is legal. A slug is
 * validated against the hub's reserved paths and nothing else, so
 * `my_wiki` or a seventy-character title-turned-slug would save happily,
 * produce a hostname no resolver will accept, and fail as a 404 with nothing
 * anywhere saying why. DNS rules are not guessable from the admin, so the
 * refusal has to happen where somebody can read it.
 *
 * The rules are RFC 1123's, which is what every resolver and every certificate
 * authority actually enforces:
 *
 *   - a to z, 0 to 9 and hyphen, and nothing else
 *   - never starting or ending with a hyphen
 *   - 63 characters at most, which is the hard limit on one label
 *
 * Upper case is not rejected but normalised: hostnames are case-insensitive,
 * and refusing "Dawnwalker" would be pedantry rather than protection.
 *
 * Kept free of Payload types so it can be unit-tested without a database.
 */

export const MAX_LABEL = 63

/** Trim and lower-case, which is all a hostname cares about. */
export const normaliseLabel = (value: string): string => value.trim().toLowerCase()

/**
 * @returns null when the label is usable, or a sentence explaining what is
 *   wrong with it, addressed to whoever is typing it into the admin.
 */
export const hostLabelProblem = (value: string): string | null => {
  const label = normaliseLabel(value)

  if (!label) return 'A host label is required.'
  if (label.length > MAX_LABEL) {
    return `A hostname label cannot be longer than ${MAX_LABEL} characters; this is ${label.length}.`
  }
  if (label.startsWith('-') || label.endsWith('-')) {
    return 'A hostname label cannot start or end with a hyphen.'
  }
  if (/^[0-9]+$/.test(label)) {
    // An all-numeric label is legal in DNS and a trap in practice: it reads as
    // an address, and some resolvers and browsers treat it as one.
    return 'A hostname label made only of digits will not behave as a hostname. Add a word.'
  }
  if (!/^[a-z0-9-]+$/.test(label)) {
    const offenders = [...new Set(label.replace(/[a-z0-9-]/g, '').split(''))].join(' ')
    return `A hostname label may only contain a–z, 0–9 and hyphens. Remove: ${offenders}`
  }
  return null
}

/** The full host a label will answer on, for showing back to an editor. */
export const hostFor = (label: string, root: string): string =>
  `${normaliseLabel(label)}.${root.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`
