import { describe, expect, it } from 'vitest'
import {
  EmailConfigError,
  fromHeader,
  isDeliverableAddress,
  mailgunEndpoint,
  resolveEmailSettings,
  resolveSender,
} from './email'

/**
 * These pin the two directions that matter, the same way `harvest.test.ts`
 * does: a misconfiguration must be refused *and named*, and a valid
 * configuration must not be refused. An over-strict check on a credential is
 * as expensive as a missing one — it is the Antar 4 rule applied to API keys,
 * and the reason none of the provider key checks below is a shape match except
 * the one the provider documents.
 */

const base = { EMAIL_FROM_ADDRESS: 'noreply@codewebmedia.com' }

const problem = (env: Record<string, string | undefined>): EmailConfigError => {
  try {
    resolveEmailSettings(env)
  } catch (error) {
    if (error instanceof EmailConfigError) return error
    throw error
  }
  throw new Error('expected resolveEmailSettings to refuse this configuration')
}

describe('the default', () => {
  it('is console, so a clone with an empty .env still boots', () => {
    const settings = resolveEmailSettings({})
    expect(settings.provider).toBe('console')
  })

  it('does not demand a from-address, because console does not send', () => {
    expect(() => resolveEmailSettings({ EMAIL_PROVIDER: 'console' })).not.toThrow()
  })

  it('refuses a provider name it does not have', () => {
    expect(problem({ EMAIL_PROVIDER: 'sendgrid' }).variable).toBe('EMAIL_PROVIDER')
  })
})

