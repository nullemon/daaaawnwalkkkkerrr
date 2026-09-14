import type { ReactNode } from 'react'

export type Fact = {
  label: string
  /** Omit the row entirely rather than printing a dash for a missing value. */
  value?: ReactNode
  /** Shown in place of a missing value when the absence is itself the fact. */
  absent?: string
}

/**
 * The at-a-glance column on a detail page.
 *
 * Detail pages were a single measure-width column of prose, which on a wide
 * screen left half the window empty and buried the two or three numbers a
 * reader actually came for. This lifts them out.
 *
 * A fact with no value is dropped unless it carries `absent`, because a table
 * of dashes says "we did not do the research" about things nobody has ever
 * published — the same reason items carry an acquisition kind rather than an
 * empty region.
 */
export function FactPanel({ title = 'At a glance', facts }: { title?: string; facts: Fact[] }) {
  const shown = facts.filter((fact) => fact.value !== undefined && fact.value !== null && fact.value !== '' || fact.absent)
  if (shown.length === 0) return null

  return (
    <section className="panel factpanel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      <dl className="factlist">
        {shown.map((fact) => {
          const missing = fact.value === undefined || fact.value === null || fact.value === ''
          return (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd data-absent={missing ? 'true' : undefined}>{missing ? fact.absent : fact.value}</dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
