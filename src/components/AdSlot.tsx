import { getSiteSettings } from '@/lib/payload'

/**
 * Reserved space for advertising. The slot holds its height whether or not ads
 * are switched on, so turning them on later cannot reflow a page or damage
 * layout stability scores. Nothing third-party loads until an ad client is set
 * in the admin.
 */
export async function AdSlot({ label = 'Advertisement' }: { label?: string }) {
  const settings = await getSiteSettings()
  if (!settings.adsEnabled || !settings.adClientId) {
    return process.env.NODE_ENV === 'development' ? (
      <div className="ad-slot" aria-hidden="true">
        ad slot — disabled
      </div>
    ) : null
  }
  return (
    <div className="ad-slot" role="complementary" aria-label={label}>
      {label}
    </div>
  )
}
