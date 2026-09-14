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
