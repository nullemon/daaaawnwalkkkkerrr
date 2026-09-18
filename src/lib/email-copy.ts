/**
 * The pieces every message this site sends needs, and nothing that opens a
 * socket.
 *
 * `email.ts` decides what is configured, `email-adapter.ts` does the I/O, and
 * this holds the two things a *message* needs before either of them is
 * involved. Both are here because the mistakes they prevent have already been
 * made in this repository, on pages rather than in mail:
 *
 *  - **`networkName` falls back to nothing rather than to a name.** A sentence
 *    about one game does not belong in shared code, and an inbox is not an
 *    exception: eight wikis share one account system, so a reader's password
 *    reset and an editor's reach people who have never heard of Dawnwalker.
 *    Hardcoding the network's name here is the Regions index headed "Vale
 *    Sangora", delivered by mail. It is still the working title "Vellum", so
 *    it is read from Site settings where it can be changed once.
 *
 *  - **`oneLine` is header sanitation, not tidiness.** A reader's own words
 *    reach a `Subject:`, and a carriage return in a header is where a stranger
 *    gets to add headers of their own — a Bcc, most usefully for them. The
 *    address fields are ours; the subject is theirs, so it is flattened before
 *    it gets there.
 *
 * Free of Payload types on purpose, the same way `reachability.ts` is: the
 * half that makes decisions is unit-testable without a database.
 */

type GlobalReader = {
  findGlobal: (args: { slug: 'site-settings'; depth?: number }) => Promise<Record<string, unknown>>
}

/**
 * Site settings, or null if the database would not answer.
 *
 * Null rather than a throw, because every caller here is composing a message
 * that must still go out. A reset link that fails because a global could not
 * be read would be a locked-out reader and a `findGlobal` stack trace, when
 * the only thing actually missing is a display name.
 */
export const siteSettings = async (payload: unknown): Promise<Record<string, unknown> | null> => {
  try {
    return await (payload as GlobalReader).findGlobal({ slug: 'site-settings', depth: 0 })
  } catch {
    return null
  }
}

/** The network's own name for the one or two sentences in an inbox, or ''. */
export const networkName = async (payload: unknown): Promise<string> => {
  const name = (await siteSettings(payload))?.siteName
  return typeof name === 'string' && name.trim() ? name.trim() : ''
}

/**
 * One line of at most `max` characters, for a value that lands in a header.
 *
 * Collapsing *all* whitespace is what removes the CR and LF: a subject built
 * from a stranger's 200-character summary is the one place on this site where
 * somebody else's newline would be interpreted rather than displayed.
 */
export const oneLine = (value: string, max = 120): string => {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}
