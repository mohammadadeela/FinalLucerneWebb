import { useQuery } from "@tanstack/react-query";

export function useSiteSettings() {
  return useQuery<Record<string, string>>({
    queryKey: ["/api/site-settings"],
    staleTime: 1000 * 60 * 5,
  });
}

export const defaultSettings: Record<string, string> = {
  home_hero_image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1920&q=80&fit=crop",
  home_hero_tag_ar: "مجموعة جديدة",
  home_hero_tag_en: "New Collection",
  home_hero_title_ar: "إعادة تعريف الأناقة",
  home_hero_title_en: "Redefining Elegance",
  home_hero_subtitle_ar: "اكتشفي مجموعتنا المنتقاة من القطع الخالدة المصممة للمرأة العصرية.",
  home_hero_subtitle_en: "Discover our curated collection of timeless pieces designed for the modern woman.",
  home_hero_video_position: "50% 50%",

  dresses_hero_image: "https://images.unsplash.com/photo-1595777457583-95e059d5bf08?w=1920&q=80&fit=crop",
  dresses_hero_subtitle_ar: "تشكيلة فساتين أنيقة لكل مناسبة",
  dresses_hero_subtitle_en: "Elegant dresses for every occasion",
  dresses_hero_video_position: "50% 50%",

  clothes_hero_image: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=1920&q=80&fit=crop",
  clothes_hero_subtitle_ar: "ملابس عصرية راقية لإطلالتك اليومية",
  clothes_hero_subtitle_en: "Modern attire for your everyday look",
  clothes_hero_video_position: "50% 50%",

  shoes_hero_image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=1920&q=80&fit=crop",
  shoes_hero_subtitle_ar: "أحذية أنيقة لكل خطوة",
  shoes_hero_subtitle_en: "Elegant shoes for every step",
  shoes_hero_video_position: "50% 50%",

  sales_hero_image: "https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=1920&q=80&fit=crop",
  sales_hero_subtitle_ar: "أفضل العروض والتخفيضات المختارة لك",
  sales_hero_subtitle_en: "Best deals and discounts selected for you",
  sales_hero_video_position: "50% 50%",

  category_circle_dresses: "https://images.unsplash.com/photo-1595777457583-95e059d5bf08?w=400&q=80&fit=crop",
  category_circle_clothes: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=400&q=80&fit=crop",
  category_circle_shoes: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&q=80&fit=crop",

  card_payment_enabled: "true",
  loyalty_points_enabled: "true",

  exchange_note: "الفساتين والالبسة الرسمية لا تبدل",

  news_bar_enabled: "false",
  news_bar_text_ar: "",
  news_bar_text_en: "",

  // FAQ page
  faq_items: JSON.stringify([
    { question_ar: "كيف يمكنني تتبع طلبي؟", question_en: "How can I track my order?", answer_ar: "بعد تأكيد طلبك ستصلك رسالة عبر واتساب تتضمن تفاصيل الشحن ورقم التتبع.", answer_en: "Once your order is confirmed, you'll receive a WhatsApp message with shipping details and a tracking number." },
    { question_ar: "ما هي طرق الدفع المتاحة؟", question_en: "What payment methods do you accept?", answer_ar: "نقبل الدفع عبر بطاقات الائتمان والخصم (Visa, Mastercard) بالإضافة إلى الدفع عند الاستلام داخل رام الله.", answer_en: "We accept credit and debit cards (Visa, Mastercard) as well as cash on delivery within Ramallah." },
    { question_ar: "هل يمكنني إرجاع المنتج إذا لم يناسبني؟", question_en: "Can I return a product if it doesn't fit?", answer_ar: "نعم، نقبل الإرجاع خلال 7 أيام من تاريخ الاستلام بشرط أن يكون المنتج بحالته الأصلية.", answer_en: "Yes, we accept returns within 7 days of delivery, provided the item is unused and in its original condition." },
    { question_ar: "كم يستغرق التوصيل؟", question_en: "How long does delivery take?", answer_ar: "يتم التوصيل داخل رام الله خلال 1-2 يوم عمل. المناطق الأخرى في فلسطين تستغرق من 2-4 أيام عمل.", answer_en: "Delivery within Ramallah takes 1-2 business days. Other areas in Palestine take 2-4 business days." },
    { question_ar: "هل تتوفر المقاسات الكبيرة؟", question_en: "Do you carry plus sizes?", answer_ar: "نعم، نحرص على توفير مقاسات متنوعة تناسب جميع الأجسام.", answer_en: "Yes, we carry a wide range of sizes to suit all body types." },
    { question_ar: "كيف أتواصل معكم؟", question_en: "How can I contact you?", answer_ar: "يمكنك التواصل معنا عبر واتساب أو زيارة متجرنا في رام الله.", answer_en: "You can reach us via WhatsApp or visit our store in Ramallah." },
  ]),

  // Shipping & Returns page
  shipping_details_ar: "نوفر خدمة التوصيل لجميع مناطق الضفة الغربية وداخل القدس.\nالتوصيل داخل رام الله والبيرة: 1-2 يوم عمل.\nالتوصيل لباقي مناطق فلسطين: 2-4 أيام عمل.\nتكلفة الشحن تُحسب عند الدفع بناءً على موقعك.\nالطلبات التي تتجاوز 300 شيكل تحصل على شحن مجاني داخل رام الله.",
  shipping_details_en: "We deliver to all areas of the West Bank and Jerusalem.\nDelivery within Ramallah and Al-Bireh: 1-2 business days.\nDelivery to other areas in Palestine: 2-4 business days.\nShipping costs are calculated at checkout based on your location.\nOrders over 300 NIS receive free shipping within Ramallah.",
  returns_details_ar: "نقبل إرجاع المنتجات خلال 7 أيام من تاريخ الاستلام.\nيجب أن يكون المنتج بحالته الأصلية، غير مستخدم، وبعبوته الأصلية.\nالمنتجات المخفضة والعروض الخاصة غير قابلة للإرجاع إلا في حالة وجود عيب مصنعي.\nلبدء عملية الإرجاع، تواصلي معنا عبر واتساب أو حضوري مباشرة إلى المتجر.\nيتم استرداد المبلغ خلال 3-5 أيام عمل بعد استلام المنتج المُرجع.",
  returns_details_en: "We accept returns within 7 days of the delivery date.\nThe item must be in its original condition, unused, and in its original packaging.\nSale items and special offers are non-returnable unless there is a manufacturing defect.\nTo start a return, contact us via WhatsApp or visit our store in person.\nRefunds are processed within 3-5 business days after receiving the returned item.",
  shipping_note_ar: "لأي استفسار حول شحنتك أو طلب إرجاع، لا تترددي في التواصل معنا عبر واتساب أو زيارة متجرنا مباشرة.",
  shipping_note_en: "For any questions about your shipment or to request a return, don't hesitate to contact us via WhatsApp or visit our store directly.",

  // Contact page
  contact_phone: "970597314193",
  contact_address_ar: "رام الله، طلعة ضراغمة، بجانب قشوع للإنارة",
  contact_address_en: "Ramallah, Daraghmeh Hill, next to Qashou Lighting",
  contact_hours_ar: "السبت - الخميس: 10:00 صباحاً - 8:00 مساءً",
  contact_hours_en: "Saturday - Thursday: 10:00 AM - 8:00 PM",

  // Our Location page
  location_address_ar: "رام الله، طلعة ضراغمة، بجانب قشوع للإنارة",
  location_address_en: "Ramallah, Tal'at Dharaghma, next to Qashou Lighting",
  location_hours_ar: "السبت - الخميس: 10:00 صباحاً - 8:00 مساءً",
  location_hours_en: "Saturday - Thursday: 10:00 AM - 8:00 PM",
  location_phone: "+970 59 731 4193",
  location_directions_ar: "يمكنك الوصول إلينا بسهولة. تفضلي بزيارتنا في أي وقت خلال ساعات العمل.",
  location_directions_en: "You can easily reach us. Feel free to visit us anytime during working hours.",
  location_video_url: "",
  location_video_position: "50% 50%",

  shipping_zones: JSON.stringify([
    { id: "westBank", nameAr: "الضفة الغربية", nameEn: "West Bank", price: 20 },
    { id: "jerusalem", nameAr: "القدس", nameEn: "Jerusalem", price: 30 },
    { id: "interior", nameAr: "الداخل", nameEn: "Interior", price: 75 },
  ]),
};

export interface ShippingZone {
  id: string;
  nameAr: string;
  nameEn: string;
  price: number;
}

export function getShippingZones(settings: Record<string, string> | undefined): ShippingZone[] {
  const raw = settings?.shipping_zones ?? defaultSettings.shipping_zones;
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(defaultSettings.shipping_zones);
  }
}

export function getSetting(settings: Record<string, string> | undefined, key: string): string {
  return settings?.[key] ?? defaultSettings[key] ?? "";
}
