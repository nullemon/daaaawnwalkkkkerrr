/**
 * Which email provider this deployment sends through, read off the environment.
 *
 * The provider is chosen by `EMAIL_PROVIDER` rather than by editing code,
 * because the person who owns the credentials is not the person who owns the
 * repository. Their whole job is pasting keys into `.env`.
 *
 * The failure this module exists to prevent is the one this project keeps
 * hitting: something that looks successful and does nothing. An email is the
 * purest form of it — `sendEmail` resolves, the request returns 200, the
 * reader sees "check your inbox", and nothing ever arrives. There is no log
 * line, because nothing failed. So every problem that *can* be found without a
 * network round-trip is found here, at boot, and named by its variable.
 *
 * Deliberately free of Payload and of `process` so it can be unit-tested
 * against a plain object — the same reason `reachability.ts` is free of
 * Payload types. `email-adapter.ts` is the half that talks to the network.
 */

import { isProvisional } from './legal'

export const EMAIL_PROVIDERS = ['console', 'mailgun', 'resend', 'smtp'] as const

export type EmailProvider = (typeof EMAIL_PROVIDERS)[number]

/** Mailgun runs two entirely separate stacks. See `mailgunEndpoint` below. */
export const MAILGUN_REGIONS = ['us', 'eu'] as const

export type MailgunRegion = (typeof MAILGUN_REGIONS)[number]

/**
 * A configuration problem, named by the variable that caused it.
 *
 * Thrown at boot, never at send time. A message that does not name the
 * variable is useless to somebody holding a `.env` file, so `variable` is
 * required and the formatted message always carries it.
 */
export class EmailConfigError extends Error {
  readonly variable: string

  constructor(variable: string, problem: string) {
    super(`${variable}: ${problem}`)
    this.name = 'EmailConfigError'
    this.variable = variable
  }
}

/** The sender, before the Site settings overlay in `email-adapter.ts`. */
export type EmailSender = {
  address: string
  name?: string
  replyTo?: string
}

export type EmailSettings = {
  sender: EmailSender
  /** Route every message to one inbox. Staging only — see the note on the var. */
  overrideRecipient?: string
} & (
  | { provider: 'console' }
  | { provider: 'mailgun'; apiKey: string; domain: string; region: MailgunRegion }
  | { provider: 'resend'; apiKey: string }
  | {
      provider: 'smtp'
      host: string
      port: number
      secure: boolean
      user?: string
      password?: string
    }
)

export type EmailEnv = Record<string, string | undefined>

/*
  Permissive on purpose.

  A filter written to stop bad records is still a filter, and an over-broad one
  throws away the good ones just as silently — the rule that deleted Antar 4.
  So this checks only the three things that are always true of a deliverable
  address and never true of a typo: exactly one `@`, no whitespace, and a
  dotted domain. Anything subtler (plus-addressing, unicode local parts, quoted
  strings) is the provider's business, not ours.

  A dotted domain does reject `postmaster@localhost`. That is correct for a
  *from* address on a public site: a bare hostname is not routable from a
  reader's mail server.
*/
const ADDRESS = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export const isDeliverableAddress = (value: string): boolean => ADDRESS.test(value.trim())

