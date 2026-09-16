import { cache } from 'react'
import { client } from './payload'
import { fromMaps, LABEL_DEFAULTS, UI_DEFAULTS, overridesOnly, type UiMaps } from './ui-registry'

/**
 * The server side of the interface-text overrides.
 *
 * One read of one global per render, cached, turned into two plain maps. The
 * maps are plain because they are also handed to the browser — see
 * `UiStringsProvider` — and a React context carrying a Payload document would
 * ship the whole thing to every reader for the sake of forty short strings.
 *
 * `fromMaps` itself lives in `ui-registry.ts` and is re-exported here. This
 * module imports Payload, and a `'use client'` component that imported it from
 * here would drag the CMS into the browser bundle. Server callers keep the
 * import they had.
 */

export type { Ui, UiMaps } from './ui-registry'
export { fromMaps } from './ui-registry'

export const getUiMaps = cache(async (): Promise<UiMaps> => {
  try {
    const payload = await client()
    const global = await payload.findGlobal({ slug: 'ui-strings', depth: 0 })
    return {
      strings: overridesOnly(global?.strings as never, UI_DEFAULTS),
      labels: overridesOnly(global?.labels as never, LABEL_DEFAULTS),
    }
  } catch {
    /*
      A global that has never been saved, or a database being rebuilt
      underneath a running build. Neither is a reason for a page to fail: the
      registry has a working default for every key, which is the whole point of
      it being a registry.
    */
    return { strings: {}, labels: {} }
  }
})

/** The usual call: `const ui = await getUi()`. */
export const getUi = async () => fromMaps(await getUiMaps())
