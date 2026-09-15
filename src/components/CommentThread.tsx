import { Comments } from './Comments'
import { getGame, gameUrl } from '@/lib/payload'

/**
 * The comment thread, if this wiki has comments switched on.
 *
 * A server component wrapping the client one, so three decisions are made
 * during the build rather than in the browser: whether this game has comments
 * at all, what its canonical origin is, and which game a new comment belongs
 * to. A wiki without the feature renders nothing — not an empty section, and
 * not a form that posts into a queue nobody is reading.
 *
 * `pageUrl` is the page's full canonical URL rather than its path. Paths
 * collide across the network — every wiki has a `/quests` — and comments are
 * fetched by this value, so a path would have shown Dawnwalker's comments on
 * the Onimusha page with the same slug.
 */
export async function CommentThread({ game, path }: { game: string; path: string }) {
  const doc = await getGame(game)
  if (!doc || !(doc.features ?? []).includes('comments')) return null

  const base = await gameUrl(doc)
  return <Comments pageUrl={`${base}${path}`} gameId={doc.id} />
}
