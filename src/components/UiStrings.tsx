'use client'

import { createContext, useContext, useMemo } from 'react'
import type { UiMaps, Ui } from '@/lib/ui-registry'
import { fromMaps } from '@/lib/ui-registry'

/**
 * The same interface-text overrides, in the browser.
 *
 * Half of these strings live in client components — the run checker, the
 * comment form, the build planner — which cannot await a global. So the server
 * layout reads the maps once and hands them down, and `useUi()` reads them
 * from context.
 *
 * **There is a default.** A component used outside the provider still works
 * and still says the registry's wording, because the registry is a plain
 * module with no imports and the browser can read it too. That matters more
 * than it sounds: these components are also rendered in tests and in the
 * admin's preview, neither of which has a layout above them, and a missing
 * provider that blanked every label would be a crash with no stack trace
 * pointing anywhere useful.
 *
 * The imports below come from `ui-registry` rather than `ui` for the same
 * reason. `ui` reaches Payload, and a `'use client'` module drags everything it
 * can reach into the browser bundle.
 */

const EMPTY: UiMaps = { strings: {}, labels: {} }

const UiContext = createContext<UiMaps>(EMPTY)

export function UiStringsProvider({
  value,
  children,
}: {
  value: UiMaps
  children: React.ReactNode
}) {
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export const useUi = (): Ui => {
  const maps = useContext(UiContext)
  return useMemo(() => fromMaps(maps), [maps])
}