describe('the sender', () => {
  it('is required for any provider that actually sends', () => {
    expect(problem({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' }).variable).toBe(
      'EMAIL_FROM_ADDRESS',
    )
  })

  it('refuses an example.com address, which can never receive a bounce', () => {
    const error = problem({
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_x',
      EMAIL_FROM_ADDRESS: 'noreply@example.com',
    })
    expect(error.variable).toBe('EMAIL_FROM_ADDRESS')
    expect(error.message).toMatch(/stand-in/)
  })

  it('refuses an address with no domain dot', () => {
    expect(
      problem({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_x',
        EMAIL_FROM_ADDRESS: 'noreply@localhost',
      }).variable,
    ).toBe('EMAIL_FROM_ADDRESS')
  })

  it('accepts plus-addressing and a long TLD', () => {
    expect(isDeliverableAddress('a.b+tag@mail.codewebmedia.digital')).toBe(true)
  })

  it('quotes a display name, so a comma cannot break the header', () => {
    expect(fromHeader({ address: 'a@b.com', name: 'Vellum, the network' })).toBe(
      '"Vellum, the network" <a@b.com>',
    )
  })

  it('sends a bare address rather than inventing a name', () => {
    expect(fromHeader({ address: 'a@b.com' })).toBe('a@b.com')
  })
})

describe('Site settings override the environment', () => {
  const env = { address: 'env@codewebmedia.com', name: 'Env', replyTo: 'env-reply@codewebmedia.com' }

  it('uses the stored values when they are filled in', () => {
    expect(
      resolveSender(env, {
        fromName: 'Vellum',
        fromAddress: 'hello@codewebmedia.com',
        replyTo: 'reply@codewebmedia.com',
      }),
    ).toEqual({
      address: 'hello@codewebmedia.com',
      name: 'Vellum',
      replyTo: 'reply@codewebmedia.com',
    })
  })

  it('falls back to the environment for every field left blank', () => {
    expect(resolveSender(env, { fromName: '', fromAddress: null, replyTo: undefined })).toEqual(env)
  })

  it('throws rather than quietly ignoring a stored address that cannot work', () => {
    expect(() => resolveSender(env, { fromAddress: 'noreply@example.com' })).toThrow(
      EmailConfigError,
    )
  })
})

describe('mailgun', () => {
  const mailgun = {
    ...base,
    EMAIL_PROVIDER: 'mailgun',
    MAILGUN_API_KEY: 'abc123',
    MAILGUN_DOMAIN: 'mg.codewebmedia.com',
  }

  it('defaults to the US endpoint', () => {
    const settings = resolveEmailSettings(mailgun)
    expect(settings.provider === 'mailgun' && settings.region).toBe('us')
    expect(mailgunEndpoint('us', 'mg.codewebmedia.com')).toBe(
      'https://api.mailgun.net/v3/mg.codewebmedia.com/messages',
    )
  })

  // The whole reason MAILGUN_REGION exists: one label of difference, and a 401
  // that everybody debugs as a bad key.
  it('uses a different host entirely in the EU', () => {
    expect(mailgunEndpoint('eu', 'mg.codewebmedia.com')).toBe(
      'https://api.eu.mailgun.net/v3/mg.codewebmedia.com/messages',
    )
  })

  it('refuses a region that is neither', () => {
    expect(problem({ ...mailgun, MAILGUN_REGION: 'europe' }).variable).toBe('MAILGUN_REGION')
  })

  // Both directions: the newline a copy-paste adds is trimmed and forgiven,
  // the break in the middle of a wrapped key is not, because it cannot be.
  it('trims the newline a pasted key arrives with', () => {
    const settings = resolveEmailSettings({ ...mailgun, MAILGUN_API_KEY: 'abc123\n' })
    expect(settings.provider === 'mailgun' && settings.apiKey).toBe('abc123')
  })

  it('refuses a key with whitespace in the middle of it', () => {
    expect(problem({ ...mailgun, MAILGUN_API_KEY: 'abc123 def456' }).variable).toBe(
      'MAILGUN_API_KEY',
    )
  })

  it('accepts every key format Mailgun has issued', () => {
    for (const key of [
      'key-3ax6xnjp29jd6fds4gc373sgvjxteol0',
      '3ax6xnjp29jd6fds4gc373sgvjxteol0',
      '0f3d1b2c-4a5e-6f70-8192-a3b4c5d6e7f8-1a2b3c4d-5e6f7a8b',
    ]) {
      expect(() => resolveEmailSettings({ ...mailgun, MAILGUN_API_KEY: key })).not.toThrow()
    }
  })

  it('refuses a website address where the sending domain belongs', () => {
    expect(problem({ ...mailgun, MAILGUN_DOMAIN: 'https://mg.codewebmedia.com' }).variable).toBe(
      'MAILGUN_DOMAIN',
    )
  })
})

describe('resend', () => {
  it('pins the one key shape the provider documents', () => {
    expect(problem({ ...base, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'whsec_abc' }).variable).toBe(
      'RESEND_API_KEY',
    )
    expect(() =>
      resolveEmailSettings({ ...base, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_abc' }),
    ).not.toThrow()
  })
})

describe('smtp', () => {
  const smtp = { ...base, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.postmarkapp.com' }

  it('derives implicit TLS from the port, which is what providers document', () => {
    const plain = resolveEmailSettings({ ...smtp, SMTP_PORT: '587' })
    const wrapped = resolveEmailSettings({ ...smtp, SMTP_PORT: '465' })
    expect(plain.provider === 'smtp' && plain.secure).toBe(false)
    expect(wrapped.provider === 'smtp' && wrapped.secure).toBe(true)
  })

  it('lets a relay that disagrees say so', () => {
    const forced = resolveEmailSettings({ ...smtp, SMTP_PORT: '2525', SMTP_SECURE: 'true' })
    expect(forced.provider === 'smtp' && forced.secure).toBe(true)
  })

  it('allows an unauthenticated relay', () => {
    expect(() => resolveEmailSettings(smtp)).not.toThrow()
  })

  // Half a credential is somebody who thinks they set both.
  it('refuses a username with no password', () => {
    expect(problem({ ...smtp, SMTP_USER: 'apikey' }).variable).toBe('SMTP_PASSWORD')
    expect(problem({ ...smtp, SMTP_PASSWORD: 'secret' }).variable).toBe('SMTP_USER')
  })

  it('refuses a port that is not one', () => {
    expect(problem({ ...smtp, SMTP_PORT: 'smtp' }).variable).toBe('SMTP_PORT')
    expect(problem({ ...smtp, SMTP_PORT: '70000' }).variable).toBe('SMTP_PORT')
  })
})
