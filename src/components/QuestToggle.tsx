'use client'

import { useRun } from './RunProvider'

/**
 * The same tick box, on every quest page. Marking a quest here updates the run
 * badge in the header, the dashboard, and every reachability answer on the
 * site at once.
 */
export function QuestToggle({ questId, title }: { questId: string; title: string }) {
  const { isDone, toggleQuest, hydrated } = useRun()
  const done = isDone(questId)

  return (
    <button
      type="button"
      className="quest-toggle"
      data-done={done}
      onClick={() => toggleQuest(questId)}
      aria-pressed={done}
      disabled={!hydrated}
    >
      <span className="tick" aria-hidden="true">
        {done ? '✓' : ''}
      </span>
      <span>
        {done ? 'Done in your run' : 'Mark as done'}
        <span className="sub">
          {done
            ? `${title} counts as finished everywhere on the site`
            : 'Saved in this browser — no account needed'}
        </span>
      </span>
    </button>
  )
}
