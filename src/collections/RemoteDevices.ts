import type { CollectionConfig } from 'payload'
import { isEditor } from '../fields/shared'

/**
 * The machines allowed to ask for a remote session.
 *
 * ## What a row here actually is
 *
 * An Ed25519 public key, a name the owner gave it, and a tick-box. A device
 * "is" its key: the CLI generates the pair on first run, keeps the private
 * half in `.remote/device.key` and never sends it anywhere, and every request
 * it makes carries a signature this key verifies.
 *
 * Be honest about what that proves — `src/lib/remote/signing.ts` says it at
 * length and it is worth repeating where the owner will read it: **this proves
 * a key the owner approved signed the request, not that a particular laptop
 * did.** A copied key file is a valid device. The reason it is still the right
 * identifier is the alternative: a machine fingerprint is a string the client
 * chooses, so it is forgeable by anybody who can send a header, and it changes
 * when the machine updates, so it locks the owner out on a Tuesday for no
 * reason anybody can see.
 *
 * ## Why a row appears without anybody adding it
 *
 * The first `pnpm remote connect` from an unknown key creates a row here,
 * disabled, and refuses the session. That is deliberate: the alternative is
 * the owner copying a base64 key out of a terminal and into a form, which is
 * an error-prone step whose only purpose would be to create the row this
 * creates for them. Nothing is granted by the row existing — `enabled` is off,
 * and off is what every check reads.
 *
 * It is also the one unauthenticated write in the feature, so the route that
 * makes it is rate-limited hard and the row carries the IP it came from.
 *
 * ## Access
 *
 * Payload's default write access is any authenticated user, and this network
 * has a second auth collection: `players`, which is readers. A reader who
 * signed up must not be able to read this table, let alone enable a device in
 * it, so both are stated rather than inherited.
 *
 * `remote-devices` is also in `DENIED_COLLECTIONS` in
 * `src/lib/remote/policy.ts`: a remote session can never write here, whoever
 * approved it, because a session that can approve a device can approve its own
 * successor and the revocation story is over.
 *
 * Not game-scoped and never to be added to `GAME_SCOPED`. A laptop does not
 * belong to a wiki.
 */
export const RemoteDevices: CollectionConfig = {
  slug: 'remote-devices',
  labels: { singular: 'Remote device', plural: 'Remote devices' },
  admin: {
    group: 'Remote control',
    useAsTitle: 'label',
    defaultColumns: ['label', 'enabled', 'fingerprint', 'lastSeenAt'],
    description:
      'Machines allowed to ask for a remote session. A device registers itself the first time it connects and is refused until you enable it here. Unticking Enabled closes every session it holds, on its next request.',
  },
  access: {
    /*
      Created by the route, not by the API. The row's whole content is derived
      from a signature the route verified; a caller that could POST one could
      register a key nobody signed with.
    */
    create: () => false,
    read: isEditor,
    update: isEditor,
    delete: isEditor,
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: {
        description:
          'What this machine is, in your words. The CLI suggests the hostname; rename it to something you will recognise in six months.',
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
        description:
          'Off until you turn it on, including for a device that just registered itself. Turning it off revokes every open session this device holds.',
      },
    },
    {
      name: 'publicKey',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'The device’s Ed25519 public key, base64 SPKI. Written by the pairing route from a signature it verified — editing it by hand would mean trusting a key nobody signed with.',
      },
    },
    {
      name: 'fingerprint',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        description:
          'The same key, in a form you can read out. The CLI prints this too; the two being identical is how you know the row you are enabling is the machine you are sitting at.',
      },
    },
    {
      name: 'firstSeenIp',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'The address this device registered from. Kept because an unexpected one is the signal.',
      },
    },
    { name: 'lastSeenIp', type: 'text', admin: { readOnly: true } },
    {
      name: 'lastSeenAt',
      type: 'date',
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: { description: 'Yours. Why this device exists, or why you turned it off.' },
    },
  ],
  versions: false,
}
