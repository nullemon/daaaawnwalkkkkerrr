/**
 * One `<script type="application/ld+json">`, and nothing else.
 *
 * The builders that produce what goes in it live in `src/lib/schema.ts`, so
 * they can be unit-tested without React and so the `@id` scheme that joins the
 * three hosts together is written down in one place. This file used to hold
 * both, and the builders sat there with no callers for months — a `videoGame`
 * with Dawnwalker's publisher hardcoded, waiting to tell search engines that
 * Silent Hill was made by Rebel Wolves the moment anybody wired it up.
 *
 * The escape is not decoration. JSON is valid inside a `<script>` right up
 * until the data contains `</script>`, at which point the browser ends the
 * element early and renders the rest as markup. Company names and summaries
 * here come from a CMS and from harvested wiki text, so that string is one
 * editor away at all times.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
