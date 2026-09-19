/**
 * Does this file name actually name this company?
 *
 * Its own module so it can be tested. `tools/fetch-company-logos.mjs` runs a
 * database query and a network sweep at the top level, so importing it to
 * reach one function would start a harvest — the same reason
 * `src/seed/rating-basis.ts` sits apart from the pass that uses it.
 *
 * ## Two rules, and both were learned the same way
 *
 * A logo published under the wrong company's name is a false claim about whose
 * trademark it is. The studio `.Gears` produced the counter-example twice, and
 * each failure tightened this by one rule:
 *
 * 1. **Words, in order — not a flattened substring.** The first version
 *    stripped punctuation from both sides and compared: "metalgearsolid"
 *    contains "gears", so `.Gears` matched `Metal Gear Solid logo 2.png`.
 *
 * 2. **From the start, and nothing but furniture after.** Word matching alone
 *    then matched `Shifting Gears (20th Television) logo.svg`, because "gears"
 *    is one of its words. So the company's words must open the file name, and
 *    whatever follows must be the kind of thing a logo file is decorated with
 *    — "logo", a year, "wordmark" — rather than more of somebody else's title.
 *
 * Commons files are overwhelmingly named `<Company> logo.svg` or `<Company>
 * <year> logo.png`, so this keeps the real hits and drops the coincidences.
 * It does reject `Logo of Konami.svg`, which is a real if rarer pattern —
 * missing a logo is a gap, and publishing the wrong one is a claim, so the
 * rule errs where it is cheap to be wrong.
 */

/** Words a logo file is decorated with, which may follow the company's name. */
const FURNITURE = new Set([
  'logo',
  'logos',
  'logotype',
  'wordmark',
  'symbol',
  'emblem',
  'icon',
  'brand',
  'new',
  'old',
  'current',
  'alt',
  'alternative',
  'black',
  'white',
  'colour',
  'color',
  'svg',
  'vector',
  'inc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'company',
  'co',
  'llc',
  'gmbh',
  'sa',
  'plc',
])

const isFurniture = (word) => FURNITURE.has(word) || /^(19|20)\d{2}$/.test(word)

const words = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\.(svg|png|jpe?g|gif|webp)$/i, '')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)

export const namesCompany = (file, company) => {
  const want = words(company)
  const have = words(file)
  if (want.length === 0 || have.length < want.length) return false

  /* Rule 2: the company's words open the file name. */
  for (let index = 0; index < want.length; index += 1) {
    if (have[index] !== want[index]) return false
  }

  /* Rule 2, second half: everything after is furniture, not another title. */
  return have.slice(want.length).every(isFurniture)
}
