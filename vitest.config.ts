import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    /*
      The harvesters live in `tools/` as plain ESM and were unreachable from
      here, which is why the one function whose failures are invisible - the
      wikitext template resolver - had no test until it had already shipped a
      wrong revenue figure on six companies.
    */
    include: ['src/**/*.test.ts', 'tools/**/*.test.mjs'],
  },
})
