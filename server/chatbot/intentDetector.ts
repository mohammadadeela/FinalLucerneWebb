export type Intent =
  | "greeting"
  | "product_navigation"
  | "sales_deals"
  | "order_tracking"
  | "delivery_policy"
  | "exchange_policy"
  | "return_policy"
  | "size_help"
  | "payment_methods"
  | "discount_code"
  | "loyalty_points"
  | "wishlist"
  | "account_help"
  | "location"
  | "faq"
  | "contact"
  | "privacy_terms"
  | "human_support"
  | "complaint"
  | "unknown";

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآاٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .trim();
}

function hasAny(text: string, words: string[]): boolean {
  const n = norm(text);
  return words.some((w) => n.includes(norm(w)));
}

/* ─── Intents are checked in ORDER — specific before broad ──────────────── */
const SIGNALS: [Intent, string[]][] = [

  /* 1 ── greetings */
  ["greeting", [
    "مرحبا","مرحبه","هلا","اهلا","السلام","اهلين","يسلمو","صباح","مساء","ازيك","كيف حالك",
    "hello","hi","hey","good morning","good evening","greetings","howdy","sup","yo",
  ]],

  /* 2 ── complaint */
  ["complaint", [
    "شكوى","مشكله","خطا","غلط","تاخر","ما وصل","خساره","سيء","مزعج","ما عجبني","غير راضي",
    "complaint","problem","issue","wrong","damaged","broken","late","never arrived","bad","terrible","unhappy",
  ]],

  /* 3 ── human agent */
  ["human_support", [
    "تحدث مع","اتكلم مع","اريد موظف","محتاجه مساعده بشريه","واتساب","موظف","مسؤول","خدمة العملاء",
    "speak to human","talk to agent","human agent","customer service","whatsapp support","real person",
  ]],

  /* 4 ── order tracking */
  ["order_tracking", [
    "وين طلبي","اين طلبي","طلبي وين","رقم الطلب","تتبع الطلب","متى يوصل","وصل طلبي","حالة الطلب","طلباتي",
    "where is my order","track my order","my order","order status","track order","shipment","my orders",
  ]],

  /* 5 ── exchange */
  ["exchange_policy", [
    "استبدال","تبديل","ابدال","ابدل","بدل","غير المقاس","مقاس ثاني","لون ثاني","ابغى ابدل","كيف ابدل",
    "exchange","swap","change size","change color","different size","replace item","how to exchange",
  ]],

  /* 6 ── return / refund */
  ["return_policy", [
    "ارجاع","إرجاع","رجع","استرجاع","ارد","اعيد","مش عاجبني","استرداد","رد الفلوس",
    "return","refund","send back","give back","not happy","reject","money back",
  ]],

  /* 7 ── delivery */
  ["delivery_policy", [
    "سياسة التوصيل","كم التوصيل","سعر الشحن","كم يوم التوصيل","وقت التوصيل","مناطق التوصيل","هل توصلون","توصيل مجاني",
    "delivery policy","shipping cost","how long delivery","delivery areas","do you ship","free shipping","shipping fee","shipping time",
  ]],

  /* 8 ── size guide */
  ["size_help", [
    "دليل المقاسات","جدول المقاسات","كيف اختار المقاس","المقاس الصح","ما هو مقاسي","مقاسات المتجر",
    "size guide","size chart","what size","how to choose size","measurements","sizing","fit guide",
  ]],

  /* 9 ── payment */
  ["payment_methods", [
    "طرق الدفع","طريقة الدفع","كيف ادفع","وسائل الدفع","هل فيكم فيزا","هل فيكم كاش","دفع اون لاين","طريقة السداد",
    "payment methods","how to pay","payment options","do you accept visa","cash on delivery","online payment","credit card","pay on delivery",
  ]],

  /* 10 ── discount code — before product_navigation (catches "بدي كود") */
  ["discount_code", [
    "كود خصم","كوبون خصم","بروموكود","رمز خصم","كود تخفيض","قسيمه خصم","عندكم كود","فيكم كود","بدي كود",
    "discount code","promo code","coupon code","voucher code","offer code","have a coupon","use a code","enter code",
  ]],

  /* 11 ── loyalty points — before product_navigation */
  ["loyalty_points", [
    "نقاطي","نقاط الولاء","نقاط ولاء","كيف احول نقاطي","احول نقاطي","استبدل نقاطي","كم نقاطي","رصيد نقاطي",
    "نقاط مكافاه","اكسب نقاط","نظام النقاط","برنامج الولاء","بدي نقاط","نقاط",
    "my points","loyalty points","redeem points","convert points","earn points","how many points","points balance","loyalty program","points",
  ]],

  /* 12 ── wishlist */
  ["wishlist", [
    "قائمة الامنيات","المفضله","الامنيات","المحفوظات","منتجات محفوظه","بدي احفظ","حفظ المنتج",
    "wishlist","wish list","saved items","favourites","favorites","bookmark","saved products","my wishlist",
  ]],

  /* 13 ── account / login / register */
  ["account_help", [
    "تسجيل دخول","تسجيل الدخول","حسابي","انشاء حساب","حساب جديد","نسيت كلمة المرور","تغيير كلمة المرور","بياناتي الشخصيه","ملفي الشخصي",
    "login","sign in","register","create account","sign up","forgot password","reset password","my account","account","profile settings",
  ]],

  /* 14 ── store location */
  ["location", [
    "موقعكم","وين محلكم","عنوان المتجر","كيف اوصل","فتح الفرع","ساعات العمل","اوقات الدوام","الفرع",
    "where are you","your location","store address","find store","directions","opening hours","visit you","store hours","physical store",
  ]],

  /* 15 ── FAQ */
  ["faq", [
    "اسئله شائعه","اسئلة","استفسارات شائعه","اكثر سؤال","سؤال متكرر",
    "faq","frequently asked","common questions","help center","questions and answers",
  ]],

  /* 16 ── contact */
  ["contact", [
    "تواصل معكم","تواصلي معكم","كيف اتواصل","معلومات التواصل","رقم الهاتف","ايميل المتجر","صفحة التواصل",
    "contact us","contact page","reach you","get in touch","email you","store email","store phone","contact info",
  ]],

  /* 17 ── privacy / terms */
  ["privacy_terms", [
    "سياسة الخصوصيه","الخصوصيه","شروط الاستخدام","الشروط والاحكام","اتفاقية المستخدم",
    "privacy policy","terms of service","terms and conditions","user agreement","data policy","legal",
  ]],

  /* 18 ── sales / deals — before product_navigation */
  ["sales_deals", [
    "تخفيضات","عروض","تنزيلات","اسعار مخفضه","اقل سعر","منتجات رخيصه","اوفر قيمه","اخر العروض","احسن سعر",
    "sales","deals","offers","discounts","on sale","clearance","cheap","best price","reduced","special offer",
  ]],

  /* 19 ── product navigation — intentionally LAST */
  ["product_navigation", [
    "بدي","أريد","اريد","عندكم","فيكم","ابي","ابغى","ودي","شوفي","بحث","بدور","بشوف",
    "show","need","want","looking","find","search","browse","view","have you","i want",
    "فستان","فساتين","حذاء","احذيه","كعب","صندل","بلوزه","بنطلون","تنوره","عبايه","جاكيت","تنورة",
    "dress","shoe","shoes","heel","heels","sandal","sandals","top","tops","pants","skirt","abaya","jacket","blouse",
  ]],
];

const PRODUCT_WORDS = [
  "فستان","فساتين","حذاء","احذيه","كعب","صندل","صنادل","بلوزه","بنطلون","تنوره",
  "عبايه","جاكيت","طقم","كارديجان","ملابس","لبس","موديل",
  "dress","shoe","shoes","heel","heels","sandal","sandals","blouse","pants","skirt",
  "abaya","jacket","suit","cardigan","clothes","outfit","item","style",
];

export function detectIntent(message: string, lastIntent?: Intent): Intent {
  const m = norm(message);

  for (const [intent, words] of SIGNALS) {
    if (hasAny(m, words)) return intent;
  }

  if (hasAny(m, PRODUCT_WORDS)) return "product_navigation";

  if (lastIntent === "product_navigation") return "product_navigation";

  return "unknown";
}
