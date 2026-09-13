/**
 * Whether a legal detail can be trusted in public.
 *
 * A privacy policy names who is legally responsible for people's data, so the
 * failure mode that matters is a plausible-looking stand-in going live
 * unnoticed. The real guard is the `legalProvisional` switch in site settings,
 * which an editor turns off deliberately. This is the backstop for the values
 * nobody remembered to flag: an empty field, or text that gives itself away.
 *
 * example.com, .org and .net are reserved by IANA for documentation and can
 * never be a working inbox, so an address there is provisional by definition.
 *
 * Kept free of JSX so it can be unit-tested without a renderer.
 */

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /@example\.(com|org|net)$/i,
  /^\s*(tbd|todo|xxx|n\/a)\s*$/i,
  /\byour (name|company|address|email)\b/i,
]

export const isProvisional = (value?: string | null): boolean => {
  if (!value || !value.trim()) return true
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value.trim()))
}
