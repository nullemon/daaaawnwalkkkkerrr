/**
 * Delete the local database files.
 *
 * Not a one-liner because Windows will not delete a file another process has
 * open, and node's own retry handling is silently ignored unless `recursive`
 * is set. What that produced was an EPERM stack trace that says nothing about
 * the actual cause, which is almost always a dev server still running.
 */
import { chmodSync, readdirSync, rmSync } from 'node:fs'

const PREFIX = 'dawnwalker.db'
const files = readdirSync('.').filter((f) => f.startsWith(PREFIX))

if (files.length === 0) {
  console.log('No database to delete.')
  process.exit(0)
}

const stuck = []
for (const file of files) {
  try {
    // A read-only attribute is the other way this fails on Windows.
    try {
      chmodSync(file, 0o666)
    } catch {
      // Not fatal — the delete below is what matters.
    }
    // recursive: true is what makes maxRetries/retryDelay apply at all.
    rmSync(file, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 })
    console.log(`  deleted ${file}`)
  } catch (error) {
    stuck.push({ file, code: error.code })
  }
}

if (stuck.length > 0) {
  console.error('\nCould not delete:')
  for (const { file, code } of stuck) console.error(`  ${file}  (${code})`)
  console.error(
    '\nSomething still has the database open. That is nearly always a dev\n' +
      'server running in another terminal — stop it with Ctrl+C, or close that\n' +
      'window, and run this again.\n\n' +
      'On Windows, to find a Node process that outlived its terminal:\n' +
      '  Get-Process node | Select-Object Id, StartTime\n' +
      '  Stop-Process -Name node        # stops all of them\n\n' +
      'On macOS or Linux:\n' +
      '  pkill -f "next dev"\n',
  )
  process.exit(1)
}
