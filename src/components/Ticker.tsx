/**
 * The strip of figures that runs under a masthead.
 *
 * A broadcast ticker: label, figure, label, figure, moving slowly left. On the
 * hub it carries every wiki and its record count; on a wiki's home it carries
 * every section and its count. It exists because the first thing a reader of
 * a games site wants to know is how much is here, and a row of counts moving
 * past says it without a paragraph.
 *
 * ## Every number here is counted, never typed
 *
 * The caller passes rows it has already read from the database. Nothing in
 * this component knows what a wiki or a section is, so it cannot invent one -
 * and a strip with nothing to say renders nothing rather than a bar of
 * placeholder text.
 *
 * ## It is rendered twice on purpose
 *
 * The row is duplicated so the loop is seamless: the animation moves the
 * whole strip by exactly half its width and snaps back, and because the
 * second half is the first half again nobody can see the seam. The copy is
 * `aria-hidden`, so a screen reader hears each figure once. A reader who has
 * asked their system not to animate gets a static strip showing the first
 * rows, which the reduced-motion rule in `globals.css` arranges by cutting
 * every transition and animation to a millisecond.
 */
export function Ticker({
  items,
  label = 'Figures',
}: {
  items: { label: string; value: string | number; href?: string }[]
  /** What the strip is a list of, for assistive technology. */
  label?: string
}) {
  if (items.length === 0) return null

  const row = (hidden: boolean) => (
    <ul className="ticker-row" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item.label}>
          {item.href ? (
            <a href={item.href}>
              <b>{item.label}</b> {typeof item.value === 'number' ? item.value.toLocaleString('en-GB') : item.value}
            </a>
          ) : (
            <>
              <b>{item.label}</b> {typeof item.value === 'number' ? item.value.toLocaleString('en-GB') : item.value}
            </>
          )}
        </li>
      ))}
    </ul>
  )

  return (
    <nav className="ticker" aria-label={label}>
      <div className="ticker-track">
        {row(false)}
        {row(true)}
      </div>
    </nav>
  )
}
