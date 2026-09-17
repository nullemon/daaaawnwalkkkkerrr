/**
 * Site settings → Appearance, read once for the whole network.
 *
 * Split from `appearance.ts` so that module stays free of Payload and can be
 * unit-tested without a database. This half is the database half, and the only
 * thing in it is the read and the fallbacks.
 */

import { getSiteSettings } from './payload'
import {
  accentStyles,
  isDefaultTheme,
  type DefaultTheme,
} from './appearance'

export type Appearance = {
  /** What a reader who has never touched the toggle gets. */
  defaultTheme: DefaultTheme
  /** The generated `<style>` body for an accent override; '' when there is none. */
  accent: string
}

/**
 * Dark unless an editor says otherwise, and the shipped red unless an editor
 * supplies a legible replacement.
 *
 * Both fields are optional and blank means "use what shipped", which is the
 * rule every editable field on this network follows — an empty settings record
 * has to render the site the code does.
 */
export const getAppearance = async (): Promise<Appearance> => {
  const { appearanceTheme, appearanceAccent } = await getSiteSettings()
  /*
    `isDefaultTheme` rather than trusting the union in payload-types.ts. The
    column is nullable and older rows predate the field, so the value that
    actually comes back can be null — and a null read as a theme would emit
    `data-theme="null"`, which matches no rule in globals.css and would leave
    the page on whatever the system said.
  */
  return {
    defaultTheme: isDefaultTheme(appearanceTheme) ? appearanceTheme : 'dark',
    accent: accentStyles(appearanceAccent),
  }
}
