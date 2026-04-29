import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { MapPin, Clock, Phone, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";

const MAPS_SHORT_URL = "https://maps.app.goo.gl/zW7CNWPR2Y79BAPX6";
const MAPS_EMBED_URL = "https://maps.google.com/maps?q=31.9064286,35.2068265&z=18&output=embed";

export default function OurLocation() {
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const locationVideo = getSetting(siteSettings, "location_video_url") || "/store-video.MOV";
  const locationVideoPosition = getSetting(siteSettings, "location_video_position") || "50% 50%";
  const isAr = language === "ar";

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1">

        {/* ── Hero: Map full-width with overlay card ── */}
        <section className="relative w-full h-[300px] sm:h-[360px]">
          <iframe
            title="Lucerne Boutique on Google Maps"
            src={MAPS_EMBED_URL}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 w-full h-full"
            data-testid="iframe-google-maps"
          />
          {/* Dark gradient at bottom so card reads clearly */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />

          {/* Info card overlaid at bottom */}
          <div className={`absolute bottom-3 ${isAr ? "right-3" : "left-3"} sm:bottom-8 sm:${isAr ? "right-10" : "left-10"} max-w-[200px] sm:max-w-xs`}>
            <div className="bg-background/95 backdrop-blur-sm border border-border p-3 sm:p-5 shadow-xl">
              <h1 className="font-display text-sm sm:text-2xl tracking-widest uppercase mb-0.5 sm:mb-1" data-testid="text-location-title">
                Lucerne Boutique
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 sm:mb-4 leading-snug" data-testid="text-location-address">
                {t.location.address}
              </p>
              <a
                href={MAPS_SHORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-open-google-maps"
              >
                <Button className="rounded-md uppercase tracking-widest text-[10px] sm:text-xs gap-1.5 w-full h-7 sm:h-9">
                  <Navigation className="w-3 h-3" />
                  {isAr ? "احصل على الاتجاهات" : "Get Directions"}
                </Button>
              </a>
            </div>
          </div>
        </section>

        {/* ── Info + Video ── */}
        <section className="w-full px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14">

            {/* Video */}
            <div>
              <div className="aspect-video bg-muted border border-border overflow-hidden">
                <video
                  src={locationVideo}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ objectPosition: locationVideoPosition }}
                  data-testid="video-location"
                />
              </div>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                {t.location.videoCaption}
              </p>
            </div>

            {/* Store info */}
            <div className="space-y-10">
              <div>
                <h2 className="font-display text-2xl uppercase tracking-widest mb-8" data-testid="text-location-subtitle">
                  {t.location.storeInfo}
                </h2>
                <div className="divide-y divide-border">
                  <div className="flex items-start gap-4 pb-6">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t.location.addressLabel}</p>
                      <p className="text-sm" data-testid="text-location-address-detail">{t.location.address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 py-6">
                    <Clock className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t.location.hoursLabel}</p>
                      <p className="text-sm" data-testid="text-location-hours">{t.location.hours}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 pt-6">
                    <Phone className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{t.location.phoneLabel}</p>
                      <p className="text-sm" data-testid="text-location-phone">{t.location.phone}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-display text-lg uppercase tracking-widest mb-3">{t.location.directionsTitle}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-location-directions">
                  {t.location.directions}
                </p>
                <a
                  href={MAPS_SHORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-5"
                  data-testid="link-get-directions-bottom"
                >
                  <Button variant="outline" className="rounded-md uppercase tracking-widest text-xs gap-2">
                    <Navigation className="w-3.5 h-3.5" />
                    {isAr ? "افتح في خرائط جوجل" : "Open in Google Maps"}
                  </Button>
                </a>
              </div>
            </div>

          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
