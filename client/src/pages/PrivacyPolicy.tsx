import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { Shield, Eye, Lock, UserCheck, Mail } from "lucide-react";

const sections = {
  ar: [
    {
      icon: Eye,
      title: "المعلومات التي نجمعها",
      body: [
        "نجمع المعلومات التي تقدمها لنا مباشرةً عند إنشاء حساب، أو إجراء عملية شراء، أو التواصل معنا، مثل: الاسم الكامل، عنوان البريد الإلكتروني، رقم الهاتف، وعنوان التوصيل.",
        "نجمع أيضاً بيانات الاستخدام تلقائياً عند تصفح موقعنا، مثل: عنوان IP، نوع المتصفح، الصفحات التي زرتها، والوقت الذي قضيتِه عليها.",
      ],
    },
    {
      icon: UserCheck,
      title: "كيف نستخدم معلوماتك",
      body: [
        "معالجة طلباتك وإتمام عمليات الشراء وإرسال تأكيدات الطلبات.",
        "إرسال تحديثات حول طلبك ومعلومات الشحن والتوصيل.",
        "تحسين تجربة التسوق وتخصيص المحتوى المعروض لكِ.",
        "الرد على استفساراتك وطلبات الدعم.",
        "إرسال عروض وتخفيضات خاصة إن وافقتِ على ذلك.",
      ],
    },
    {
      icon: Lock,
      title: "حماية معلوماتك",
      body: [
        "نتخذ إجراءات أمنية مناسبة لحماية معلوماتك من الوصول غير المصرح به أو الإفصاح أو التغيير أو الإتلاف.",
        "لا نبيع أو نؤجر أو نتبادل معلوماتك الشخصية مع أطراف ثالثة لأغراض تسويقية.",
        "نشارك معلوماتك فقط مع مزودي الخدمات الضروريين لتشغيل متجرنا، كشركات الشحن ومعالجة المدفوعات، وذلك بموجب اتفاقيات سرية.",
      ],
    },
    {
      icon: Shield,
      title: "ملفات تعريف الارتباط",
      body: [
        "نستخدم ملفات تعريف الارتباط (Cookies) لتحسين تجربتك، مثل: تذكر محتوى سلة التسوق وتفضيلات اللغة وحالة تسجيل الدخول.",
        "يمكنكِ ضبط متصفحك لرفض ملفات تعريف الارتباط، غير أن ذلك قد يؤثر على بعض وظائف الموقع.",
      ],
    },
    {
      icon: Mail,
      title: "التواصل معنا",
      body: [
        "إن كان لديكِ أي سؤال حول سياسة الخصوصية هذه أو طريقة تعاملنا مع بياناتك، يسعدنا التواصل معكِ عبر صفحة اتصل بنا أو مباشرةً عبر واتساب.",
      ],
    },
  ],
  en: [
    {
      icon: Eye,
      title: "Information We Collect",
      body: [
        "We collect information you provide directly when creating an account, placing an order, or contacting us — including your full name, email address, phone number, and delivery address.",
        "We also automatically collect usage data when you browse our site, such as your IP address, browser type, pages visited, and time spent on each page.",
      ],
    },
    {
      icon: UserCheck,
      title: "How We Use Your Information",
      body: [
        "Processing your orders, completing purchases, and sending order confirmations.",
        "Providing shipment tracking updates and delivery information.",
        "Improving your shopping experience and personalising the content you see.",
        "Responding to your enquiries and support requests.",
        "Sending special offers and discounts if you have opted in.",
      ],
    },
    {
      icon: Lock,
      title: "How We Protect Your Information",
      body: [
        "We take appropriate security measures to protect your information from unauthorised access, disclosure, alteration, or destruction.",
        "We do not sell, rent, or trade your personal information to third parties for marketing purposes.",
        "We share your information only with service providers necessary to operate our store — such as shipping and payment processors — under confidentiality agreements.",
      ],
    },
    {
      icon: Shield,
      title: "Cookies",
      body: [
        "We use cookies to improve your experience, including remembering your cart contents, language preference, and login status.",
        "You may configure your browser to refuse cookies, though this may affect some site functionality.",
      ],
    },
    {
      icon: Mail,
      title: "Contact Us",
      body: [
        "If you have any questions about this Privacy Policy or how we handle your data, please reach out via our Contact page or directly through WhatsApp.",
      ],
    },
  ],
};

export default function PrivacyPolicy() {
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
              {t.footer.privacyPolicy}
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
