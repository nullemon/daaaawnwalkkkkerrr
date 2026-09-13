/**
 * Loud markers wherever a legal page is still running on stand-in details.
 *
 * Two things catch a placeholder. `legalProvisional` in site settings is the
 * explicit switch an editor turns off once the details are real, and it wins
 * over everything else. `isProvisional` in `@/lib/legal` is the backstop for
 * the values nobody remembered to flag.
 */
import { isProvisional } from '@/lib/legal'

export function LegalGap({ field, value }: { field: string; value?: string | null }) {
  if (value && value.trim()) {
    return (
      <mark
        className="legal-gap"
        title={`Stand-in value. Set "${field}" in Site settings → Legal & contact`}
      >
        {value}
      </mark>
    )
  }
  return (
    <mark className="legal-gap" title={`Set "${field}" in Site settings → Legal & contact`}>
      [{field.toUpperCase()} — NOT YET SET]
    </mark>
  )
}

/**
 * Prints a legal detail, marked if it cannot yet be trusted. `provisional` is
 * the site-wide flag; a field that looks like a placeholder is marked whatever
 * the flag says.
 */
export function LegalField({
  field,
  value,
  provisional,
}: {
  field: string
  value?: string | null
  provisional?: boolean | null
}) {
  if (!provisional && !isProvisional(value)) return <>{value}</>
  return <LegalGap field={field} value={value} />
}

export function LegalWarning({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null
  return (
    <div className="callout" data-tone="risk">
      <h3>This page is not ready to publish</h3>
      <p>
        {missing.length} detail{missing.length === 1 ? ' is' : 's are'} still a stand-in:{' '}
        {missing.join(', ')}. A site that holds any personal data has to name who is
        responsible for it and how to reach them, so replace these under Site settings → Legal
        &amp; contact and untick &ldquo;these details are still stand-ins&rdquo; before the site
        goes live. Everything marked in red below is a placeholder.
      </p>
    </div>
  )
}
