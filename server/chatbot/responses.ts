import type { Intent } from "./intentDetector";
import type { ChatEntities } from "./entityExtractor";
import { buildProductUrl } from "./urlBuilder";

export interface ChatButton { label: string; url: string; }
export interface ChatResponse { reply: string; buttons?: ChatButton[]; }

const COLOR_AR: Record<string, string> = {
  black: "الأسود", white: "الأبيض", red: "الأحمر", beige: "البيج", pink: "الزهري",
  blue: "الأزرق", green: "الأخضر", brown: "البني", gold: "الذهبي", silver: "الفضي",
  purple: "البنفسجي", orange: "البرتقالي", yellow: "الأصفر", camel: "الكاميل",
};

function productReply(
  entities: ChatEntities,
  lang: "ar" | "en",
  knownCategorySlugs?: Set<string>,
): ChatResponse {
  const url = buildProductUrl(entities, knownCategorySlugs);
  const hasFilters = !!(
    entities.category || entities.subcategory || entities.color ||
    entities.size || entities.style || entities.occasion ||
    entities.priceMax || entities.priceMin
  );

  let reply: string;
  if (lang === "ar") {
    const colorTxt = entities.color ? ` باللون ${COLOR_AR[entities.color] ?? entities.color}` : "";
    reply = hasFilters
      ? `أكيد! 😍 جهّزت لكِ المنتجات المناسبة${colorTxt}. اضغطي الزر بالأسفل لعرضها:`
      : "تفضلي، يمكنكِ تصفح مجموعتنا الكاملة من هنا:";
  } else {
    const colorTxt = entities.color ? ` in ${entities.color}` : "";
    reply = hasFilters
      ? `Got it! 😍 I've lined up the matching products${colorTxt}. Tap the button below to view them:`
      : "Browse our full collection here:";
  }

  return {
    reply,
    buttons: [{ label: lang === "ar" ? "عرض المنتجات 🛍️" : "View Products 🛍️", url }],
  };
}

/* ─── Order status (secure lookup) ──────────────────────────────────────────
 * Copy for the order-tracking lookup. The OWNERSHIP / AUTH decision is made in
 * the route (server/routes.ts) — this function only formats the reply for an
 * already-decided state. "not_found" is intentionally identical whether the
 * order does not exist OR belongs to another customer, to prevent enumeration.
 */
// Keep these in sync with the order-tracking timeline labels
// (client/src/i18n/ar.ts & en.ts → orderStatus).
const ORDER_STATUS_AR: Record<string, string> = {
  Pending: "بالانتظار ⏳",
  OnTheWay: "بالطريق إليكِ 🚚",
  Delivered: "تم التسليم ✅",
  Cancelled: "تم إلغاء الطلب ❌",
};
const ORDER_STATUS_EN: Record<string, string> = {
  Pending: "Pending ⏳",
  OnTheWay: "On the Way 🚚",
  Delivered: "Delivered ✅",
  Cancelled: "Cancelled ❌",
};

