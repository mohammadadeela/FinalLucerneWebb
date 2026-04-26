import { useLanguage } from "@/i18n";
import { SiInstagram, SiFacebook } from "react-icons/si";
import { Link } from "wouter";

export function Footer() {
  const { t, language } = useLanguage();

  return (
    <footer className="bg-foreground text-background pt-12 sm:pt-20 pb-6 sm:pb-8">
      <div className="w-full px-4 sm:px-6 lg:px-8">

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12 mb-10 md:mb-16">

          <div className="col-span-1 md:col-span-2">
            <h2 className="font-display text-xl sm:text-2xl tracking-widest font-semibold uppercase mb-4 sm:mb-6 text-background" data-testid="text-footer-logo">
              Lucerne Boutique
            </h2>
            <p className="text-background/55 text-sm leading-relaxed mb-6 sm:mb-8 max-w-sm" data-testid="text-footer-description">
              {t.footer.description}
            </p>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-background/70">{t.footer.followUs}</span>
              <a href="https://www.instagram.com/lucerne.boutique/" target="_blank" rel="noopener noreferrer" className="text-background/55 hover:text-background transition-colors duration-200" aria-label="Instagram" data-testid="link-instagram">
                <SiInstagram className="w-5 h-5" />
              </a>
              <a href="https://www.facebook.com/Lucerne.Boutique" target="_blank" rel="noopener noreferrer" className="text-background/55 hover:text-background transition-colors duration-200" aria-label="Facebook" data-testid="link-facebook">
                <SiFacebook className="w-5 h-5" />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 col-span-1 md:col-span-2 md:grid-cols-2">
            <div>
              <h3 className="font-display font-semibold uppercase tracking-widest mb-4 md:mb-6 text-sm text-background">{t.footer.shop}</h3>
              <ul className="space-y-3 sm:space-y-4 text-sm text-background/55">
                <li><Link href="/shop" className="hover:text-background transition-colors duration-200">{t.footer.allProducts}</Link></li>
                <li><Link href="/sales" className="hover:text-background transition-colors duration-200">{t.footer.sale}</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-display font-semibold uppercase tracking-widest mb-4 md:mb-6 text-sm text-background">{t.footer.support}</h3>
              <ul className="space-y-3 sm:space-y-4 text-sm text-background/55">
                <li><Link href="/faq" className="hover:text-background transition-colors duration-200" data-testid="link-footer-faq">{t.footer.faq}</Link></li>
                <li><Link href="/shipping-returns" className="hover:text-background transition-colors duration-200" data-testid="link-footer-shipping">{t.footer.shippingReturns}</Link></li>
                <li><Link href="/contact" className="hover:text-background transition-colors duration-200" data-testid="link-footer-contact">{t.footer.contactUs}</Link></li>
                <li><Link href="/our-location" className="hover:text-background transition-colors duration-200" data-testid="link-footer-location">{t.footer.ourLocation}</Link></li>
              </ul>
            </div>
          </div>

        </div>

        <div className="border-t border-background/10 pt-6 sm:pt-8 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-background/40">
          <p>&copy; {new Date().getFullYear()} Lucerne Boutique. {t.footer.allRights}</p>
          <div className="flex gap-4 sm:gap-6">
            <a href="#" className="hover:text-background/70 transition-colors">{t.footer.privacyPolicy}</a>
            <a href="#" className="hover:text-background/70 transition-colors">{t.footer.termsOfService}</a>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-background/25">
          <p>
            {language === "ar"
              ? <>هل تريد موقعاً مثل هذا؟ تواصل معنا على{" "}<a href="mailto:mohammad.adeela@gmail.com" className="underline hover:text-background/50 transition-colors">mohammad.adeela@gmail.com</a></>
              : <>Want a website like this? Contact{" "}<a href="mailto:mohammad.adeela@gmail.com" className="underline hover:text-background/50 transition-colors">mohammad.adeela@gmail.com</a></>
            }
          </p>
        </div>

      </div>
    </footer>
  );
}
