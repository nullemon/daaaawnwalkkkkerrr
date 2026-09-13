'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Pick perks across the three trees and get a link you can paste.
 *
 * Two rules do the real work. Only one ultimate per tree may be taken, which
 * is the game's own constraint and the decision the whole build hangs on; and
 * every perk costs segments off the same 480 the run checker spends, so a
 * build is never free — it competes with the quests you wanted to do.
 */

export interface PlannerPerk {
  id: string
  slug: string
  title: string
  treeSlug: string
  treeTitle: string
  isUltimate: boolean
  cost: number
  costKnown: boolean
  effect?: string | null
  foundInWorld: boolean
}

export interface PlannerTree {
  slug: string
  title: string
  phase: string
}

export function BuildPlanner({
  perks,
  trees,
  initial,
}: {
  perks: PlannerPerk[]
  trees: PlannerTree[]
  initial: string[]
}) {
  const [picked, setPicked] = useState<string[]>(initial)
  const [copied, setCopied] = useState(false)

  const bySlug = useMemo(() => new Map(perks.map((perk) => [perk.slug, perk])), [perks])
  const chosen = useMemo(
    () => picked.map((slug) => bySlug.get(slug)).filter((perk): perk is PlannerPerk => Boolean(perk)),
    [picked, bySlug],
  )

  const knownCost = chosen.filter((perk) => perk.costKnown).reduce((sum, perk) => sum + perk.cost, 0)
  const unknownCount = chosen.filter((perk) => !perk.costKnown).length

  const ultimateFor = useCallback(
    (treeSlug: string) => chosen.find((perk) => perk.treeSlug === treeSlug && perk.isUltimate),
    [chosen],
  )

  const toggle = (perk: PlannerPerk) => {
    setCopied(false)
    setPicked((current) => {
      if (current.includes(perk.slug)) return current.filter((slug) => slug !== perk.slug)
      // Taking an ultimate replaces the tree's existing one rather than
      // silently allowing an illegal build.
      if (perk.isUltimate) {
        const existing = ultimateFor(perk.treeSlug)
        const without = existing ? current.filter((slug) => slug !== existing.slug) : current
        return [...without, perk.slug]
      }
      return [...current, perk.slug]
    })
  }

  // Keep the address bar in step, so copying from it always gives a live build.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (picked.length > 0) url.searchParams.set('perks', picked.join(','))
    else url.searchParams.delete('perks')
    window.history.replaceState(null, '', url.toString())
  }, [picked])

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="planner">
      <div className="planner-trees">
        {trees.map((tree) => {
          const treePerks = perks.filter((perk) => perk.treeSlug === tree.slug)
          const ultimate = ultimateFor(tree.slug)
          return (
            <section className="planner-tree" key={tree.slug}>
              <div className="planner-tree-head">
                <h2>
                  <Link href={`/skills/${tree.slug}`}>{tree.title}</Link>
                </h2>
                <span className="badge" data-phase={tree.phase === 'either' ? undefined : tree.phase}>
                  {tree.phase === 'day' ? 'Day' : tree.phase === 'night' ? 'Night' : 'Any time'}
                </span>
              </div>

              {treePerks.length === 0 ? (
                <p className="note">No perks recorded for this tree yet.</p>
              ) : (
                <ul className="perk-list">
                  {treePerks.map((perk) => {
                    const on = picked.includes(perk.slug)
                    const blocked = perk.isUltimate && ultimate && ultimate.slug !== perk.slug
                    return (
                      <li key={perk.id}>
                        <label data-on={on} data-blocked={Boolean(blocked)}>
                          <input
                            type="checkbox"
                            id={`perk-${perk.slug}`}
                            checked={on}
                            onChange={() => toggle(perk)}
                          />
                          <span>
                            <span className="perk-title">
                              {perk.isUltimate ? <span className="star" aria-label="Ultimate">★</span> : null}
                              {perk.title}
                            </span>
                            {perk.effect ? <span className="sub">{perk.effect}</span> : null}
                            <span className="sub">
                              {perk.costKnown ? `${perk.cost} segment${perk.cost === 1 ? '' : 's'}` : 'cost unconfirmed'}
                              {perk.foundInWorld ? ' · found in the world, not bought' : ''}
                              {blocked ? ' · replaces your current ultimate' : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <aside className="planner-summary">
        <h2>Your build</h2>
        {chosen.length === 0 ? (
          <p className="note">Nothing picked yet. Tick perks on the left and this fills in.</p>
        ) : (
          <>
            <dl className="facts">
              <div className="fact">
                <dt>Perks</dt>
                <dd className="mono">{chosen.length}</dd>
              </div>
              <div className="fact">
                <dt>Segments</dt>
                <dd className="mono">
                  {unknownCount === chosen.length ? '—' : unknownCount > 0 ? `${knownCost}+` : knownCost}
                </dd>
              </div>
              <div className="fact">
                <dt>Ultimates</dt>
                <dd className="mono">{chosen.filter((perk) => perk.isUltimate).length} / 3</dd>
              </div>
            </dl>

            <ul className="chain">
              {chosen.map((perk) => (
                <li key={perk.id}>
                  <span className="step">{perk.isUltimate ? '★' : '·'}</span>
                  <span>
                    {perk.title}
                    <span className="sub">{perk.treeTitle}</span>
                  </span>
                </li>
              ))}
            </ul>

            {unknownCount === chosen.length ? (
              <p className="note">
                No source publishes a segment cost for any of these, so we cannot total them.
                Reporting puts most skills at about one segment each, which would make this roughly{' '}
                {chosen.length} — treat that as a rule of thumb, not a figure.
              </p>
            ) : unknownCount > 0 ? (
              <p className="note">
                {knownCost} segments confirmed, with {unknownCount} perk
                {unknownCount === 1 ? '' : 's'} whose cost nobody publishes. The total is a floor.
              </p>
            ) : (
              <p className="note">
                That is {knownCost} of your 480 segments spent on perks rather than quests.
              </p>
            )}

            <div className="field-row">
              <button type="button" className="button" onClick={share}>
                {copied ? 'Link copied' : 'Copy share link'}
              </button>
              <button type="button" className="linkish" onClick={() => setPicked([])}>
                Clear
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
