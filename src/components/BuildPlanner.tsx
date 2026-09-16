'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'

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

/**
 * A list of perk slugs from outside — a shared link, or a build page — cannot
 * be trusted to be a legal build. Drop anything unknown, drop duplicates, and
 * enforce the game's one-ultimate-per-tree rule, keeping the last ultimate
 * named for a tree so it matches what clicking would have done.
 */
function sanitise(slugs: string[], bySlug: Map<string, PlannerPerk>): string[] {
  const kept: string[] = []
  const ultimateFor = new Map<string, string>()
  for (const raw of slugs) {
    const slug = raw.trim()
    const perk = bySlug.get(slug)
    if (!perk || kept.includes(slug)) continue
    if (perk.isUltimate) {
      const existing = ultimateFor.get(perk.treeSlug)
      if (existing) kept.splice(kept.indexOf(existing), 1)
      ultimateFor.set(perk.treeSlug, slug)
    }
    kept.push(slug)
  }
  return kept
}

export function BuildPlanner({ perks, trees }: { perks: PlannerPerk[]; trees: PlannerTree[] }) {
  const ui = useUi()
  const [picked, setPicked] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  /**
   * The query string is the source of truth for an incoming build. Read in the
   * browser rather than on the server: reading searchParams server-side opts
   * the whole route out of static generation, and this is the one page that
   * would otherwise not be static HTML.
   */
  const searchParams = useSearchParams()
  const shared = searchParams.get('perks') ?? ''
  const [loadedFromUrl, setLoadedFromUrl] = useState(false)

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

  /**
   * Re-reads on every navigation, not just on mount. Next keeps this component
   * mounted when the router moves between query strings on the same route, so
   * a mount-only read would leave the panel showing a build the address bar no
   * longer names — and "Copy share link" would then hand out a link that opens
   * something else.
   */
  useEffect(() => {
    setPicked(sanitise(shared.split(','), bySlug))
    setLoadedFromUrl(true)
  }, [shared, bySlug])

  // Keep the address bar in step, so copying from it always gives a live build.
  // Held until the shared build has been read, or this would wipe it first.
  useEffect(() => {
    if (!loadedFromUrl) return
    const url = new URL(window.location.href)
    if (picked.length > 0) url.searchParams.set('perks', picked.join(','))
    else url.searchParams.delete('perks')
    window.history.replaceState(null, '', url.toString())
  }, [picked, loadedFromUrl])

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
                  {/*
                    Anything that is not day or night reads as "Any time", which
                    is not the same as tidying the stored value — a tree filed
                    under something unexpected must not print it as a badge.
                  */}
                  {tree.phase === 'day' || tree.phase === 'night'
                    ? ui.label('phase', tree.phase)
                    : ui.label('phase', 'either')}
                </span>
              </div>

              {treePerks.length === 0 ? (
                <p className="note">{ui.t('planner.no-perks')}</p>
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
                              {perk.isUltimate ? (
                                <span className="star" aria-label={ui.t('planner.ultimate')}>
                                  ★
                                </span>
                              ) : null}
                              {perk.title}
                            </span>
                            {perk.effect ? <span className="sub">{perk.effect}</span> : null}
                            <span className="sub">
                              {perk.costKnown
                                ? fill(
                                    ui.t(
                                      perk.cost === 1
                                        ? 'planner.segment-one'
                                        : 'planner.segment-many',
                                    ),
                                    { count: perk.cost },
                                  )
                                : ui.t('planner.cost-unconfirmed')}
                              {perk.foundInWorld ? ` · ${ui.t('planner.found-in-world')}` : ''}
                              {blocked ? ` · ${ui.t('planner.replaces-ultimate')}` : ''}
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
        <h2>{ui.t('planner.your-build')}</h2>
        {chosen.length === 0 ? (
          <p className="note">{ui.t('planner.nothing-picked')}</p>
        ) : (
          <>
            <dl className="facts">
              <div className="fact">
                <dt>{ui.t('planner.perks')}</dt>
                <dd className="mono">{chosen.length}</dd>
              </div>
              <div className="fact">
                <dt>{ui.t('planner.segments')}</dt>
                <dd className="mono">
                  {unknownCount === chosen.length ? '—' : unknownCount > 0 ? `${knownCost}+` : knownCost}
                </dd>
              </div>
              <div className="fact">
                <dt>{ui.t('planner.ultimates')}</dt>
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
              <p className="note">{fill(ui.t('planner.no-total'), { count: chosen.length })}</p>
            ) : unknownCount > 0 ? (
              <p className="note">
                {fill(ui.t(unknownCount === 1 ? 'planner.floor-one' : 'planner.floor-many'), {
                  known: knownCost,
                  count: unknownCount,
                })}
              </p>
            ) : (
              <p className="note">{fill(ui.t('planner.spent'), { known: knownCost })}</p>
            )}

            <div className="field-row">
              <button type="button" className="button" onClick={share}>
                {copied ? ui.t('planner.copied') : ui.t('planner.copy')}
              </button>
              <button type="button" className="linkish" onClick={() => setPicked([])}>
                {ui.t('planner.clear')}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
