/**
 * The two appearance settings an editor can change, and the guard on the one
 * that can make the site unreadable.
 *
 * Kept free of React and of Payload types so the contrast maths can be
 * unit-tested without a renderer or a database — the same reason
 * `reachability.ts` and `legal.ts` are written this way.
 */

export const THEME_STORAGE_KEY = 'dw-theme'

/** What the network shows a reader who has never touched the toggle. */
export type DefaultTheme = 'dark' | 'light' | 'system'

export const isDefaultTheme = (value: unknown): value is DefaultTheme =>
  value === 'dark' || value === 'light' || value === 'system'

/* ---------- contrast ---------------------------------------------------- */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** `#abc` and `#aabbcc`, and nothing else. Anything else is not a colour. */
export const isHexColour = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value.trim())

const channels = (hex: string): [number, number, number] => {
  const h = hex.trim().slice(1)
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number]
}

const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** WCAG relative luminance. */
export const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. */
export const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/*
  The two grounds and the button text the accent has to survive.

  One accent serves both themes, so it has to be legible on both. These three
  hexes are the shipped `--ground` values and the `#fff` that sits on every
  accent-filled button; if the palette moves, these move with it.
*/
const DARK_GROUND = '#131211'
const LIGHT_GROUND = '#eef0f4'
const ON_ACCENT = '#ffffff'

/*
  3:1, not 4.5:1, and deliberately.

  The accent is never body text — links are --accent-hot and labels are --ink.
  It is a border, a fill, an icon and a marker, which is what WCAG 1.4.11
  covers, and that threshold is 3:1. Holding an accent to 4.5 would reject
  most brand reds including the one this site ships.
*/
const MIN_RATIO = 3

export type AccentCheck = { ratio: number; against: string; label: string; passes: boolean }

/**
 * Every measurement an editor should see before a chosen accent goes live.
 *
 * Returned rather than thrown: the caller decides whether an unreadable accent
 * is refused outright or merely reported, and the numbers are the same either
 * way.
 */
export const checkAccent = (hex: string): AccentCheck[] => {
  const measure = (against: string, label: string): AccentCheck => {
    const ratio = contrast(hex, against)
    return { ratio, against, label, passes: ratio >= MIN_RATIO }
  }
  return [
    measure(DARK_GROUND, 'on the dark page'),
    measure(LIGHT_GROUND, 'on the light page'),
    measure(ON_ACCENT, 'white button text on it'),
  ]
}

/**
 * The sentence an editor gets at the point they set the accent, or null.
 *
 * `LegalGap` is the model: a value that cannot be trusted says so where it is
 * entered, not silently on the page it breaks. An accent with no contrast is
 * not a matter of taste — it is a button nobody can read — so this one refuses
 * rather than warns, and names the numbers so the refusal is arguable.
 */
export const accentRefusal = (hex: string): string | null => {
  if (!isHexColour(hex)) return 'Use a hex colour such as #d13a44.'
  const failures = checkAccent(hex).filter((c) => !c.passes)
  if (failures.length === 0) return null
  const measured = failures.map((c) => `${c.ratio.toFixed(2)}:1 ${c.label}`).join(', ')
  return `${hex} does not have enough contrast to use as an accent: ${measured}. Anything used as a border, a fill or an icon needs 3:1, and this colour fills buttons in both themes. Pick a darker or a lighter shade of it.`
}

/* ---------- the generated stylesheet ------------------------------------ */

/*
  Why the selectors are doubled up.

  globals.css states the palette three times over — bare `:root` is dark,
  `:root[data-theme='light']` is the explicit choice, and a
  prefers-colour-scheme block covers the case where neither attribute is set.
  Their specificities are (0,1,0), (0,2,0) and (0,3,0), and they rely on
  climbing in exactly that order.

  An override that landed on a plain `:root` would win in dark and silently
  lose in light. So each rule here repeats `:root` once more than the rule it
  is overriding, which keeps the same climb one rung higher and leaves the
  three-way behaviour of the toggle untouched.
*/
const accentRule = (selector: string, accent: string, mode: 'dark' | 'light') =>
  mode === 'dark'
    ? `${selector}{--accent:${accent};` +
      `--accent-hot:color-mix(in oklab, ${accent} 72%, #fff);` +
      `--accent-dim:color-mix(in oklab, ${accent} 58%, #000);` +
      `--accent-wash:color-mix(in oklab, ${accent} 17%, #000)}`
    : `${selector}{--accent:${accent};` +
      `--accent-hot:color-mix(in oklab, ${accent} 82%, #000);` +
      `--accent-dim:color-mix(in oklab, ${accent} 38%, #fff);` +
      `--accent-wash:color-mix(in oklab, ${accent} 9%, #fff)}`

/**
 * The `<style>` body for an accent override, or '' when there is nothing to
 * override.
 *
 * Blank means "use the shipped red", never "use nothing" — the same rule the
 * editable copy follows, and the reason an empty settings record renders the
 * site the code does. The value is re-validated here as well as in the admin:
 * this string reaches the document, and a field validator is a convenience
 * rather than a boundary.
 */
export const accentStyles = (accent?: string | null): string => {
  if (!accent || !isHexColour(accent) || accentRefusal(accent)) return ''
  const hex = accent.trim().toLowerCase()
  return [
    accentRule(':root:root', hex, 'dark'),
    accentRule(":root:root[data-theme='light']", hex, 'light'),
    `@media (prefers-color-scheme: light){` +
      accentRule(":root:root:not([data-theme='dark']):not([data-theme='light'])", hex, 'light') +
      `}`,
  ].join('')
}

/* ---------- the script that runs before first paint --------------------- */

/**
 * Resolves the theme onto `<html>` before anything is painted.
 *
 * It has to be inline and it has to be synchronous. Anything that runs after
 * first paint has already shown the reader the other theme, which is the whole
 * failure this exists to prevent.
 *
 * The order is: a reader's remembered choice, then the network default, then
 * nothing at all. "Nothing at all" is what makes `system` work — with no
 * `data-theme` attribute the prefers-colour-scheme block in globals.css is the
 * only thing deciding, which is exactly what following the system means.
 */
export const themeBootScript = (fallback: DefaultTheme = 'dark'): string =>
  `(function(){var t='';` +
  // The try wraps only the read. Blocked site storage throws here, and with
  // the whole body inside the try that throw also swallowed the network
  // default — a reader in a private window got the system theme no matter
  // what the admin had set, silently.
  `try{t=localStorage.getItem('${THEME_STORAGE_KEY}')||''}catch(e){}` +
  `if(t!=='light'&&t!=='dark'){t=${JSON.stringify(fallback === 'system' ? '' : fallback)}}` +
  `if(t)document.documentElement.setAttribute('data-theme',t)})()`
