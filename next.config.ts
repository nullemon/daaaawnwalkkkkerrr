import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const nextConfig: NextConfig = {
  /*
   * The route-status badge Next.js floats in the corner during development.
   *
   * It never shipped — it is absent from the production HTML entirely — but in
   * development it sits on top of the bottom-left of every page, which is
   * where the site rail's theme toggle and run readout live. It also lands in
   * the corner of every screenshot taken to check a layout.
   *
   * Turning it off does not hide anything that matters: compile and runtime
   * errors are still surfaced, they just are not announced by a badge over the
   * interface. `next build --debug` remains the way to check whether a route
   * is static or dynamic.
   */
  devIndicators: false,
  /*
   * `X-Powered-By: Next.js` on every response names the framework to anybody
   * scanning for one. It carries nothing a reader needs.
   */
  poweredByHeader: false,
  /*
   * Response headers every host serves.
   *
   * Set here rather than at the edge so they hold wherever the site is
   * deployed, in one place somebody can read. No
   * Content-Security-Policy: the theme script that stamps `data-theme` before
   * first paint is inline by necessity (see `layout.tsx`), the JSON-LD is
   * inline by convention, and the owner's analytics snippets are inline by
   * nature, so a policy strict enough to mean anything would need a nonce per
   * response — which a prerendered page cannot carry. The headers below are
   * the ones that cost nothing and close something each.
   *
   * `frame-ancestors` by way of `X-Frame-Options`: nothing here is meant to be
   * embedded, and a wiki page in somebody else's iframe is a clickjacking
   * surface over the ratings and comment forms. The admin is covered by the
   * same rule, which is the one that matters.
   */
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
      },
      // Two years, with subdomains: every wiki is one. Preload is the owner's
      // call once the domain is settled, because it cannot be undone quickly.
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
    ]
    return [{ source: '/:path*', headers: security }]
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
