export interface ColorMember {
  nameEn: string;
  nameAr: string;
  hex: string;
}

export interface ColorFamily {
  key: string;
  nameAr: string;
  nameEn: string;
  hex: string;
  members: ColorMember[];
}

export const COLOR_FAMILIES: ColorFamily[] = [
  {
    key: "white",
    nameAr: "أبيض",
    nameEn: "White",
    hex: "#FFFFFF",
    members: [
      { nameEn: "White", nameAr: "أبيض", hex: "#FFFFFF" },
      { nameEn: "Ivory", nameAr: "عاجي", hex: "#FFFFF0" },
      { nameEn: "Cream", nameAr: "كريمي", hex: "#FFFDD0" },
      { nameEn: "Alabaster", nameAr: "ألاباستر", hex: "#EDEADE" },
      { nameEn: "Snow", nameAr: "ثلجي", hex: "#FFFAFA" },
    ],
  },
  {
    key: "neutral",
    nameAr: "محايد",
    nameEn: "Neutral / Off-White",
    hex: "#F5F5DC",
    members: [
      { nameEn: "Beige", nameAr: "بيج", hex: "#F5F5DC" },
      { nameEn: "Off White", nameAr: "أوف وايت", hex: "#FAF9F6" },
      { nameEn: "Linen", nameAr: "كتاني", hex: "#E9DCC9" },
      { nameEn: "Bone White", nameAr: "عظمي", hex: "#F9F6EE" },
      { nameEn: "Parchment", nameAr: "رقي", hex: "#FCF5E5" },
    ],
  },
  {
    key: "brown",
    nameAr: "بني",
    nameEn: "Brown",
    hex: "#7B3F00",
    members: [
      { nameEn: "Brown", nameAr: "بني", hex: "#7B3F00" },
      { nameEn: "Chocolate", nameAr: "شوكولاتي", hex: "#7B3F00" },
      { nameEn: "Coffee", nameAr: "قهوي", hex: "#6F4E37" },
      { nameEn: "Tan", nameAr: "رملي", hex: "#D2B48C" },
      { nameEn: "Khaki", nameAr: "كاكي", hex: "#F0E68C" },
      { nameEn: "Camel", nameAr: "جملي", hex: "#C19A6B" },
      { nameEn: "Mahogany", nameAr: "ماهوجني", hex: "#C04000" },
    ],
  },
  {
    key: "yellow",
    nameAr: "أصفر",
    nameEn: "Yellow",
    hex: "#FFFF00",
    members: [
      { nameEn: "Yellow", nameAr: "أصفر", hex: "#FFFF00" },
      { nameEn: "Gold", nameAr: "ذهبي", hex: "#FFD700" },
      { nameEn: "Mustard Yellow", nameAr: "أصفر خردلي", hex: "#FFDB58" },
      { nameEn: "Lemon Yellow", nameAr: "أصفر ليموني", hex: "#FAFA33" },
    ],
  },
  {
    key: "orange",
    nameAr: "برتقالي",
    nameEn: "Orange",
    hex: "#FFA500",
    members: [
      { nameEn: "Orange", nameAr: "برتقالي", hex: "#FFA500" },
      { nameEn: "Dark Orange", nameAr: "برتقالي داكن", hex: "#8B4000" },
      { nameEn: "Coral", nameAr: "مرجاني", hex: "#FF7F50" },
      { nameEn: "Peach", nameAr: "خوخي", hex: "#FFE5B4" },
    ],
  },
  {
    key: "red",
    nameAr: "أحمر",
    nameEn: "Red",
    hex: "#D22B2B",
    members: [
      { nameEn: "Red", nameAr: "أحمر", hex: "#D22B2B" },
      { nameEn: "Dark Red", nameAr: "أحمر داكن", hex: "#8B0000" },
      { nameEn: "Crimson", nameAr: "قرمزي", hex: "#DC143C" },
      { nameEn: "Scarlet", nameAr: "قرمزي فاتح", hex: "#FF2400" },
      { nameEn: "Burgundy", nameAr: "خمري", hex: "#800020" },
      { nameEn: "Maroon", nameAr: "عنابي", hex: "#800000" },
    ],
  },
  {
    key: "pink",
    nameAr: "وردي",
    nameEn: "Pink",
    hex: "#FFC0CB",
    members: [
      { nameEn: "Pink", nameAr: "وردي", hex: "#FFC0CB" },
      { nameEn: "Hot Pink", nameAr: "وردي صاخب", hex: "#FF69B4" },
      { nameEn: "Light Pink", nameAr: "وردي فاتح", hex: "#FFB6C1" },
      { nameEn: "Fuchsia", nameAr: "فوشيا", hex: "#FF00FF" },
    ],
  },
  {
    key: "purple",
    nameAr: "بنفسجي",
    nameEn: "Purple",
    hex: "#800080",
    members: [
      { nameEn: "Purple", nameAr: "بنفسجي", hex: "#800080" },
      { nameEn: "Violet", nameAr: "بنفسجي فاتح", hex: "#7F00FF" },
      { nameEn: "Lavender", nameAr: "لافندر", hex: "#E6E6FA" },
      { nameEn: "Orchid", nameAr: "أوركيد", hex: "#DA70D6" },
    ],
  },
  {
    key: "blue",
    nameAr: "أزرق",
    nameEn: "Blue",
    hex: "#4169E1",
    members: [
      { nameEn: "Blue", nameAr: "أزرق", hex: "#4169E1" },
      { nameEn: "Navy Blue", nameAr: "كحلي", hex: "#000080" },
      { nameEn: "Midnight Blue", nameAr: "أزرق منتصف الليل", hex: "#191970" },
      { nameEn: "Sky Blue", nameAr: "سماوي", hex: "#87CEEB" },
      { nameEn: "Baby Blue", nameAr: "أزرق فاتح", hex: "#89CFF0" },
      { nameEn: "Light Blue", nameAr: "أزرق فاتح", hex: "#ADD8E6" },
      { nameEn: "Royal Blue", nameAr: "أزرق ملكي", hex: "#4169E1" },
    ],
  },
  {
    key: "green",
    nameAr: "أخضر",
    nameEn: "Green",
    hex: "#008000",
    members: [
      { nameEn: "Green", nameAr: "أخضر", hex: "#008000" },
      { nameEn: "Dark Green", nameAr: "أخضر داكن", hex: "#023020" },
      { nameEn: "Olive Green", nameAr: "زيتي", hex: "#808000" },
      { nameEn: "Lime Green", nameAr: "أخضر ليموني", hex: "#32CD32" },
      { nameEn: "Mint Green", nameAr: "أخضر نعناعي", hex: "#98FB98" },
      { nameEn: "Emerald Green", nameAr: "أخضر زمردي", hex: "#50C878" },
    ],
  },
  {
    key: "gray",
    nameAr: "رمادي",
    nameEn: "Gray",
    hex: "#808080",
    members: [
      { nameEn: "Gray", nameAr: "رمادي", hex: "#808080" },
      { nameEn: "Dark Gray", nameAr: "رمادي داكن", hex: "#A9A9A9" },
      { nameEn: "Light Gray", nameAr: "رمادي فاتح", hex: "#D3D3D3" },
      { nameEn: "Slate Gray", nameAr: "رمادي أردوازي", hex: "#708090" },
      { nameEn: "Silver", nameAr: "فضي", hex: "#C0C0C0" },
    ],
  },
  {
    key: "black",
    nameAr: "أسود",
    nameEn: "Black",
    hex: "#000000",
    members: [
      { nameEn: "Black", nameAr: "أسود", hex: "#000000" },
      { nameEn: "Jet Black", nameAr: "أسود فاحم", hex: "#343434" },
      { nameEn: "Matte Black", nameAr: "أسود مطفي", hex: "#28282B" },
      { nameEn: "Charcoal", nameAr: "فحمي", hex: "#36454F" },
      { nameEn: "Onyx", nameAr: "أونيكس", hex: "#353935" },
    ],
  },
];

