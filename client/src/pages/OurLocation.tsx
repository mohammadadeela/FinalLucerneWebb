import { useState } from "react";
import { MapPin, Clock, Phone, Navigation, Copy, Check } from "lucide-react";
import { SiWaze, SiGooglemaps } from "react-icons/si";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { AutoplayVideo } from "@/components/ui/AutoplayVideo";
import { SupportPage, SupportHeading, Rise } from "@/components/support/SupportShell";

const STORE_LAT_LNG = "31.9064286,35.2068265";
const MAPS_SHORT_URL = "https://maps.app.goo.gl/zW7CNWPR2Y79BAPX6";
const MAPS_EMBED_URL = `https://maps.google.com/maps?q=${STORE_LAT_LNG}&z=18&output=embed`;
const WAZE_URL = `https://waze.com/ul?ll=${STORE_LAT_LNG}&navigate=yes`;

export default function OurLocation() {
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const isAr = language === "ar";
  const [copied, setCopied] = useState(false);

  const locationVideo = getSetting(siteSettings, "location_video_url") || "/store-video.mp4";
  const locationVideoPosition = getSetting(siteSettings, "location_video_position") || "50% 50%";
  // Address, hours, phone and directions come from the dashboard (Site content → Support).
  const address = getSetting(siteSettings, isAr ? "location_address_ar" : "location_address_en") || t.location.address;
  const hours = getSetting(siteSettings, isAr ? "location_hours_ar" : "location_hours_en") || t.location.hours;
  const directions = getSetting(siteSettings, isAr ? "location_directions_ar" : "location_directions_en") || t.location.directions;
  const phone = getSetting(siteSettings, "location_phone");
  const phoneDigits = phone.replace(/\D/g, "");

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard not available — nothing to do */ }
  };

  const row = "flex items-start gap-3 rounded-2xl bg-white p-4 sm:p-5";
  const chip = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-berry";

  return (
    <SupportPage
      current="location"
      title={t.location.title}
      subtitle={t.location.subtitle}
      titleTestId="text-location-title"
    >
      {/* Map with a floating card */}
      <Rise>
        <div className="relative overflow-hidden rounded-[1.5rem] bg-blush">
          <iframe
            title="Lucerne Boutique on Google Maps"
            src={MAPS_EMBED_URL}
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="block h-[300px] w-full sm:h-[420px]"
            data-testid="iframe-google-maps"
          />
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex sm:inset-x-5 sm:bottom-5">
            <div className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl bg-white/95 p-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:w-auto sm:max-w-md sm:p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-berry text-white">
                <MapPin className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="display-latin text-sm font-semibold text-foreground">Lucerne Boutique</p>
                <p className="truncate text-xs text-muted-foreground" data-testid="text-location-address">{address}</p>
              </div>
              <a
                href={MAPS_SHORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-open-google-maps"
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition-colors hover:bg-berry"
              >
                <Navigation className="h-3.5 w-3.5" />
                {isAr ? "الاتجاهات" : "Directions"}
              </a>
            </div>
          </div>
        </div>
      </Rise>

      {/* Open the route in the customer's own maps app */}
      <Rise delay={0.05}>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <a href={MAPS_SHORT_URL} target="_blank" rel="noopener noreferrer" data-testid="link-get-directions-bottom"
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-foreground transition-colors hover:text-berry-deep">
            <SiGooglemaps className="h-4 w-4 text-berry" />
            {isAr ? "خرائط جوجل" : "Google Maps"}
          </a>
          <a href={WAZE_URL} target="_blank" rel="noopener noreferrer" data-testid="link-open-waze"
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-foreground transition-colors hover:text-berry-deep">
            <SiWaze className="h-4 w-4 text-berry" />
            {isAr ? "ويز" : "Waze"}
          </a>
        </div>
      </Rise>

      <div className="mt-10 grid grid-cols-1 gap-10 sm:mt-14 lg:grid-cols-2 lg:gap-8">
        {/* Store info */}
        <Rise>
          <SupportHeading icon={MapPin} testId="text-location-subtitle">{t.location.storeInfo}</SupportHeading>
          <div className="space-y-2.5">
            <div className={row}>
              <span className={chip}><MapPin className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-berry">{t.location.addressLabel}</p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground" data-testid="text-location-address-detail">{address}</p>
              </div>
              <button
                onClick={copyAddress}
                aria-label={isAr ? "نسخ العنوان" : "Copy address"}
                data-testid="button-copy-address"
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${copied ? "bg-berry text-white" : "bg-blush text-berry hover:bg-berry hover:text-white"}`}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? (isAr ? "تم النسخ" : "Copied") : (isAr ? "نسخ" : "Copy")}
              </button>
            </div>

            <div className={row}>
              <span className={chip}><Clock className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-berry">{t.location.hoursLabel}</p>
                <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground" data-testid="text-location-hours">{hours}</p>
              </div>
            </div>

            {phoneDigits && (
              <a href={`tel:+${phoneDigits}`} className={`${row} transition-shadow duration-300 hover:shadow-[0_10px_30px_-14px_rgba(120,40,70,0.3)]`} data-testid="link-location-phone">
                <span className={chip}><Phone className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-berry">{t.location.phoneLabel}</p>
                  <p className="price-text mt-0.5 text-sm font-semibold text-foreground" dir="ltr" style={{ textAlign: isAr ? "right" : "left" }} data-testid="text-location-phone">{phone}</p>
                </div>
              </a>
            )}

            {directions && (
              <div className="rounded-2xl bg-blush p-4 sm:p-5">
                <p className="text-sm font-semibold text-berry-deep">{t.location.directionsTitle}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground/70" data-testid="text-location-directions">{directions}</p>
              </div>
            )}
          </div>
        </Rise>

        {/* The way to the shop, on video */}
        <Rise delay={0.08}>
          <SupportHeading icon={Navigation}>{t.location.videoCaption}</SupportHeading>
          <div className="aspect-video overflow-hidden rounded-[1.5rem] bg-blush">
            <AutoplayVideo
              src={locationVideo}
              poster="/store-video-poster.jpg"
              controls
              preload="auto"
              className="h-full w-full object-cover"
              style={{ objectPosition: locationVideoPosition }}
              data-testid="video-location"
            />
          </div>
        </Rise>
      </div>
    </SupportPage>
  );
}
