'use client'

import { useEffect, useState } from 'react'

/**
 * Is the person reading this page an editor?
 *
 * ## Why the answer cannot come from the server
 *
 * Every public page on this network is prerendered to static HTML, so the
 * markup a reader receives was built long before anybody asked for it and
 * cannot know who is asking. That is the same constraint `Beacon` exists for:
 * there is no request to inspect. So the question is asked from the browser,
 * once, and the answer decides whether an editorial control renders at all.
 *
 * ## Once per browsing session, not once per page
 *
 * `/api/users/me` is a real request and most people who load a page here are
 * readers who will get `{ user: null }`. Asking on every page view would put a
 * round trip on every reader's every page to answer a question about editors.
 *
 * `sessionStorage` holds the answer for the tab: one request on the first page
 * of a visit, none after it. It is deliberately *session* storage rather than
 * `localStorage` — a signed-out editor's stale "yes" should not outlive the
 * tab, and the worst case either way is a badge that renders once and does not
 * belong, never a page a reader cannot see.
 *
 * Every access is wrapped: a private window, blocked site data or a thumbnail
 * capture can make `sessionStorage` throw on read, and the correct behaviour
 * then is to ask the network rather than to crash the page.
 *
 * ## Editors, not readers with accounts
 *
 * `users` are editors; `players` are readers who signed up so their run
 * follows them between devices. Payload's `/api/users/me` only ever answers
 * about the first, which is exactly the distinction wanted: a reader with an
 * account is still a reader and has no business seeing an editorial rating.
 *
 * ## The cookie's reach is the honest limit
 *
 * The session cookie is set by the host the editor signed in on, and Payload
 * sets no `domain`, so it is a host-only cookie. An editor signed in at the
 * apex is recognised on the apex; the wiki subdomains are separate origins and
 * will answer `{ user: null }` there. Setting a parent-domain cookie would fix
 * that and is an auth-scope change rather than a display one, so it is not
 * made here — see the note in the hand-back.
 */

const KEY = 'vellum:is-editor'

const remembered = (): boolean | null => {
  try {
    const held = sessionStorage.getItem(KEY)
    return held === null ? null : held === '1'
  } catch {
    return null
  }
}

const remember = (value: boolean): void => {
  try {
    sessionStorage.setItem(KEY, value ? '1' : '0')
  } catch {
    /* A private window refuses. The answer is simply not cached. */
  }
}

export function useIsEditor(): boolean {
  const [isEditor, setIsEditor] = useState(false)

  useEffect(() => {
    const held = remembered()
    if (held !== null) {
      setIsEditor(held)
      return
    }

    let live = true
    fetch('/api/users/me', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { user?: unknown } | null) => {
        const editor = Boolean(body?.user)
        remember(editor)
        if (live) setIsEditor(editor)
      })
      .catch(() => {
        /*
          Offline, blocked, or the endpoint refused. Not an editor as far as
          this page is concerned, and nothing is cached — the next page asks
          again rather than remembering a network failure as an answer.
        */
      })

    return () => {
      live = false
    }
  }, [])

  return isEditor
}

/**
 * Renders its children only for a signed-in editor.
 *
 * Nothing renders on the server, so a reader's HTML never contains the markup
 * at all — the control appears after hydration, for the handful of people it
 * is for.
 */
export function EditorOnly({ children }: { children: React.ReactNode }) {
  return useIsEditor() ? <>{children}</> : null
}
