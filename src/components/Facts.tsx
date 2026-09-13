import type { ReactNode } from 'react'

export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  if (!items.length) return null
  return (
    <dl className="facts">
      {items.map((item) => (
        <div className="fact" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
