import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { ShoppingBag, CreditCard, RotateCcw, AlertTriangle, Scale, Mail } from "lucide-react";

const sections = {
  ar: [
    {
      icon: ShoppingBag,
      title: "استخدام الموقع",
      body: [
        "باستخدامكِ لهذا الموقع، فإنكِ توافقين على الالتزام بهذه الشروط والأحكام. إذا كنتِ لا توافقين على أي منها، يرجى التوقف عن استخدام الموقع.",
        "يجب أن يكون عمرك ١٨ عاماً على الأقل لإجراء عمليات شراء على موقعنا.",
        "أنتِ مسؤولة عن الحفاظ على سرية معلومات حسابك وكلمة المرور الخاصة بكِ.",
      ],
    },
    {
      icon: CreditCard,
      title: "الطلبات والمدفوعات",
      body: [
        "جميع الأسعار المعروضة بالشيكل الإسرائيلي (₪) وتشمل الضرائب المطبقة ما لم يُذكر خلاف ذلك.",
        "نحتفظ بالحق في رفض أي طلب أو إلغائه في حالة وجود أخطاء في الأسعار أو نفاد المخزون.",
        "يُعدّ الطلب مؤكداً فور إتمام عملية الدفع وإرسال رسالة التأكيد إلى بريدك الإلكتروني.",
        "في حال الدفع عبر الهاتف أو تحويل بنكي، تُنهى عملية الشراء بعد التحقق من استلام المبلغ.",
      ],
    },
    {
      icon: RotateCcw,
      title: "الإرجاع والاستبدال",
      body: [
        "لا نقبل الإرجاع نهائياً.",
        "نقبل الاستبدال خلال ٣ أيام فقط من تاريخ الاستلام، شريطة أن تكون المنتجات بحالتها الأصلية غير مستخدمة مع كامل علاماتها التجارية.",
        "لا تُقبل المنتجات المستعملة أو التالفة أو التي أُزيلت علاماتها للاستبدال.",
      ],
    },
    {
      icon: AlertTriangle,
      title: "الملكية الفكرية",
      body: [
        "جميع المحتويات على هذا الموقع من صور ونصوص وشعارات وتصاميم هي ملك حصري لـ Lucerne Boutique ومحمية بموجب قوانين الملكية الفكرية.",
        "لا يُسمح بنسخ أي محتوى أو إعادة نشره أو استخدامه لأغراض تجارية دون إذن كتابي مسبق منا.",
      ],
    },
    {
      icon: Scale,
      title: "حدود المسؤولية",
      body: [
        "لا تتحمل Lucerne Boutique أي مسؤولية عن أي أضرار غير مباشرة أو عرضية ناتجة عن استخدام الموقع أو المنتجات.",
        "نحرص على دقة المعلومات المعروضة، غير أننا لا نضمن خلوها من الأخطاء أو انقطاع الخدمة في جميع الأوقات.",
        "ألوان المنتجات قد تختلف قليلاً عما يظهر على شاشتك بسبب إعدادات العرض المختلفة.",
      ],
    },
    {
      icon: Mail,
      title: "التواصل معنا",
      body: [
        "لأي استفسار يتعلق بهذه الشروط والأحكام، يرجى التواصل معنا عبر صفحة اتصل بنا أو مباشرةً عبر واتساب.",
      ],
    },
  ],
  en: [
    {
      icon: ShoppingBag,
      title: "Use of the Site",
      body: [
        "By using this website, you agree to be bound by these Terms of Service. If you do not agree to any of them, please stop using the site.",
        "You must be at least 18 years old to make purchases on our site.",
        "You are responsible for maintaining the confidentiality of your account credentials and password.",
      ],
    },
    {
      icon: CreditCard,
      title: "Orders & Payments",
      body: [
        "All prices are displayed in Israeli New Shekel (₪) and include applicable taxes unless stated otherwise.",
        "We reserve the right to refuse or cancel any order in the event of pricing errors or stock unavailability.",
        "An order is confirmed once payment is completed and a confirmation email is sent to you.",
        "For phone or bank-transfer payments, the purchase is finalised after receipt of payment is verified.",
      ],
    },
    {
      icon: RotateCcw,
      title: "Returns & Exchanges",
      body: [
        "We do not accept returns under any circumstances.",
        "Exchanges are accepted within 3 days of the delivery date only, provided items are in their original, unused condition with all tags attached.",
        "Used, damaged, or untagged items will not be accepted for exchange.",
      ],
    },
    {
      icon: AlertTriangle,
      title: "Intellectual Property",
      body: [
        "All content on this site — including images, text, logos, and designs — is the exclusive property of Lucerne Boutique and is protected by intellectual property laws.",
        "No content may be copied, republished, or used for commercial purposes without our prior written consent.",
      ],
    },
    {
      icon: Scale,
      title: "Limitation of Liability",
      body: [
        "Lucerne Boutique shall not be liable for any indirect or incidental damages arising from the use of the site or its products.",
        "We endeavour to keep all displayed information accurate, but cannot guarantee it is free from errors or that the service will be uninterrupted at all times.",
        "Product colours may vary slightly from what appears on your screen due to different display settings.",
      ],
    },
    {
      icon: Mail,
      title: "Contact Us",
      body: [
        "For any enquiries regarding these Terms of Service, please contact us via our Contact page or directly through WhatsApp.",
      ],
    },
  ],
};

export default function TermsOfService() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const content = isAr ? sections.ar : sections.en;

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1">
        <section className="bg-secondary py-16 sm:py-24">
          <div className="w-full px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-display text-3xl sm:text-5xl tracking-widest uppercase mb-4">
              {t.footer.termsOfService}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              {isAr
                ? "آخر تحديث: يناير ٢٠٢٥"
                : "Last updated: January 2025"}
            </p>
          </div>
        </section>

        <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16 max-w-3xl mx-auto space-y-12">
          {content.map(({ icon: Icon, title, body }, i) => (
            <div key={i} className={i > 0 ? "border-t border-border pt-12" : ""}>
              <div className="flex items-center gap-3 mb-5">
                <Icon className="w-5 h-5 shrink-0 text-muted-foreground" />
                <h2 className="font-display text-lg uppercase tracking-widest">
                  {title}
                </h2>
              </div>
              <ul className="space-y-3">
                {body.map((line, j) => (
                  <li key={j} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}