export function normalizeArabic(s: string): string {
  return s
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .trim();
}

function normalizeKey(s: string): string {
  return normalizeArabic(s.toLowerCase().trim());
}

const ALL_NAMES = new Map<string, { family: ColorFamily; member: ColorMember }>();
COLOR_FAMILIES.forEach((f) => {
  f.members.forEach((m) => {
    ALL_NAMES.set(normalizeKey(m.nameEn), { family: f, member: m });
    ALL_NAMES.set(normalizeKey(m.nameAr), { family: f, member: m });
  });
});

export function getColorFamily(colorName: string): ColorFamily | null {
  const key = normalizeKey(colorName);
  const exact = ALL_NAMES.get(key);
  if (exact) return exact.family;
  for (const family of COLOR_FAMILIES) {
    if (key.includes(normalizeKey(family.nameAr)) || key.includes(family.nameEn.toLowerCase())) {
      return family;
    }
    for (const member of family.members) {
      if (key.includes(member.nameEn.toLowerCase()) || key.includes(normalizeKey(member.nameAr))) return family;
    }
  }
  return null;
}

export function translateColorName(colorName: string, targetLang: "ar" | "en"): string {
  const key = normalizeKey(colorName);
  const exact = ALL_NAMES.get(key);
  if (exact) return targetLang === "ar" ? exact.member.nameAr : exact.member.nameEn;
  return colorName;
}

export function getMemberHex(colorName: string): string | null {
  const key = normalizeKey(colorName);
  const exact = ALL_NAMES.get(key);
  if (exact) return exact.member.hex;
  return null;
}

export interface GroupedColor {
  familyKey: string;
  nameAr: string;
  nameEn: string;
  hex: string;
  originalNames: string[];
}

export function groupColorsByFamily(
  colors: { name: string; colorCode: string }[]
): GroupedColor[] {
  const grouped = new Map<string, GroupedColor>();
  const ungrouped: GroupedColor[] = [];

  for (const c of colors) {
    const family = getColorFamily(c.name);
    if (family) {
      if (!grouped.has(family.key)) {
        grouped.set(family.key, {
          familyKey: family.key,
          nameAr: family.nameAr,
          nameEn: family.nameEn,
          hex: family.hex,
          originalNames: [c.name],
        });
      } else {
        const g = grouped.get(family.key)!;
        if (!g.originalNames.includes(c.name)) {
          g.originalNames.push(c.name);
        }
      }
    } else {
      ungrouped.push({
        familyKey: `custom_${c.name}`,
        nameAr: c.name,
        nameEn: c.name,
        hex: c.colorCode,
        originalNames: [c.name],
      });
    }
  }

  return [...Array.from(grouped.values()), ...ungrouped];
}

export function productMatchesColorFamily(
  productColors: string[],
  selectedFamilyKeys: string[],
  allGroups: GroupedColor[],
  colorTags?: string[]
): boolean {
  for (const key of selectedFamilyKeys) {
    if (colorTags && colorTags.includes(key)) return true;
    const group = allGroups.find((g) => g.familyKey === key);
    if (!group) continue;
    for (const pc of productColors) {
      if (group.originalNames.some((n) => normalizeKey(n) === normalizeKey(pc))) {
        return true;
      }
    }
  }
  return false;
}
