import type { SVGProps } from 'react'

/**
 * One icon set, drawn on a 24×24 grid with a 1.7 stroke and round joins.
 *
 * A database of weapons, quests and bosses that is nothing but text tables
 * reads as unfinished no matter how good the data is. These carry the
 * category at a glance and, unlike game art, we own them outright — so they
 * also serve as the fallback wherever a record has no image attached yet.
 */

export type IconName =
  | 'sword' | 'armour' | 'ring' | 'book' | 'flask' | 'herb' | 'key'
  | 'scroll' | 'skull' | 'crown' | 'map' | 'person' | 'star'
  | 'sun' | 'moon' | 'hourglass' | 'check' | 'lock' | 'warn'
  | 'search' | 'chevron' | 'external' | 'claw' | 'shield' | 'blood' | 'spark'
  | 'home'

const PATHS: Record<IconName, React.ReactNode> = {
  home: <><path d="M3.8 10.4 12 3.6l8.2 6.8v8.4a1.6 1.6 0 0 1-1.6 1.6H5.4a1.6 1.6 0 0 1-1.6-1.6v-8.4Z" /><path d="M9.6 20.4v-6.8h4.8v6.8" /></>,
  sword: <><path d="M20.5 3.5 11 13m0 0 1.8 1.8M11 13 9.2 11.2M20.5 3.5h-3.7L8.4 11.9l3.7 3.7 8.4-8.4V3.5Z" /><path d="M7.6 12.7 4 16.3l3.7 3.7 3.6-3.6M5.2 17.9 3 20.1" /></>,
  armour: <><path d="M12 3 5 5.4v6.1c0 4.2 2.9 7.5 7 9.5 4.1-2 7-5.3 7-9.5V5.4L12 3Z" /><path d="M12 3.4v17.4M8.4 8h7.2" /></>,
  ring: <><circle cx="12" cy="14.5" r="5.5" /><path d="m9.3 9.6 1-3.9h3.4l1 3.9M12 3v2.7" /></>,
  book: <><path d="M4 4.8v13.4c0 .9.8 1.6 1.7 1.6H19V4.2H5.7C4.8 4.2 4 4 4 4.8Z" /><path d="M4 17.2h15M8.2 8h6.4M8.2 11.2h4.8" /></>,
  flask: <><path d="M9.6 3.2v5.3L4.9 17a2.4 2.4 0 0 0 2.1 3.6h10a2.4 2.4 0 0 0 2.1-3.6l-4.7-8.5V3.2" /><path d="M8.4 3.2h7.2M6.6 14.2h10.8" /></>,
  herb: <><path d="M12 21V9.8" /><path d="M12 12.6c-4.4 0-6.6-2.4-6.6-6.6 4.4 0 6.6 2.2 6.6 6.6ZM12 10.4c0-3.8 1.9-5.8 5.7-5.8 0 3.8-1.9 5.8-5.7 5.8Z" /></>,
  key: <><circle cx="7.5" cy="8.5" r="4" /><path d="m10.4 11.4 8 8M16.3 17.3l1.8-1.8M18.6 19.6l1.9-1.9" /></>,
  scroll: <><path d="M6.6 3.6h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11" /><path d="M6.6 3.6a2 2 0 0 0-2 2v2h4v-2a2 2 0 0 0-2-2ZM6.6 20.6a2 2 0 0 0 2-2v-2h-4v2a2 2 0 0 0 2 2Z" /><path d="M10.4 9h6M10.4 12.4h6" /></>,
  skull: <><path d="M12 2.8c-4.5 0-7.6 3.1-7.6 7.4 0 2.6 1 4.2 2.3 5.3.6.5.9 1.1.9 1.8v1.6c0 1.3 1 2.3 2.3 2.3h4.2c1.3 0 2.3-1 2.3-2.3v-1.6c0-.7.3-1.3.9-1.8 1.3-1.1 2.3-2.7 2.3-5.3 0-4.3-3.1-7.4-7.6-7.4Z" /><circle cx="9.1" cy="11.2" r="1.5" /><circle cx="14.9" cy="11.2" r="1.5" /><path d="M12 15.4v2.4" /></>,
  crown: <><path d="M3.6 7.4 6.4 16h11.2l2.8-8.6-4.6 3.2L12 4.6l-3.8 6L3.6 7.4Z" /><path d="M6.4 19.4h11.2" /></>,
  map: <><path d="m9 4.2-5.2 2.3v13.3L9 17.5m0-13.3 6 2.6m-6-2.6v13.3m6-10.7 5.2-2.3v13.3L15 19.8m0-13.3v13.3m-6-2.3 6 2.3" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4.8 20.6c0-3.6 3.2-6.2 7.2-6.2s7.2 2.6 7.2 6.2" /></>,
  star: <><path d="m12 3.2 2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 17.2l-5.6 3.2 1.3-6.3L2.9 9.8l6.4-.7L12 3.2Z" /></>,
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6 6 18M18 6l1.6-1.6" /></>,
  moon: <><path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.8 8.8 0 1 0 11 11Z" /></>,
  hourglass: <><path d="M6.4 3h11.2M6.4 21h11.2" /><path d="M7.6 3v3.3c0 1 .4 1.9 1.1 2.6L12 12l-3.3 3.1c-.7.7-1.1 1.6-1.1 2.6V21M16.4 3v3.3c0 1-.4 1.9-1.1 2.6L12 12l3.3 3.1c.7.7 1.1 1.6 1.1 2.6V21" /></>,
  check: <path d="m4.5 12.6 5 5 10-11" />,
  lock: <><rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2" /><path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8" /></>,
  warn: <><path d="M12 3.4 2.6 20h18.8L12 3.4Z" /><path d="M12 9.6v4.6M12 17.2v.6" /></>,
  search: <><circle cx="10.6" cy="10.6" r="6.6" /><path d="m15.4 15.4 5 5" /></>,
  chevron: <path d="m9 5.4 6.6 6.6L9 18.6" />,
  external: <><path d="M14.4 4.2h5.4v5.4M19.2 4.8 11 13" /><path d="M17.2 13.6v5.2a1.8 1.8 0 0 1-1.8 1.8H5.2a1.8 1.8 0 0 1-1.8-1.8V8.6a1.8 1.8 0 0 1 1.8-1.8h5.2" /></>,
  claw: <><path d="M5.2 3.4c1.4 3.8 2 7 1.9 9.6M10.6 2.6c.8 4 .8 7.3.2 9.9M16 3.4c-.2 4-.8 7.2-1.7 9.6" /><path d="M4 13.6c0 4.2 3.4 7.4 7.8 7.4s7.8-3.2 7.8-7.4" /></>,
  shield: <><path d="M12 3.2 4.8 5.8v5.6c0 4.4 2.9 8 7.2 9.4 4.3-1.4 7.2-5 7.2-9.4V5.8L12 3.2Z" /></>,
  blood: <><path d="M12 3.2s6 6.6 6 10.4a6 6 0 0 1-12 0c0-3.8 6-10.4 6-10.4Z" /><path d="M9.4 13.8a2.6 2.6 0 0 0 2.6 2.6" /></>,
  spark: <><path d="M12 2.8v4M12 17.2v4M4.6 12h4M15.4 12h4" /><path d="m6.8 6.8 2.8 2.8M14.4 14.4l2.8 2.8M17.2 6.8l-2.8 2.8M9.6 14.4l-2.8 2.8" /></>,
}

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
  label?: string
}

export function Icon({ name, size = 20, label, ...rest }: IconProps) {
  const node = PATHS[name]
  if (!node) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      {node}
    </svg>
  )
}

/** Which icon stands for a given item category. */
export const ICON_FOR_CATEGORY: Record<string, IconName> = {
  weapon: 'sword',
  armour: 'armour',
  ring: 'ring',
  manual: 'book',
  recipe: 'flask',
  consumable: 'flask',
  ingredient: 'herb',
  quest: 'key',
}

/** …and for a kind of quest. */
export const ICON_FOR_QUEST_KIND: Record<string, IconName> = {
  main: 'crown',
  ally: 'person',
  court: 'crown',
  side: 'scroll',
  contract: 'scroll',
  prologue: 'hourglass',
}

export const ICON_FOR_TREE: Record<string, IconName> = {
  swordmastery: 'sword',
  witchcraft: 'spark',
  vampirism: 'claw',
}
