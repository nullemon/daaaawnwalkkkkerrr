'use client'

import { useState } from 'react'
import { Icon } from './Icon'
import { useUi } from './UiStrings'

/**
 * Share this page, without letting anybody else watch it happen.
 *
 * ## No widgets, no scripts, no pixels
 *
 * Every service here offers a drop-in button, and every one of those is a
 * third-party script that loads on page render and reports a reader to a
 * company they did not visit. This network prerenders every public page to
 * static HTML and its analytics are first-party by design — `Beacon` posting
 * to one route this repository owns, with no address and no user-agent stored
 * (see the Analytics section of CLAUDE.md). A share widget would undo both
 * halves of that in one import, and nothing about it would show up as a
 * failure: the buttons would look right and work.
 *
 * So these are plain anchors to each service's own share endpoint. Nothing is
 * requested until a reader presses one, and what is sent is what they chose to
 * send: the address of the page they are on.
 *
 * ## No service logos
 *
 * The names are words. A brand mark is somebody else's trademark, and drawing
 * approximations of four of them in this site's 1.7-stroke icon set would be
 * both legally sillier and visually wrong — the set is one hand and these
 * would be four others. `Icon`'s `share` glyph is a generic one.
 *
 * ## The copy control is an anchor, on purpose
 *
 * It is `<a href={url}>` before it is a button. Without JavaScript it is a
 * link to the page you are already on, which a reader can copy from the
 * context menu — the thing they were trying to do. With JavaScript the click
 * is intercepted and the address goes to the clipboard.
 *
 * `navigator.clipboard` is undefined outside a secure context and can be
 * refused by permission, so the failure is a stated one rather than a
 * pretended success: "Copy did not work — the address is in your browser bar".
 * Flashing "Link copied" at somebody whose clipboard is empty is the small
 * version of the lie this whole project is organised against.
 *
 * ## Only articles get one
 *
 * A quest or an item is a compiled fact sheet, and a row of share buttons on
 * 1,500 of them is furniture. Guides are written, so guides are shared. This
 * component takes the URL rather than reading the location, because the page
 * it sits on is prerendered and its canonical address is a thing the server
 * already knows exactly — a wiki is its own origin and `window.location` on a
 * preview or a proxy would not be it.
 */
export function ShareRow({
  url,
  title,
  tone = 'top',
}: {
  /** The page's own absolute, canonical URL. */
  url: string
  /** The headline, for the services that pre-fill one. */
  title: string
  /** `top` sits under the byline, `foot` closes the article. */
  tone?: 'top' | 'foot'
}) {
  const ui = useUi()
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const page = encodeURIComponent(url)
  const text = encodeURIComponent(title)

  /*
    Three destinations, chosen for what this site is rather than for what is
    popular in general. Reddit is where a game wiki is actually passed around;
    X and Facebook are the two that still unfurl an Open Graph card, which
    `socialMeta` has already written for this page. Discord matters as much as
    Reddit and has no share endpoint at all — a URL pasted into a channel is
    the whole mechanism — which is the other reason copy-link is here and is
    not an afterthought.
  */
  const targets: { key: string; href: string }[] = [
    { key: 'share.x', href: `https://x.com/intent/post?url=${page}&text=${text}` },
    { key: 'share.reddit', href: `https://www.reddit.com/submit?url=${page}&title=${text}` },
    { key: 'share.facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${page}` },
  ]

  const copy = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!navigator.clipboard?.writeText) return // No JS clipboard: let the link be a link.
    event.preventDefault()
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <div className="sharerow" data-tone={tone}>
      <span className="sharerow-label">
        <Icon name="share" size={15} className="ic" />
        {ui.t('share.heading')}
      </span>
      <span className="sharerow-links">
        {targets.map((target) => (
          <a
            key={target.key}
            className="sharelink"
            href={target.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {ui.t(target.key)}
          </a>
        ))}
        <a className="sharelink" href={url} onClick={copy}>
          <Icon name="link" size={14} className="ic" />
          {ui.t('share.copy')}
        </a>
      </span>
      {/*
        One live region, always in the document, so a screen reader announces
        the outcome instead of a control silently changing under it. Empty
        while nothing has happened — `.sharerow-said:empty` takes no space.
      */}
      <span
        className="sharerow-said"
        role="status"
        aria-live="polite"
        data-state={state === 'idle' ? undefined : state}
      >
        {state === 'copied' ? ui.t('share.copied') : null}
        {state === 'failed' ? ui.t('share.copy-failed') : null}
      </span>
    </div>
  )
}