const read = (env: EmailEnv, key: string): string | undefined => {
  const value = env[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const required = (env: EmailEnv, key: string, why: string): string => {
  const value = read(env, key)
  if (!value) throw new EmailConfigError(key, why)
  return value
}

/**
 * An address that must be both well-formed and not a stand-in.
 *
 * `isProvisional` is the same backstop the privacy policy uses, and it belongs
 * here for a sharper reason: `@example.com` is IANA-reserved, so a from-address
 * there can never be a working inbox — but it *is* syntactically valid, so
 * every provider accepts the API call and the message bounces somewhere the
 * operator never looks. Enough of those and the sending domain's reputation is
 * gone. Refusing to boot is cheaper.
 */
export const checkAddress = (variable: string, value: string): string => {
  if (!isDeliverableAddress(value)) {
    throw new EmailConfigError(variable, `"${value}" is not a usable email address`)
  }
  if (isProvisional(value)) {
    throw new EmailConfigError(
      variable,
      `"${value}" looks like a stand-in. example.com is reserved for documentation and can never receive mail, so anything sent from it bounces where nobody is looking`,
    )
  }
  return value
}

const asProvider = (raw: string | undefined): EmailProvider => {
  if (!raw) return 'console'
  const value = raw.toLowerCase()
  if ((EMAIL_PROVIDERS as readonly string[]).includes(value)) return value as EmailProvider
  throw new EmailConfigError(
    'EMAIL_PROVIDER',
    `"${raw}" is not a provider. One of: ${EMAIL_PROVIDERS.join(', ')}`,
  )
}

const senderFrom = (env: EmailEnv, provider: EmailProvider): EmailSender => {
  const replyToRaw = read(env, 'EMAIL_REPLY_TO')
  const replyTo = replyToRaw ? checkAddress('EMAIL_REPLY_TO', replyToRaw) : undefined
  const name = read(env, 'EMAIL_FROM_NAME')
  const addressRaw = read(env, 'EMAIL_FROM_ADDRESS')

  /*
    `console` is the only provider that may boot without a sender, because it
    is the only one that does not send. A fresh clone with an empty `.env` has
    to run — that is the whole reason console is the default — and demanding a
    from-address in order to print a log line would break it.
  */
  if (provider === 'console') {
    return {
      address: addressRaw && isDeliverableAddress(addressRaw) ? addressRaw : 'console@localhost',
      name,
      replyTo,
    }
  }

  const address = required(
    env,
    'EMAIL_FROM_ADDRESS',
    'a provider is configured but there is no address to send from. Providers reject or silently drop mail from an unverified sender, so this is required rather than guessed',
  )
  return { address: checkAddress('EMAIL_FROM_ADDRESS', address), name, replyTo }
}

/**
 * Mailgun's API host for a region.
 *
 * **This is the one that fails quietly.** Mailgun runs two separate stacks, US
 * and EU, which share no domains and no keys. A domain created in the EU and
 * addressed at `api.mailgun.net` does not report anything an operator reads as
 * "wrong region" — it answers 401, which everybody debugs as a bad key. So the
 * region is an explicit variable with exactly two legal values rather than a
 * default nobody thinks about.
 */
export const mailgunEndpoint = (region: MailgunRegion, domain: string): string =>
  `https://api.${region === 'eu' ? 'eu.' : ''}mailgun.net/v3/${encodeURIComponent(domain)}/messages`

const mailgunSettings = (env: EmailEnv) => {
  const apiKey = required(env, 'MAILGUN_API_KEY', 'required when EMAIL_PROVIDER=mailgun')

  /*
    No shape check on the key. Mailgun has issued at least three formats —
    `key-<32 hex>`, a bare 32-hex string, and the current
    `<uuid>-<8 hex>-<8 hex>` — and a pattern tight enough to be worth having
    would reject one it has not seen.

    Whitespace is the exception, because it is never part of a key and is the
    commonest way one arrives broken. Leading and trailing whitespace is
    trimmed rather than refused — that is `read`, and a key pasted out of a web
    page with a newline on the end is a fixable accident, not a configuration
    error. Whitespace *inside* the value is not fixable: it is a wrapped line,
    or two values pasted into one variable, and sending it would be a 401 that
    reads as a wrong key.
  */
  if (/\s/.test(apiKey)) {
    throw new EmailConfigError(
      'MAILGUN_API_KEY',
      'contains a space or a line break in the middle of the key — check it was not pasted wrapped, or two values into one variable',
    )
  }

  const domain = required(
    env,
    'MAILGUN_DOMAIN',
    'required when EMAIL_PROVIDER=mailgun. This is the sending domain listed in your Mailgun dashboard, e.g. mg.example.com — not the website address',
  )
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    throw new EmailConfigError('MAILGUN_DOMAIN', `"${domain}" is not a domain name`)
  }

  const regionRaw = (read(env, 'MAILGUN_REGION') ?? 'us').toLowerCase()
  if (!(MAILGUN_REGIONS as readonly string[]).includes(regionRaw)) {
    throw new EmailConfigError(
      'MAILGUN_REGION',
      `"${regionRaw}" is not a region. One of: ${MAILGUN_REGIONS.join(', ')}. Wrong here and Mailgun answers 401, which reads as a bad key`,
    )
  }

  return { apiKey, domain, region: regionRaw as MailgunRegion }
}

const smtpSettings = (env: EmailEnv) => {
  const host = required(
    env,
    'SMTP_HOST',
    'required when EMAIL_PROVIDER=smtp, e.g. smtp.sendgrid.net or smtp.postmarkapp.com',
  )

  const portRaw = read(env, 'SMTP_PORT') ?? '587'
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new EmailConfigError('SMTP_PORT', `"${portRaw}" is not a port number`)
  }

  const secureRaw = read(env, 'SMTP_SECURE')
  if (secureRaw !== undefined && !['true', 'false'].includes(secureRaw.toLowerCase())) {
    throw new EmailConfigError('SMTP_SECURE', `"${secureRaw}" is not true or false`)
  }

  /*
    Implicit TLS on 465, STARTTLS everywhere else.

    Getting this pair wrong is another quiet one: nodemailer with
    `secure: false` against port 465 hangs until it times out, because the
    server is waiting for a TLS handshake the client is waiting to be invited
    to. Deriving it from the port is what every provider's own documentation
    does; SMTP_SECURE exists for the relay that does not.
  */
  const secure = secureRaw === undefined ? port === 465 : secureRaw.toLowerCase() === 'true'

  const user = read(env, 'SMTP_USER')
  const password = read(env, 'SMTP_PASSWORD')

  /*
    Half a credential is never right. An anonymous relay — no user, no password
    — is legitimate and common on a self-hosted box; a username with no
    password is somebody who set one variable believing they set both, and the
    symptom of that is an authentication failure at send time rather than here.
  */
  if (Boolean(user) !== Boolean(password)) {
    throw new EmailConfigError(
      user ? 'SMTP_PASSWORD' : 'SMTP_USER',
      'only one of SMTP_USER / SMTP_PASSWORD is set. Set both, or neither for an unauthenticated relay',
    )
  }

  return { host, port, secure, user, password }
}

