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
  isThemeLock,
  lockedTheme,
  type DefaultTheme,
  type ThemeLock,
} from './appearance'

export type Appearance = {
  /**
   * What a reader who has never touched the toggle gets.
   *
   * Meaningless under a lock, and the admin hides the field there rather than
   * leaving an editor a setting with no effect. It is still read and still
   * returned, because lifting the lock has to put the site back where it was.
   */
  defaultTheme: DefaultTheme
  /** Whether readers may switch theme, or which single theme they are held to. */
  lock: ThemeLock
  /**
   * The theme the lock pins the site to, or null when readers may switch.
   *
   * Derived here so the two callers that need it — the boot script and the
   * rail that decides whether to render the toggle — cannot answer the
   * question differently. Two implementations of one finding is the failure
   * this repo keeps meeting.
   */
  locked: 'dark' | 'light' | null
  /** The generated `<style>` body for an accent override; '' when there is none. */
  accent: string
}

/**
 * Dark unless an editor says otherwise, readers free to switch unless an editor
 * says otherwise, and the shipped red unless an editor supplies a legible
 * replacement.
 *
 * Every field is optional and blank means "use what shipped", which is the
 * rule every editable field on this network follows — an empty settings record
 * has to render the site the code does.
 */
export const getAppearance = async (): Promise<Appearance> => {
  const { appearanceTheme, appearanceAccent, appearanceLock } = await getSiteSettings()
  /*
    `isDefaultTheme` rather than trusting the union in payload-types.ts. The
    column is nullable and older rows predate the field, so the value that
    actually comes back can be null — and a null read as a theme would emit
    `data-theme="null"`, which matches no rule in globals.css and would leave
    the page on whatever the system said.

    `isThemeLock` is there for the same reason and it matters more: every
    settings row written before this field existed reads back null, and a null
    compared as `!== 'free'` would lock the whole network to a theme nobody
    chose on the first boot after deploy. `defaultValue` only applies to a row
    being created; `pnpm seed` writes it into the existing one.
  */
  const lock: ThemeLock = isThemeLock(appearanceLock) ? appearanceLock : 'free'
  return {
    defaultTheme: isDefaultTheme(appearanceTheme) ? appearanceTheme : 'dark',
    lock,
    locked: lockedTheme(lock),
    accent: accentStyles(appearanceAccent),
  }
}
