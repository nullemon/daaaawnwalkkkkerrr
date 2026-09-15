import Script from 'next/script'
import type { Tags } from '@/lib/tags'

/**
 * The analytics scripts a site has actually configured, and nothing else.
 *
 * Every branch here is guarded on a value being present, so an unconfigured
 * wiki — which is all of them until somebody fills the fields in — ships zero
 * third-party script tags. That is worth being deliberate about: a guide site
 * lives on page speed, and "analytics we forgot to turn off" is the usual
 * reason one does not have any.
 *
 * `afterInteractive` throughout. None of these needs to run before the page
 * paints, and loading them `beforeInteractive` would put a third-party request
 * on the critical path of a site whose whole advantage is being fast.
 */
export function Analytics({ tags }: { tags: Tags }) {
  const { ga4Id, gtmId, plausibleDomain, clarityId, headHtml } = tags.analytics

  return (
    <>
      {/*
        Tag Manager loads GA4 itself in most setups, so configuring both is the
        classic way to double-count every pageview. The admin says so on the
        field; this renders whatever was set rather than silently picking one,
        because silently dropping a tag somebody pasted in is worse.
      */}
      {gtmId ? (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}

      {ga4Id ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');`}
          </Script>
        </>
      ) : null}

      {/* Cookieless, so it needs no consent banner. */}
      {plausibleDomain ? (
        <Script
          defer
          data-domain={plausibleDomain}
          src="https://plausible.io/js/script.js"
          strategy="afterInteractive"
        />
      ) : null}

      {clarityId ? (
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityId}");`}
        </Script>
      ) : null}

      {/*
        The escape hatch. Unescaped by design and documented as such in the
        admin — it exists for the tool nobody anticipated, and anything pasted
        here runs on every page of the site.
      */}
      {headHtml ? <div dangerouslySetInnerHTML={{ __html: headHtml }} /> : null}
    </>
  )
}