export function orderStatusReply(opts: {
  lang: "ar" | "en";
  whatsapp: string;
  state: "not_authed" | "not_found" | "found";
  order?: { id: number; status: string };
}): ChatResponse {
  const { lang, whatsapp, state, order } = opts;
  const ar = lang === "ar";

  if (state === "not_authed") {
    return {
      reply: ar
        ? "لمتابعة حالة طلبك أحتاج التأكد من هويتك أولاً 🔒\n\nسجّلي الدخول لحسابك ثم أرسلي لي رقم الطلب وسأعرض لكِ حالته فوراً."
        : "To check your order status I first need to verify it's you 🔒\n\nPlease log in to your account, then send me your order number and I'll show you its status right away.",
      buttons: [
        { label: ar ? "تسجيل الدخول 👤" : "Log In 👤", url: "/auth" },
        { label: ar ? "طلباتي 📦" : "My Orders 📦", url: "/profile" },
      ],
    };
  }

  if (state === "not_found" || !order) {
    return {
      reply: ar
        ? "ما لقيت طلب بهذا الرقم في حسابك 🤔\n\nتأكدي من رقم الطلب، أو راجعي قائمة «طلباتي». لو تحتاجين مساعدة تواصلي معنا."
        : "I couldn't find an order with that number in your account 🤔\n\nPlease double-check the number, or view your full list under 'My Orders'. Need help? Reach out to us.",
      buttons: [
        { label: ar ? "طلباتي 📦" : "My Orders 📦", url: "/profile" },
        { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
      ],
    };
  }

  const statusLabel = (ar ? ORDER_STATUS_AR : ORDER_STATUS_EN)[order.status] ?? order.status;
  return {
    reply: ar
      ? `طلبك رقم #${order.id} 📦\n\nالحالة الحالية: ${statusLabel}\n\nيمكنكِ متابعة كل التفاصيل من صفحة «طلباتي».`
      : `Your order #${order.id} 📦\n\nCurrent status: ${statusLabel}\n\nYou can see full details under 'My Orders'.`,
    buttons: [
      { label: ar ? "طلباتي 📦" : "My Orders 📦", url: "/profile" },
      { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
    ],
  };
}

export function buildResponse(
  intent: Intent,
  lang: "ar" | "en",
  entities: ChatEntities,
  whatsapp: string,
  knownCategorySlugs?: Set<string>,
): ChatResponse {
  const ar = lang === "ar";

  switch (intent) {

    /* ─── greeting ─────────────────────────────────────────────────────── */
    case "greeting":
      return {
        reply: ar
          ? "أهلاً وسهلاً! 👋 أنا لوسي، مساعدتك الشخصية في لوسيرن بوتيك.\n\nكيف أقدر أساعدك اليوم؟ اختاري من الاقتراحات أدناه أو اكتبي سؤالك 💬"
          : "Welcome! 👋 I'm Lucie, your personal Lucerne Boutique assistant.\n\nHow can I help you today? Choose from the suggestions or type your question 💬",
      };

    /* ─── product navigation ────────────────────────────────────────────── */
    case "product_navigation":
      return productReply(entities, lang, knownCategorySlugs);

    /* ─── sales & deals ─────────────────────────────────────────────────── */
    case "sales_deals":
      return {
        reply: ar
          ? "إليكِ أحدث عروضنا وتخفيضاتنا 🏷️\n\nاستمتعي بأفضل الأسعار على مجموعة مختارة من المنتجات!"
          : "Check out our latest sales and special offers 🏷️\n\nEnjoy the best prices on a curated selection of items!",
        buttons: [
          { label: ar ? "عروض وتخفيضات 🏷️" : "Sales & Offers 🏷️", url: "/sales" },
          { label: ar ? "تسوقي الآن 🛍️" : "Shop All 🛍️", url: "/shop" },
        ],
      };

    /* ─── order tracking ────────────────────────────────────────────────── */
    case "order_tracking":
      return {
        reply: ar
          ? "بكل سرور 🚚 يمكنكِ تتبع طلباتك من صفحة حسابك الشخصي.\n\nأو أرسلي لي رقم الطلب وسأساعدك فوراً!"
          : "Of course 🚚 You can track your orders from your account page.\n\nOr send me your order number and I'll help right away!",
        buttons: [
          { label: ar ? "طلباتي 📦" : "My Orders 📦", url: "/profile" },
          { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
        ],
      };

    /* ─── delivery ──────────────────────────────────────────────────────── */
    case "delivery_policy":
      return {
        reply: ar
          ? "التوصيل متاح لجميع المناطق 🚚\n\nيمكنكِ الاطلاع على تفاصيل الشحن والأوقات التقريبية من هنا:"
          : "We deliver to all areas 🚚\n\nView full shipping details and estimated delivery times here:",
        buttons: [
          { label: ar ? "سياسة الشحن والتوصيل 🚚" : "Shipping & Delivery 🚚", url: "/shipping-returns" },
          { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
        ],
      };

    /* ─── exchange ──────────────────────────────────────────────────────── */
    case "exchange_policy":
      return {
        reply: ar
          ? "يمكنكِ طلب الاستبدال خلال 3 أيام من الاستلام 🔁\n\n1️⃣ سجّلي الدخول لحسابك\n2️⃣ افتحي «طلباتي»\n3️⃣ اختاري المنتج وابدئي طلب الاستبدال"
          : "You can request an exchange within 3 days of receiving your order 🔁\n\n1️⃣ Log in to your account\n2️⃣ Go to 'My Orders'\n3️⃣ Select the item and start an exchange request",
        buttons: [
          { label: ar ? "طلباتي 👤" : "My Orders 👤", url: "/profile" },
          { label: ar ? "سياسة الاستبدال" : "Exchange Policy", url: "/shipping-returns" },
        ],
      };

    /* ─── return / refund ───────────────────────────────────────────────── */
    case "return_policy":
      return {
        reply: ar
          ? "لمعرفة سياسة الإرجاع الكاملة وشروطها يمكنكِ الاطلاع على صفحة الشحن والإرجاع:"
          : "For our full return and refund policy, please see our shipping & returns page:",
        buttons: [
          { label: ar ? "سياسة الإرجاع 🔄" : "Return Policy 🔄", url: "/shipping-returns" },
          { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
        ],
      };

    /* ─── size guide ────────────────────────────────────────────────────── */
    case "size_help":
      return {
        reply: ar
          ? "دليل المقاسات يساعدكِ تختاري المقاس الصحيح 📏\n\nكل منتج عنده جدول مقاسات خاص موجود في صفحة المنتج مباشرة.\n\nيمكنكِ أيضاً التواصل معنا لمساعدتك في اختيار مقاسك."
          : "Our size guide helps you find the perfect fit 📏\n\nEach product has its own size chart available on the product page.\n\nYou can also contact us and we'll help you choose!",
        buttons: [
          { label: ar ? "تصفحي المنتجات 🛍️" : "Browse Products 🛍️", url: "/shop" },
          { label: ar ? "تواصلي معنا 💬" : "Chat with Us 💬", url: `https://wa.me/${whatsapp}` },
        ],
      };

    /* ─── payment ───────────────────────────────────────────────────────── */
    case "payment_methods":
      return {
        reply: ar
          ? "نقبل عدة طرق للدفع 💳\n\n• الدفع الإلكتروني (بطاقات ائتمانية / مدين)\n• الدفع عند الاستلام (في مناطق محددة)\n\nيمكنكِ إدخال طريقة الدفع عند إتمام الطلب:"
          : "We accept multiple payment methods 💳\n\n• Online payment (credit / debit cards)\n• Cash on delivery (selected areas)\n\nChoose your payment method at checkout:",
        buttons: [
          { label: ar ? "إتمام الطلب 💳" : "Go to Checkout 💳", url: "/cart" },
          { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
        ],
      };

    /* ─── discount code ─────────────────────────────────────────────────── */
    case "discount_code":
      return {
        reply: ar
          ? "لاستخدام كود الخصم 🎁\n\n1️⃣ أضيفي المنتجات للسلة\n2️⃣ انتقلي لصفحة الدفع\n3️⃣ أدخلي الكود في خانة «كود الخصم» واضغطي تطبيق\n4️⃣ سيُطرح الخصم من المجموع تلقائياً ✨\n\n💡 تأكدي من صحة الكود وصلاحيته."
          : "To use a discount code 🎁\n\n1️⃣ Add items to your cart\n2️⃣ Go to checkout\n3️⃣ Enter your code in the 'Discount Code' field and tap Apply\n4️⃣ The discount is instantly deducted ✨\n\n💡 Make sure the code is valid and not expired.",
        buttons: [
          { label: ar ? "تسوقي الآن 🛍️" : "Shop Now 🛍️", url: "/shop" },
          { label: ar ? "إتمام الطلب 💳" : "Go to Checkout 💳", url: "/cart" },
        ],
      };

    /* ─── loyalty points ────────────────────────────────────────────────── */
    case "loyalty_points":
      return {
        reply: ar
          ? "نقاط الولاء 💎\n\nتكسبين نقاطاً مع كل طلب، وتستطيعين تحويلها إلى رصيد تستخدمينه في مشترياتك القادمة!\n\nلعرض رصيدك أو تحويل نقاطك:\n👤 اذهبي لصفحة حسابك ← قسم «نقاطي ورصيدي»"
          : "Loyalty Points 💎\n\nYou earn points with every order and can convert them into store credit for future purchases!\n\nTo view your balance or redeem:\n👤 Go to your account → 'My Points & Credit' section",
        buttons: [
          { label: ar ? "نقاطي ورصيدي 💎" : "My Points & Credit 💎", url: "/profile" },
          { label: ar ? "تسوقي واكسبي نقاطاً 🛍️" : "Shop & Earn Points 🛍️", url: "/shop" },
        ],
      };

    /* ─── wishlist ──────────────────────────────────────────────────────── */
    case "wishlist":
      return {
        reply: ar
          ? "قائمة الأمنيات تتيح لكِ حفظ المنتجات التي يعجبكِ لمراجعتها لاحقاً 🤍\n\nيمكنكِ الضغط على أيقونة القلب ❤️ على أي منتج لحفظه، ثم العودة إليه متى أردتِ!"
          : "Your wishlist lets you save products you love for later 🤍\n\nJust tap the heart icon ❤️ on any product to save it, then come back to it anytime!",
        buttons: [
          { label: ar ? "قائمة أمنياتي 🤍" : "My Wishlist 🤍", url: "/wishlist" },
          { label: ar ? "تصفحي المنتجات 🛍️" : "Browse Products 🛍️", url: "/shop" },
        ],
      };

    /* ─── account / login / register ───────────────────────────────────── */
    case "account_help":
      return {
        reply: ar
          ? "إدارة حسابك في لوسيرن بوتيك 👤\n\nمن صفحة حسابك يمكنكِ:\n• عرض طلباتك وتتبعها\n• إدارة نقاط الولاء\n• تعديل بياناتك الشخصية\n• طلب الاستبدال"
          : "Manage your Lucerne Boutique account 👤\n\nFrom your account page you can:\n• View and track your orders\n• Manage loyalty points\n• Edit personal details\n• Request exchanges",
        buttons: [
          { label: ar ? "تسجيل الدخول / إنشاء حساب 👤" : "Login / Register 👤", url: "/auth" },
          { label: ar ? "حسابي 👤" : "My Account 👤", url: "/profile" },
        ],
      };

    /* ─── store location ────────────────────────────────────────────────── */
    case "location":
      return {
        reply: ar
          ? "يسعدنا زيارتك! 📍\n\nيمكنكِ الاطلاع على عنوان المتجر وساعات العمل وخريطة الموقع من هنا:"
          : "We'd love to see you! 📍\n\nFind our store address, opening hours, and location map here:",
        buttons: [
          { label: ar ? "موقعنا 📍" : "Our Location 📍", url: "/our-location" },
          { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
        ],
      };

    /* ─── FAQ ───────────────────────────────────────────────────────────── */
    case "faq":
      return {
        reply: ar
          ? "لدينا صفحة أسئلة شائعة تحتوي على إجابات لأكثر الاستفسارات تكراراً 📋\n\nيمكنكِ الاطلاع عليها هنا، وإذا لم تجدي ما تبحثين عنه فتواصلي معنا مباشرة!"
          : "We have a FAQ page with answers to the most common questions 📋\n\nCheck it out here, and if you can't find what you're looking for, contact us directly!",
        buttons: [
          { label: ar ? "الأسئلة الشائعة ❓" : "FAQ ❓", url: "/faq" },
          { label: ar ? "تواصلي معنا 💬" : "Contact Us 💬", url: `https://wa.me/${whatsapp}` },
        ],
      };

    /* ─── contact ───────────────────────────────────────────────────────── */
    case "contact":
      return {
        reply: ar
          ? "يمكنكِ التواصل معنا بأكثر من طريقة 📞\n\n• واتساب: للرد الفوري\n• صفحة التواصل: لإرسال رسالة مكتوبة\n• انستغرام: راسلينا على lucerne.boutique"
          : "You can reach us in multiple ways 📞\n\n• WhatsApp: for instant replies\n• Contact page: to send a written message\n• Instagram: message us @lucerne.boutique",
        buttons: [
          { label: ar ? "تواصلي واتساب 💬" : "WhatsApp Us 💬", url: `https://wa.me/${whatsapp}` },
          { label: ar ? "صفحة التواصل 📩" : "Contact Page 📩", url: "/contact" },
        ],
      };

    /* ─── privacy & terms ───────────────────────────────────────────────── */
    case "privacy_terms":
      return {
        reply: ar
          ? "يمكنكِ الاطلاع على سياساتنا القانونية من الروابط أدناه 📄"
          : "You can review our legal policies from the links below 📄",
        buttons: [
          { label: ar ? "سياسة الخصوصية 🔒" : "Privacy Policy 🔒", url: "/privacy-policy" },
          { label: ar ? "الشروط والأحكام 📋" : "Terms of Service 📋", url: "/terms-of-service" },
        ],
      };

    /* ─── human support ─────────────────────────────────────────────────── */
    case "human_support":
      return {
        reply: ar
          ? "أكيد! يمكنكِ التواصل معنا مباشرة على واتساب وسنرد عليكِ في أقرب وقت 🤍"
          : "Of course! Reach us directly on WhatsApp and we'll get back to you shortly 🤍",
        buttons: [
          { label: ar ? "تواصلي على واتساب 💬" : "Chat on WhatsApp 💬", url: `https://wa.me/${whatsapp}` },
          { label: ar ? "صفحة التواصل 📩" : "Contact Page 📩", url: "/contact" },
        ],
      };

    /* ─── complaint ─────────────────────────────────────────────────────── */
    case "complaint":
      return {
        reply: ar
          ? "نأسف جداً لسماع ذلك 😔 نريد أن نحل مشكلتك في أسرع وقت.\n\nتواصلي معنا مباشرة وسنتابع الأمر فوراً:"
          : "We're really sorry to hear that 😔 We want to resolve this for you as quickly as possible.\n\nPlease contact us directly and we'll follow up immediately:",
        buttons: [
          { label: ar ? "تواصلي على واتساب 💬" : "WhatsApp Us 💬", url: `https://wa.me/${whatsapp}` },
          { label: ar ? "صفحة التواصل 📩" : "Contact Page 📩", url: "/contact" },
        ],
      };

    /* ─── unknown ───────────────────────────────────────────────────────── */
    default:
      return {
        reply: ar
          ? "آسف، ما فهمت قصدك تماماً 😅\nاختاري من الاقتراحات أدناه أو اكتبي سؤالك بشكل آخر:"
          : "Sorry, I didn't quite understand 😅\nChoose from the suggestions below or try rephrasing:",
        buttons: ar
          ? [
              { label: "فساتين 👗",         url: "/dresses" },
              { label: "أحذية 👠",           url: "/shoes" },
              { label: "عروض 🏷️",           url: "/sales" },
              { label: "وين طلبي؟ 🚚",       url: "/profile" },
              { label: "نقاطي 💎",           url: "/profile" },
              { label: "كود خصم 🎁",         url: "/cart" },
              { label: "الاستبدال 🔁",        url: "/shipping-returns" },
              { label: "موقعنا 📍",          url: "/our-location" },
              { label: "أسئلة شائعة ❓",     url: "/faq" },
              { label: "تواصلي معنا 💬",      url: `https://wa.me/${whatsapp}` },
            ]
          : [
              { label: "Dresses 👗",        url: "/dresses" },
              { label: "Shoes 👠",          url: "/shoes" },
              { label: "Sales 🏷️",         url: "/sales" },
              { label: "Track Order 🚚",    url: "/profile" },
              { label: "My Points 💎",      url: "/profile" },
              { label: "Discount Code 🎁",  url: "/cart" },
              { label: "Exchange 🔁",       url: "/shipping-returns" },
              { label: "Our Location 📍",   url: "/our-location" },
              { label: "FAQ ❓",            url: "/faq" },
              { label: "Contact Us 💬",     url: `https://wa.me/${whatsapp}` },
            ],
      };
  }
}
