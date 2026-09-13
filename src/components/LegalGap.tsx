/**
 * A loud, unmissable marker wherever a legal page still has a placeholder.
 *
 * The alternative — quietly printing a plausible-looking name and address —
 * is how a site ends up publishing a privacy policy that names nobody real.
 * This makes the gap impossible to ship by accident.
 */
export function LegalGap({ field }: { field: string }) {
  return (
    <mark className="legal-gap" title={`Set "${field}" in Site settings → Legal & contact`}>
      [{field.toUpperCase()} — NOT YET SET]
    </mark>
  )
}

export function LegalWarning({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null
  return (
    <div className="callout" data-tone="risk">
      <h3>This page is not finished</h3>
      <p>
        {missing.length} required detail{missing.length === 1 ? '' : 's'} still unset:{' '}
        {missing.join(', ')}. A privacy policy has to name who is actually responsible for
        people&rsquo;s data and how to reach them — fill these in under Site settings → Legal &amp;
        contact in the admin before the site goes live.
      </p>
    </div>
  )
}
