import Link from 'next/link'
import { Logo } from './Logo'

export function SiteFooter({
  siteName,
  note,
  maintainer,
}: {
  siteName: string
  note?: string | null
  maintainer?: string | null
}) {
  return (
    <footer className="site-footer">
      <div className="page site-footer-inner">
        <div>
          <p className="wordmark-sm">
            <span className="glyph"><Logo size={15} /></span>
            {siteName}
          </p>
          {maintainer ? <p className="note">Written and maintained by {maintainer}.</p> : null}
          <p className="note">{note}</p>
        </div>
        <nav aria-label="Footer">
          <ul>
            <li>
              <Link href="/tools/run-checker">Run checker</Link>
            </li>
            <li>
              <Link href="/quests">Quests</Link>
            </li>
            <li>
              <Link href="/endings">Endings</Link>
            </li>
            <li>
              <Link href="/corrections">Report an error</Link>
            </li>
            <li>
              <Link href="/about">About the data</Link>
            </li>
            <li>
              <Link href="/account">Account</Link>
            </li>
            <li>
              <Link href="/privacy">Privacy</Link>
            </li>
            <li>
              <Link href="/terms">Terms</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
