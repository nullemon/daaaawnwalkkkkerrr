import { describe, expect, it, vi } from 'vitest'
import { notifyOfReport, reportBody, reportSubject, type Report } from './email-notify'

const correction: Report = {
  collection: 'corrections',
  kind: 'correction',
  id: 12,
  fields: [
    ['Summary', 'The segment cost is wrong'],
    ['Detail', ''],
    ['Page', 'http://dawnwalker.localhost:3000/quests/night-terrors'],
    ['Source offered', null],
  ],
}

const stub = (settings: Record<string, unknown>, sendEmail = vi.fn(async () => ({}))) => ({
  sendEmail,
  findGlobal: async () => settings,
  logger: { info: vi.fn(), warn: vi.fn() },
})

describe('reportSubject', () => {
  it('flattens the reader’s summary before it becomes a header', () => {
    const injected: Report = {
      ...correction,
      fields: [['Summary', 'Bakir\r\nBcc: someone@evil.example']],
    }
    expect(reportSubject(injected, 'Vellum')).toBe(
      '[Vellum] New correction: Bakir Bcc: someone@evil.example',
    )
  })

  /*
    One recipient covers eight wikis, and a subject line is the thing somebody
    copies into a mail rule. A game name here would build a filter that quietly
    matched one site out of eight — the recurring bug of this repository, in a
    header.
  */
  it('names the network or nothing, never a game', () => {
    expect(reportSubject(correction, 'Vellum')).toMatch(/^\[Vellum\] /)
    expect(reportSubject(correction, '')).toBe('New correction: The segment cost is wrong')
  })

  it('falls back to the kind when the summary is somehow empty', () => {
    expect(reportSubject({ ...correction, fields: [['Summary', '']] }, '')).toBe(
      'New correction: correction',
    )
  })
})

describe('reportBody', () => {
  const body = reportBody(correction, 'Vellum', 'reports@site.test')

  it('leaves out the fields the reader did not fill in', () => {
    expect(body).toContain('Summary: The segment cost is wrong')
    expect(body).not.toContain('Detail')
    expect(body).not.toContain('Source offered')
  })

  it('links the record so the queue is one click away', () => {
    expect(body).toContain('/admin/collections/corrections/12')
  })

  /*
    Whoever inherits this site meets the email before the code. An
    unexplained notification with no visible switch is one people route to a
    folder, and the switch is a field most of them will never have seen.
  */
  it('says why it arrived and what the volume policy is', () => {
    expect(body).toContain('reports@site.test')
    expect(body).toContain('There is no digest.')
  })

  it('is plain text with no markup for a stranger’s words to land in', () => {
    expect(body).not.toMatch(/<[a-z]/i)
  })
})

describe('notifyOfReport', () => {
  it('prefers the reports address over the sender', async () => {
    const payload = stub({ reportsEmail: 'queue@site.test', siteName: 'Vellum' })
    await notifyOfReport(payload, correction)
    expect(payload.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'queue@site.test' }),
    )
  })

  /*
    Blank means the shipped behaviour, never "nobody is told". A notification
    setting whose empty state silently means off is indistinguishable from the
    bug this module was written to fix.
  */
  it('falls back to the sender address when the field is blank', async () => {
    const payload = stub({ reportsEmail: '   ', emailFromAddress: 'noreply@site.test' })
    await notifyOfReport(payload, correction)
    expect(payload.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'noreply@site.test' }),
    )
  })

  /*
    The record is the valuable thing; the email is a courtesy. An afterChange
    hook that threw would answer the reader's form with an error on a report
    that was already stored, and they would file it again.
  */
  it('never throws when the provider does, and says which record to go and read', async () => {
    const payload = stub({ reportsEmail: 'queue@site.test' }, vi.fn(async () => {
      throw new Error('relay refused')
    }))
    await expect(notifyOfReport(payload, correction)).resolves.toBeUndefined()
    expect(payload.logger.warn).toHaveBeenCalledWith(expect.stringContaining('corrections/12'))
  })

  it('never throws when the settings read fails either', async () => {
    const payload = {
      sendEmail: vi.fn(async () => ({})),
      findGlobal: async () => Promise.reject(new Error('no db')),
      logger: { info: vi.fn(), warn: vi.fn() },
    }
    await expect(notifyOfReport(payload, correction)).resolves.toBeUndefined()
    // Still sent: a database that will not answer loses the display name, not
    // the notification. The sender is resolved from the environment, which is
    // validated at boot precisely so it can be the floor.
    expect(payload.sendEmail).toHaveBeenCalled()
  })
})
