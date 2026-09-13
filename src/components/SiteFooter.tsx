import Link from 'next/link'

export function SiteFooter({ siteName, note }: { siteName: string; note?: string | null }) {
  return (
    <footer className="site-footer">
      <div className="page site-footer-inner">
        <div>
          <p className="wordmark-sm">{siteName}</p>
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
          </ul>
        </nav>
      </div>
    </footer>
  )
}
