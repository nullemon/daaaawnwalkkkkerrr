import { adminUrl } from '@/lib/admin-path'

/**
 * The two network screens, in the sidebar.
 *
 * A root view exists at a URL and nothing links to it, so each one needs a
 * nav entry — the same reason `AnalyticsNavLink` and `RemoteNavLink` exist.
 * Rendered first among the extras, because "which wiki, and is it ready" is
 * the question an editor arrives with more often than "who read it".
 */
export default function WikiNavLink() {
  return (
    <>
      <div className="net-nav-extra">
        <a className="net-nav-extra-link" href={adminUrl('/wiki')}>
          Wikis
        </a>
        <span className="net-nav-extra-note">One screen per subdomain: what it has, what it lacks.</span>
      </div>
      <div className="net-nav-extra">
        <a className="net-nav-extra-link" href={adminUrl('/seo')}>
          SEO &amp; indexing
        </a>
        <span className="net-nav-extra-note">Every host as a search engine sees it.</span>
      </div>
    </>
  )
}
