import { getSiteSettings } from '@/lib/payload'

/**
 * Reserved space for advertising. The slot holds its height whether or not ads
 * are switched on, so turning them on later cannot reflow a page or damage
 * layout stability scores. Nothing third-party loads until an ad client is set
 * in the admin.
 */
export async function AdSlot({ label = 'Advertisement' }: { label?: string }) {
  const settings = await getSiteSettings()
  // Nothing at all until there is an ad client, in development as well as in
  // production. The dev placeholder that used to sit here was a grey box with
  // "ad slot — disabled" in it on every page, which looked like a broken
  // component rather than reserved space.
  if (!settings.adsEnabled || !settings.adClientId) return null
  return (
    <div className="ad-slot" role="complementary" aria-label={label}>
      {label}
    </div>
  )
}
