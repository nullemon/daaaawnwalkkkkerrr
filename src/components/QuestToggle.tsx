'use client'

import { useRun } from './RunProvider'
import { useUi } from './UiStrings'
import { fill } from '@/lib/copy'

/**
 * The same tick box, on every quest page. Marking a quest here updates the run
 * badge in the header, the dashboard, and every reachability answer on the
 * site at once.
 */
export function QuestToggle({ questId, title }: { questId: string; title: string }) {
  const ui = useUi()
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
        {done ? ui.t('quest.done') : ui.t('quest.mark-done')}
        <span className="sub">
          {done ? fill(ui.t('quest.done-sub'), { title }) : ui.t('quest.not-done-sub')}
        </span>
      </span>
    </button>
  )
}