/**
 * Read the whole email configuration, or throw naming the variable at fault.
 *
 * Called once, at boot, from `email-adapter.ts`. Nothing here touches the
 * network: a key that is present and well-formed but wrong is the provider's
 * business to report, and `pnpm email:test` is how you ask it.
 */
export const resolveEmailSettings = (env: EmailEnv): EmailSettings => {
  const provider = asProvider(read(env, 'EMAIL_PROVIDER'))
  const sender = senderFrom(env, provider)

  const overrideRaw = read(env, 'EMAIL_OVERRIDE_RECIPIENT')
  const overrideRecipient = overrideRaw
    ? checkAddress('EMAIL_OVERRIDE_RECIPIENT', overrideRaw)
    : undefined

  const common = { sender, overrideRecipient }

  switch (provider) {
    case 'console':
      return { ...common, provider }
    case 'mailgun':
      return { ...common, provider, ...mailgunSettings(env) }
    case 'resend': {
      const apiKey = required(env, 'RESEND_API_KEY', 'required when EMAIL_PROVIDER=resend')
      /*
        Resend keys have had one shape since the product launched and it is
        printed beside the key in their dashboard, so this one is worth
        pinning: the usual mistake is pasting the webhook signing secret, which
        is a similar-looking string on the next screen along.
      */
      if (!apiKey.startsWith('re_')) {
        throw new EmailConfigError(
          'RESEND_API_KEY',
          'a Resend API key starts with "re_". Check this is not the webhook signing secret',
        )
      }
      return { ...common, provider, apiKey }
    }
    case 'smtp':
      return { ...common, provider, ...smtpSettings(env) }
  }
}

/**
 * `Name <address>`, or the bare address when there is no name.
 *
 * No name is a legitimate answer and gets a bare address rather than an
 * invented one. Payload's own auth operations build `"" <address>` when the
 * adapter's `defaultFromName` is empty, which some clients render as a blank
 * sender — `email-adapter.ts` replaces the header they build with this one for
 * that reason.
 */
export const fromHeader = (sender: EmailSender): string => {
  const name = sender.name?.trim()
  if (!name) return sender.address
  /*
    Quoted and escaped. The display name is owner-supplied — it comes from an
    admin field — and a comma or a quote in an unquoted display name is a
    malformed header, which mail servers resolve by guessing.
  */
  return `"${name.replace(/[\\"]/g, '\\$&')}" <${sender.address}>`
}

/**
 * The sender used for one message: the environment, overlaid with whatever an
 * editor has typed into Site settings → Legal & contact.
 *
 * Site settings wins where it is filled in, so the visible sender can change
 * without a redeploy — `docs/COPY.md`'s rule that anything a person would want
 * to reword is a field. The environment is the floor that guarantees a
 * bootable configuration; the field is the override.
 *
 * A filled-in field that is not usable throws rather than falling back.
 * Falling back would be the silent failure one layer along: the operator would
 * read their own address in the admin while mail went out from another.
 */
export const resolveSender = (
  base: EmailSender,
  stored: { fromName?: string | null; fromAddress?: string | null; replyTo?: string | null },
): EmailSender => {
  const name = stored.fromName?.trim() || base.name
  const address = stored.fromAddress?.trim()
  const replyTo = stored.replyTo?.trim()

  if (address) checkAddress('Site settings → Legal & contact → sender address', address)
  if (replyTo) checkAddress('Site settings → Legal & contact → reply-to address', replyTo)

  return {
    address: address || base.address,
    name,
    replyTo: replyTo || base.replyTo,
  }
}
