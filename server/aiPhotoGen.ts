// ── AI Product Photo Generation (Gemini "Nano Banana" image model) ─────────
// Takes an existing product photo (the exact item that will be sold) and
// generates premium campaign-style photos of it — new background, lighting,
// angle, styling, optionally worn by a model — while the physical product
// itself must remain pixel-for-pixel the same item: same shape, same color,
// same heel height, same hemline, same everything. This module owns the
// prompts and the call to the Gemini image-generation endpoint; callers just
// pass a source image URL + shot type and get back image bytes for the
// configured media provider (Cloudflare R2 in production).

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export type PhotoShotType = "model" | "product";

// ── Randomized scene libraries ──────────────────────────────────────────────
// Every generation gets ONE of each relevant bucket picked at random, so that
// products never end up sharing an identical background/style, while every
// combination still reads as "premium fashion campaign".

// Used for the clean, model-free product shot (flat lay / floating product).
const PRODUCT_BACKGROUNDS = [
  "a real light-grey polished concrete floor with subtle natural mottling and texture, photographed indoors in soft daylight",
  "a warm off-white honed stone floor with faint natural speckle and tonal variation",
  "a pale travertine-tile floor with visible natural pores and slight color variation between tiles",
  "a smooth cream micro-cement floor with soft organic tonal patches, lit by window daylight",
  "a light beige limestone floor with gentle natural texture and a soft window-light gradient across the frame",
];

// Footwear product shots — copied from the store's real shoe photography:
// top-down flat lays of the pair directly on a textured stone/concrete floor,
// sometimes with one real-life prop (a chair leg) just entering the frame.
const FOOTWEAR_SURFACES = [
  "the pair resting directly on the floor, photographed from a low lateral side angle showing the full outer side profiles of both shoes, with the chrome leg of a modern chair partially entering the corner of the frame as a subtle real-life prop",
  "the pair resting directly on the floor, photographed from the side with one shoe slightly behind the other, both full side silhouettes unobstructed and toes pointing slightly apart",
  "the pair resting directly on the floor, shot from a low side-on angle showing both entire side profiles, with generous empty floor around them and nothing else in frame",
  "the pair resting directly on the floor near the soft out-of-focus edge of a sheer white curtain touching the floor, photographed from the side with the complete toe-to-heel silhouettes clearly visible",
  "the pair on a low honed-stone step, photographed from a low lateral side angle showing the full outer sides and heels, never straight from the front",
];

// Apparel product shots (no model) — the garment must still look real and
// dimensional, never like a floating cut-out.
const APPAREL_SURFACES = [
  "the garment hanging on a natural wooden hanger from a simple brass wall hook against the wall, draping naturally with realistic gravity and fabric folds",
  "the garment hanging on a thin matte-black clothing rail on wheels, shot straight-on, fabric falling naturally",
  "the garment laid flat on the floor, shot top-down as a styled flat lay, sleeves and skirt arranged naturally with soft realistic wrinkles — not perfectly smoothed",
  "the garment hanging on a wooden hanger in front of a sheer white curtain diffusing window daylight from behind",
];

const PRODUCT_COMPOSITIONS = [
  "product placed slightly off-center following the rule of thirds, generous negative space",
  "centered lower third of the frame with empty textured floor above, editorial catalog style",
  "top-down flat-lay composition, the pair arranged naturally and casually, not perfectly parallel",
  "tight editorial crop focusing on the product's silhouette with soft negative space around it",
];

// Used for the model-worn shot — REAL, styled boutique-interior sets copied
// from the store's actual reference photography. Plain seamless backdrops are
// deliberately avoided: an empty gradient wall is the #1 giveaway of an
// AI-generated image. Real fashion content is shot inside imperfect, lived-in
// interiors with real props, real floors, and real light falloff.
const MODEL_BACKGROUNDS = [
  "a bright boutique interior with white sheer curtain drapery gathered along the walls, a vintage brass chandelier with crystal drops hanging above, and a plain light grey concrete floor",
  "a white-walled showroom with an arched wall niche in the background containing a small gallery wall of antique gold-framed paintings, a brass candelabra, and a small white plaster bust on a side table draped with lace",
  "a warm cottage-style interior with a stone accent wall, a brass chandelier, an arched doorway with a linen curtain, a tall green cactus in a pot, and a dark upholstered accent chair with a cushion, on a faded vintage area rug over a concrete floor",
  "a bright minimal studio room with large potted banana-leaf plants, woven rattan basket planters, and a few matte white display plinths of different heights, on a smooth light concrete floor with a round woven jute rug",
  "a soft romantic set with a floral arch of real roses and greenery behind the model, loose flower petals scattered on the light floor, and white sheer fabric draped at the edges of the frame",
  "an airy white room with floor-to-ceiling sheer white curtains softly diffusing daylight, a low white pedestal with a stack of art books and a small candle, and a light polished concrete floor",
];

const LIGHTING = [
  "soft directional daylight from a large window, gentle natural shadow",
  "diffused overhead studio softbox lighting with a faint soft shadow",
  "warm golden-hour side lighting with a long soft shadow",
  "even, shadowless softbox lighting typical of e-commerce campaigns",
  "soft north-light window lighting with subtle contrast",
];

// Clean product shot angles — kept front/near-front so the product's front
// design (neckline, buttons, toe shape, etc.) is always the visible face.
const ANGLES = [
  "a straight-on eye-level product angle",
  "a slightly elevated three-quarter front angle",
  "a low, slightly upward front hero angle",
  "a direct front-facing angle with slight perspective",
];

// Poses for the footwear "legs only" shot — always mid-calf-down, always
// faceless, mirroring the Straswans-style reference: elegant legs in motion,
// one heel slightly lifted, close editorial crop.
const LEG_POSES = [
  "standing with one foot stepping slightly forward, heel of the back foot lifted off the ground",
  "standing naturally with weight on one leg, ankles gently crossed",
  "mid-step walking pose, one foot forward, the other on tiptoe behind",
  "standing still with feet slightly apart, weight evenly balanced",
  "one leg slightly bent, toes of the back foot pointed down for an elegant line",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Builds a randomized-but-structured scene brief for the clean product shot. */
export function buildProductScene(isFootwear = false) {
  return {
    background: pick(PRODUCT_BACKGROUNDS),
    surface: pick(isFootwear ? FOOTWEAR_SURFACES : APPAREL_SURFACES),
    lighting: pick(LIGHTING),
    angle: pick(ANGLES),
    composition: pick(PRODUCT_COMPOSITIONS),
  };
}

/** Builds a randomized-but-structured scene brief for the model-worn shot. */
export function buildModelScene() {
  return {
    background: pick(MODEL_BACKGROUNDS),
    lighting: pick(LIGHTING),
    angle: pick(ANGLES),
    pose: pick(LEG_POSES),
  };
}

const FIDELITY_RULES = `Treat the uploaded photo as GROUND TRUTH. This is not a "create an image inspired by this" task — it is a re-photograph/re-shoot task. The garment or item in the photo has ALREADY been manufactured exactly as shown, and a real customer will compare the photo you generate side-by-side with the physical item before buying. If the generated photo does not match the real product, the business loses the sale and the customer's trust. Accuracy is not optional and is more important than making the image look impressive.

═══════════════════════════════════════
🚫 NEVER CHANGE — copy these EXACTLY from the source photo, do not reinterpret or "improve" any of them:
═══════════════════════════════════════
General (every product):
- Overall shape, silhouette, and proportions — copy the exact cut, not a similar-looking one
- Every color, exact hue and saturation — do not shift red toward pink/orange, do not shift burgundy toward brighter red, do not brighten, darken, or "correct" the color at all
- Fabric/material type, texture, sheen, weight, and finish (matte/gloss/satin/chiffon/knit, etc.)
- All stitching, seams, panel lines, hardware, buttons, zippers, buckles, laces, clasps
- All logos, branding, labels, prints, or patterns, in their exact original position
- Size and scale relationships between parts of the product

If the product is FOOTWEAR (shoes, heels, boots, sandals, flats):
- Exact heel height and heel shape/thickness
- Sole thickness, sole pattern, and sole color
- Toe shape (pointed, round, square, open)
- Strap placement, buckle position, upper cut/design

If the product is APPAREL (dresses, tops, skirts, pants, outerwear):
- Neckline/collar TYPE exactly as shown — e.g. a standing mock-neck/turtleneck collar must stay a standing mock-neck collar; a halter must stay a halter; a V-neck must stay a V-neck. Do NOT substitute a different collar shape.
- Exact garment length / hemline height (mini, midi, maxi, floor-length — do not shorten or lengthen)
- Sleeve length and cut (sleeveless, short, long, puff, fitted) — copy exactly
- Fit and silhouette (fitted, A-line, flowy, structured, asymmetric hem)
- The EXACT pleat pattern, fold count, and drape style of any pleated/gathered fabric — do not invent a different pleat style, spacing, or fullness
- Any ruffles, slits, embroidery, or embellishments, in their exact original position and quantity
- Where seams/panels join different sections of the garment (e.g. where a bodice meets a skirt) — keep the same join line and angle

🚫 DO NOT ADD ANYTHING THAT ISN'T IN THE SOURCE PHOTO:
- No invented shoes, sandals, or footwear unless footwear is already visible in the source photo
- No invented jewelry, belts, bags, hats, scarves, or any other accessory
- No invented fabric layers, linings, or trims that are not visible in the source

Do NOT: redesign, "improve", restyle, add or remove any physical detail, change the fit, alter proportions, invent new decorations, change the garment's length, neckline, or pleat style, or reinterpret the product in any way — even slightly. A customer receiving the real product must see ZERO difference between this photo and the item they ordered. Before finalizing, mentally compare your output against the source image feature-by-feature (neckline shape, hemline length, color, pleats, hardware) and correct anything that drifted.`;

const TECH_QUALITY = `Technical quality: this must be indistinguishable from a REAL photograph taken on a full-frame camera (e.g. Canon EOS R5, 50mm or 85mm lens, f/2.8–f/4). Natural photographic depth of field with the background slightly and smoothly out of focus. Subtle, realistic fine photographic grain — NOT a perfectly clean digital-render look. True-to-life color, slightly muted like a real fashion editorial — never oversaturated, never HDR, never glowing. Sharp focus on the product, no text, no watermark, no added logos, no extra clutter.`;

// Rules that specifically fight the "obviously AI-generated" look. Appended to
// every prompt that includes a human model.
const REALISM_RULES = `═══════════════════════════════════════
📷 PHOTOREALISM — this must look like a REAL photo of a REAL person, not an AI render:
═══════════════════════════════════════
- Skin: real human skin with visible fine texture and pores, subtle natural unevenness in tone, and natural specular highlights. ABSOLUTELY NO airbrushed, waxy, plastic, porcelain-smooth, or glowing skin.
- Face: natural and slightly imperfect like a real person — subtly asymmetric features, realistic eyes with natural catchlights and moisture, real eyebrow hairs, natural lips. Not doll-like, not overly symmetrical, not "beauty-filter" perfect. Light, realistic everyday makeup only. The face is always sharp and fully in focus — never blurred, pixelated, mosaiced, or censored.
- Hair: individual hair strands with a few natural flyaways and realistic shine, casting real soft shadows on the face/shoulders. Never helmet-smooth or painted-looking hair.
- Hands and fingers: anatomically correct — exactly five fingers per hand, natural relaxed positions, correct proportions. Double-check the hands before finalizing.
- Body and pose: natural body proportions and a slightly relaxed, candid stance — real weight on the feet, natural shoulder drop, not a stiff perfectly-symmetrical mannequin pose.
- Light: one coherent light direction across the entire frame — the shadows on the model, the product, the props, and the floor must all agree. Soft, believable falloff, no floating subject, no halo/cutout edge around the model.
- Environment: the background is a real physical room with natural imperfections — slight texture on walls and floor, realistic perspective, believable contact shadows under every object. It must NOT look like an empty 3D-render void or a fake gradient backdrop.
- Overall: natural photographic contrast and white balance, like an unedited RAW photo lightly graded for a fashion catalog. If any part of the image looks "too perfect", make it more natural.`;

/**
 * Master prompt for the clean, model-free product shot (flat lay / floating
 * product on a premium neutral surface). Product-fidelity rules come FIRST
 * and are repeated at the end, because instruction-following models weight
 * the beginning and end of a prompt most heavily.
 */
export function buildProductShotPrompt(isFootwear = false, scene = buildProductScene(isFootwear)): string {
  return `You are editing a REAL commercial product photo for an e-commerce store. The uploaded image shows the EXACT physical item that will be shipped to a paying customer. Product accuracy is your HIGHEST PRIORITY — higher than aesthetics, higher than creativity.

${FIDELITY_RULES}

═══════════════════════════════════════
✅ ONLY CHANGE — the photography around the product:
═══════════════════════════════════════
⚠️ MANDATORY: ${isFootwear ? "Photograph the footwear from a CLEAR LATERAL SIDE PROFILE, like a side-view shoe catalog image. Show the complete outer sides of the shoes, with each full toe-to-heel silhouette, heel height, upper design and sole unobstructed. Camera is low and side-on, NEVER straight from the front, toe-on, head-on, overhead/top-down, or front three-quarter. Keep both shoes fully in frame and easy to inspect." : "Show the product from the FRONT. Never generate a back view, rear view, or an angle where the front design of the product is hidden or turned away from the camera."}
- This is a CLEAN PRODUCT-ONLY shot — absolutely NO person, model, hands, or body parts anywhere in the frame.
- Floor / background: ${scene.background}
- Placement: ${scene.surface}
- Lighting: ${scene.lighting}
- Composition: ${scene.composition}
- Realistic soft contact shadow grounded under the product (no floating, no cut-out halo edge)
- The floor/surface must have REAL photographic texture — visible stone/concrete grain, subtle tonal variation, natural light falloff across the frame. Never a smooth fake gradient, never a 3D-render void.
- The product itself must look physically real: true fabric/leather texture, natural micro-wrinkles or grain, realistic sheen where light hits it.
- Overall look: premium minimal e-commerce product photography, in the spirit of brands like Zara, Mango, Massimo Dutti, Charles & Keith — clean, elegant, neutral, and unmistakably a real photograph

═══════════════════════════════════════
${TECH_QUALITY} No human model or body part of any kind in this shot.

FINAL REMINDER — the single most important rule: every physical detail of the product (shape, color, heel height, garment length, materials, decorations) must remain perfectly unchanged from the source image. Only the background, lighting, angle, and styling may change, and this shot must contain the product ALONE with no person in it.${isFootwear ? " For footwear, use the same clear side-on lateral profile as the reference example: entire shoes visible from toe to heel, not a frontal or overhead view." : ""}`;
}

/**
 * Master prompt for the model-worn shot. Footwear gets a legs-only crop
 * (matching the reference "Straswans" style: elegant legs mid-step, no face,
 * no upper body). Apparel gets a model wearing the garment, cropped/posed so
 * the face is not the focus and no identifiable individual is depicted.
 */
export function buildModelShotPrompt(isFootwear: boolean, scene = buildModelScene()): string {
  const wornInstructions = isFootwear
    ? `- This is a shot of a woman's bare legs and feet, WEARING the exact shoes from the source photo — cropped from roughly mid-calf down. NO face, NO upper body, NO torso — legs and feet only, exactly like an editorial fashion close-up.
- The shoes MUST be photographed from a CLEAR LATERAL SIDE PROFILE, showing the full outer side of each shoe, from toe to heel, including the sole, side upper and heel shape. Keep the entire shoes visible and unobstructed. NEVER use a straight-on front/toe-on, front three-quarter, top-down, or rear-only view.
- Pose: ${scene.pose}
- Styling: ${pick([
        "bare legs, cropped from mid-calf down",
        "the model wears loose light-wash blue jeans with wide rolled cuffs ending just above the ankle, so the shoes are fully visible below the denim",
        "the model wears relaxed cream-colored trousers with a soft cuff ending above the ankle",
      ])}
- Skin: real human skin with natural texture, fine detail, and realistic tone variation — never smooth plastic CGI skin. Toes and feet anatomically correct with a natural neutral pedicure.
- The shoes must fit and sit on the feet exactly as this shoe would in real life, with correct heel angle and realistic ground contact and a true soft contact shadow — but the shoe itself (heel height, shape, color, materials) must not change at all from the source photo
- Floor: a real textured light concrete/stone floor exactly like a boutique interior — never a fake gradient void`
    : `- This is a full-length shot of a model wearing the exact garment from the source photo, framed head-to-floor like a real boutique Instagram photo (the model occupies roughly the middle 40–60% of the frame height, with visible styled room around her).
- The model has a fictional, invented face — a completely made-up person who does not exist and isn't based on any real individual — with a natural, softly confident expression, realistic and imperfect, fully human. See the photorealism rules: no plastic skin, no doll face.
- ⚠️ The face must be perfectly SHARP, CLEAR, and IN FOCUS — the same crisp focus level as the rest of the photo. NEVER blur, pixelate, mosaic, censor-bar, or obscure the face in any way, and never apply any face-anonymization effect. A blurred or pixelated face is a serious error and must not happen.
- The model FACES THE CAMERA (front view) so the front of the garment — its exact neckline/collar type, closures, print, and full silhouette — is clearly and fully visible.
- Do NOT show the model's back or a back-facing view under any circumstance — the front of the garment is what customers need to see.
- Pose: standing naturally with weight shifted slightly onto one leg, arms relaxed at the sides or one hand gently holding a small clutch — a candid, editorial stance, never a stiff symmetrical mannequin pose.
- The garment must drape and fit naturally on the body — with realistic gravity, natural fabric wrinkles and tension points at the waist/elbows/hips — while keeping its exact original length, cut, neckline/collar type, sleeves, pleats, and every decorative detail unchanged from the source photo
- Footwear: if the source photo does NOT show any shoes on the product, do not invent or add any shoes/sandals — instead crop the frame so the feet are not the focus (e.g. stop just above the floor, or let the hem/floor shadow naturally end the frame). If the source photo already shows the product with specific shoes, keep those exact shoes.
- The model must be believably standing IN the room: her feet cast a real soft contact shadow on the floor, the room's light wraps around her naturally, and she is never pasted/cut-out looking.`;

  return `You are editing a REAL commercial product photo for an e-commerce store. The uploaded image shows the EXACT physical item that will be shipped to a paying customer. Product accuracy is your HIGHEST PRIORITY — higher than aesthetics, higher than creativity.

${FIDELITY_RULES}

═══════════════════════════════════════
✅ ONLY CHANGE — the photography and styling around the product:
═══════════════════════════════════════
⚠️ MANDATORY: ${isFootwear ? "Show the shoes from a clear side-on LATERAL PROFILE. The full toe-to-heel silhouette of each shoe must be visible and easy for a customer to inspect. No front-facing, toe-on, front three-quarter, top-down or rear-only views." : "The product must be shown from the FRONT. Never generate a back view, rear view, or a view where the front design of the product is hidden or turned away from the camera."}
${wornInstructions}
- Background / set: ${scene.background}
- Lighting: ${scene.lighting}
- Camera angle: ${isFootwear ? "a clear low side-on LATERAL camera angle at shoe height, showing the full side silhouette of the shoes, never a frontal or overhead perspective" : scene.angle}
- Realistic soft contact shadow grounded on the floor
- Overall look: a real boutique's Instagram fashion photo — a styled interior set with real props, shot like premium fashion social content (in the spirit of Zara, Mango, Massimo Dutti lookbooks). Warm, elegant, believable. No other people in the frame.

${REALISM_RULES}

═══════════════════════════════════════
${TECH_QUALITY} Do not generate any readable text, watermark, or brand logo other than what already exists on the product itself. Do not depict any real, identifiable public figure — the model must be a completely fictional, invented person. The model's face must be sharp and clearly visible — never blurred, pixelated, or censored.

FINAL REMINDER — the single most important rule: every physical detail of the product (shape, color, heel height, garment length, materials, decorations) must remain perfectly unchanged from the source image${isFootwear ? ", AND the shoes must be seen from their full OUTER SIDES in a clear toe-to-heel lateral profile, never from the front, above or back." : ", AND the product must face the camera — front view only, never the back."}`;
}

/**
 * Generates a brand-new premium boutique-style image purely from a text
 * description — no source photo required. Used for category tiles, hero
 * banners, and subcategory thumbnails where there's no existing product
 * photo to work from, only a name/description the admin typed in.
 */
export async function generateImageFromPrompt(
  description: string,
  aspect: "square" | "portrait" | "landscape" = "landscape",
  /** When given, this exact prompt is sent instead of the editorial one built below. */
  fullPrompt?: string,
): Promise<GeneratedPhoto> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err: any = new Error("GEMINI_API_KEY is not configured. Add it in Secrets.");
    err.noKey = true;
    throw err;
  }

  const aspectNote =
    aspect === "square"
      ? "Square 1:1 composition, subject centered, works as a circular crop."
      : aspect === "portrait"
        ? "Portrait/vertical composition (roughly 3:4 or 4:5)."
        : "Wide horizontal banner composition (roughly 16:9), with clear negative space where a headline could sit.";

  const prompt = `Create a premium, editorial-quality photograph for a women's fashion boutique e-commerce website.

Subject / concept: ${description}

Style requirements:
- Real, photorealistic fashion photography — never illustration, cartoon, 3D render, or CGI look
- Soft, natural daylight or warm studio lighting, elegant and minimal, in the spirit of Zara, Mango, Massimo Dutti, Charles & Keith campaign photography
- Neutral, tasteful color palette (creams, warm neutrals, soft earth tones) unless the subject implies otherwise
- Clean, uncluttered composition with a real physical setting (real floor/wall texture, natural shadows) — never a flat gradient or empty 3D-render void
- ${aspectNote}
- No visible text, no watermark, no logos, no brand names anywhere in the image
- If depicting a person: a completely fictional, invented individual (not a real, identifiable public figure), photographed candidly, natural skin texture, in focus, tasteful and modest styling appropriate for a general retail audience
- Technical quality: indistinguishable from a real photograph shot on a full-frame camera, shallow natural depth of field, true-to-life color grading — never oversaturated or HDR

Generate only the image.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

  const body = {
    contents: [{ parts: [{ text: fullPrompt || prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const MAX_ATTEMPTS = 3;
  const MAX_DELAY = 8000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr: any) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(1500 * attempt, MAX_DELAY));
        continue;
      }
      throw new Error(`Network error contacting Gemini: ${networkErr?.message || networkErr}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isRateLimit = res.status === 429 || /quota|rate limit/i.test(text);
      if (isRateLimit && attempt < MAX_ATTEMPTS) {
        const retryMatch = text.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
        const suggested = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 2000 * 2 ** (attempt - 1);
        await sleep(Math.min(suggested, MAX_DELAY));
        continue;
      }
      throw new Error(
        isRateLimit
          ? "Gemini rate limit / quota reached. Wait a minute and try again."
          : `Gemini image generation failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const json: any = await res.json();
    const parts: any[] = json?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData || p.inline_data);
    const inline = imagePart?.inlineData || imagePart?.inline_data;

    if (!inline?.data) {
      const textPart = parts.find((p) => typeof p.text === "string")?.text;
      const finishReason = json?.candidates?.[0]?.finishReason;
      throw new Error(
        textPart
          ? `Gemini did not return an image: ${textPart.slice(0, 200)}`
          : `Gemini did not return an image${finishReason ? ` (${finishReason})` : ""}.`,
      );
    }

    return {
      buffer: Buffer.from(inline.data, "base64"),
      mimeType: inline.mimeType || inline.mime_type || "image/png",
    };
  }

  throw new Error("AI image generation failed after retries");
}

interface GeneratedPhoto {
  buffer: Buffer;
  mimeType: string;
}

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  return { data: buf.toString("base64"), mimeType };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generates a new campaign-style photo of the exact product shown in
 * `sourceImageUrl`, using Google's Gemini image-generation model
 * ("Nano Banana"). Throws a descriptive error on failure (missing key,
 * rate limit after retries, model refusal, etc.).
 *
 * `shotType`:
 *  - "product": clean, model-free product-only shot
 *  - "model": product worn by an anonymized model (legs-only for footwear)
 * `isFootwear` only matters when shotType === "model".
 */
export async function generateAiProductPhoto(
  sourceImageUrl: string,
  shotType: PhotoShotType = "product",
  isFootwear = false,
): Promise<GeneratedPhoto> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err: any = new Error("GEMINI_API_KEY is not configured. Add it in Secrets.");
    err.noKey = true;
    throw err;
  }

  const { data, mimeType } = await fetchAsBase64(sourceImageUrl);
  const prompt =
    shotType === "model" ? buildModelShotPrompt(isFootwear) : buildProductShotPrompt(isFootwear);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const MAX_ATTEMPTS = 3;
  const MAX_DELAY = 8000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr: any) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(1500 * attempt, MAX_DELAY));
        continue;
      }
      throw new Error(`Network error contacting Gemini: ${networkErr?.message || networkErr}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isRateLimit = res.status === 429 || /quota|rate limit/i.test(text);
      if (isRateLimit && attempt < MAX_ATTEMPTS) {
        const retryMatch = text.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
        const suggested = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 2000 * 2 ** (attempt - 1);
        await sleep(Math.min(suggested, MAX_DELAY));
        continue;
      }
      throw new Error(
        isRateLimit
          ? "Gemini rate limit / quota reached. Wait a minute and try again."
          : `Gemini image generation failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const json: any = await res.json();
    const parts: any[] = json?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData || p.inline_data);
    const inline = imagePart?.inlineData || imagePart?.inline_data;

    if (!inline?.data) {
      // The model may refuse (safety) and return only text explaining why.
      const textPart = parts.find((p) => typeof p.text === "string")?.text;
      const finishReason = json?.candidates?.[0]?.finishReason;
      throw new Error(
        textPart
          ? `Gemini did not return an image: ${textPart.slice(0, 200)}`
          : `Gemini did not return an image${finishReason ? ` (${finishReason})` : ""}.`,
      );
    }

    return {
      buffer: Buffer.from(inline.data, "base64"),
      mimeType: inline.mimeType || inline.mime_type || "image/png",
    };
  }

  throw new Error("AI photo generation failed after retries");
}


/* ───────────────────────── Storefront theme prompts ─────────────────────────
   Every generated storefront photo shares one clean look: a real studio product photo on a
   plain soft colour. Each photo slot on the site adds its own composition rule, written from
   the slot's measured shape, so the subject survives the desktop and the phone crop. */

const THEME_BACKGROUNDS = [
  "soft pink (#F9DCEA)",
  "warm sand beige (#F3E9DD)",
  "pale sage green (#E7EDE2)",
  "dusty rose (#EBC8CF)",
  "soft cream (#F6EDDD)",
];
const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const THEME_RULES = (background: string) => `Look (the same for every photo on the site):
- Real, photorealistic studio product photography. Never an illustration, drawing, icon, 3D render or CGI.
- Background: plain, soft, solid ${background} with only a very gentle gradient. No props, no furniture, no room, no scenery.
- Soft diffused studio light from the front-left and a small soft natural shadow under the subject. No harsh shadows, no glow.
- Product colours from this palette: cream, beige, camel, soft pink, burgundy, black, white, with small gold details. Elegant and feminine.
- Sharp focus, true materials and fabric detail.
- If a person appears: a fictional elegant woman, calm natural pose, modest classy clothing, same plain background.
- No text, letters, numbers, logos, watermarks, labels or price tags anywhere.`;

export type PhotoSlot =
  | "homeHero" | "pageHero" | "promo" | "editorialCenter" | "editorialTile" | "pill" | "menu" | "circle";

const SLOT_RULES: Record<PhotoSlot, { ideas: string[]; composition: string }> = {
  homeHero: {
    ideas: ["a model wearing the look, full length", "a styled group of three hero pieces", "a model holding one statement accessory"],
    composition:
      "Wide horizontal image. The website shows only a wide band from the vertical centre of this image (2.3 times wider than tall), and phones show only the central half of that band. Keep the entire subject inside a box in the exact centre, at most 38% of the image height and 45% of the image width. Everything outside that box is plain background. Nothing important in the lower corners.",
  },
  pageHero: {
    ideas: ["one hero piece", "a pair or a small group of two or three pieces", "a model wearing the piece, three-quarter length"],
    composition:
      "Wide horizontal image. The website shows only a wide band from the vertical centre of this image (about 3 times wider than tall), and phones show only the central 60% of that band. Keep the entire subject inside a box in the exact centre, at most 30% of the image height and 50% of the image width. Everything outside that box is plain background.",
  },
  promo: {
    ideas: ["a neat row of five pieces", "a row of three pieces with generous spacing", "a row of seven small pieces"],
    composition:
      "Wide horizontal image. The website shows only a thin band from the vertical centre of this image (4 times wider than tall), and phones show only the central 44% of that band. Arrange the pieces as one straight row along the horizontal centre line, no taller than 22% of the image height, with the most important pieces inside the central 40% of the width. Above and below the row: plain background.",
  },
  editorialCenter: {
    ideas: ["an outfit hanging as one tall arrangement with a bag and shoes below it", "a model, full length, standing straight", "three garments hanging one above the other in a tall column"],
    composition:
      "The website shows this photo nearly whole on desktop, but phones show only a tall narrow column from the centre (the central 30% of the width). Build one tall vertical arrangement inside that central column, at most 28% of the image width and 75% of the image height. Keep the top fifth and the bottom sixth of the column simple, because a headline and a button are printed there.",
  },
  editorialTile: {
    ideas: ["one piece hanging vertically", "one piece standing upright", "a model, waist up"],
    composition:
      "Wide horizontal image. On desktop the website shows most of it; phones show only a tall narrow column from the centre (the central third of the width). Place ONE subject in the exact centre, at most 30% of the image width and 50% of the image height. Keep the lowest fifth of the image simple and slightly darker, because the name is printed there in white.",
  },
  pill: {
    ideas: ["one single product", "a model, waist up", "a pair of the product"],
    composition:
      "The website shows this as a small photo beside a button label, cut slightly wide on desktop and slightly tall on phones. Place ONE subject in the exact centre, at most 50% of the image width and 65% of the image height, with plain background all around it.",
  },
  menu: {
    ideas: ["one single product", "a pair of the product", "a small neat group of three"],
    composition:
      "Square image. The website shows it almost whole in the phone menu, sometimes cut to a wide strip through the middle. Place the subject in the exact centre, at most 70% of the image width and 50% of the image height. Keep the lowest quarter simple and slightly darker, because the name is printed there in white.",
  },
  circle: {
    ideas: ["one single product", "a pair of the product", "one piece on a slim gold hanger"],
    composition:
      "Square image, shown on the website as a circle. Place the subject in the exact centre, filling about 65% of the frame, completely inside an imaginary circle that touches the four edges. Nothing in the corners.",
  },
};

/** Things that are worn on the body hang on a hanger; shoes, belts, bags and jewellery never do. */
const HANGS_RE =
  /dress|abaya|gown|blouse|shirt|blazer|jacket|coat|cardigan|sweater|knit|top\b|tunic|skirt|pants|trouser|jeans|suit|\bsets?\b|outfit|cloth|kaftan|jumpsuit|فستان|فساتين|عباي|عباء|بلوز|قميص|قمصان|بليزر|جاكيت|معطف|تنور|بنطل|بناطيل|طقم|أطقم|ملابس/i;
const NEVER_HANGS_RE =
  /shoe|heel|boot|sneaker|sandal|ballerina|accessor|perfume|flat\b|loafer|slipper|belt|bag|clutch|purse|wallet|jewel|necklace|earring|bracelet|ring\b|watch|scarf pin|sunglass|حذاء|أحذية|شوز|كعب|جزم|بوت|بسطار|صندل|باليرينا|سنيكرز|قشاط|أقشطة|قشط|حزام|حقيب|شنط|كلتش|إكسسوار|اكسسوار|مجوهر|نظار/i;
export function canHang(subject: string): boolean {
  if (NEVER_HANGS_RE.test(subject)) return false;
  return HANGS_RE.test(subject);
}

/** How this kind of product is presented, so nothing is shown in a way that makes no sense. */
function displayRule(subject: string): string {
  if (canHang(subject)) {
    return "Garments may hang on a slim gold hanger (no rail or pole), be worn by a model, or be neatly folded.";
  }
  return "Never use a hanger, hook, rail or mannequin for this product — hangers are only for garments. Shoes and boots stand on the surface, seen from the side. Belts are neatly coiled or laid flat. Bags stand upright on the surface. Jewellery and small accessories lie flat on the surface.";
}

/** Full prompt for one storefront photo slot. */
export function buildThemedPrompt(slot: PhotoSlot, subject: string): string {
  const rules = SLOT_RULES[slot] || SLOT_RULES.pageHero;
  const hangs = canHang(subject);
  // Ideas that hang the product, or dress a model in it, only suit garments.
  const ideas = rules.ideas.filter((idea) => hangs || !/hang|outfit|garment|wearing/i.test(idea));
  return `Create one photograph for a women's fashion web store, Lucerne Boutique.

Subject: ${subject}
Show it as: ${pickOne(ideas.length ? ideas : ["one single product", "a pair of the product"])}.
Presentation: ${displayRule(subject)}

${THEME_RULES(pickOne(THEME_BACKGROUNDS))}

Composition (important — the website crops this photo):
${rules.composition}

Generate only the image.`;
}

/**
 * Prompt for a category banner: one straight row of real product photos on pure white.
 * The white is trimmed away on the server and blends into the banner colour on the site.
 */
export function buildProductRowPrompt(products: string): string {
  return `Create one photorealistic studio product photograph for a women's fashion web store banner.

Products: ${products}

Rules:
- Wide horizontal image.
- Background: pure flat white, #FFFFFF, edge to edge. No gradient, no texture, no floor line, no vignette, no grey areas, no backdrop shadows.
- ONE single straight row of the products, side by side, centred vertically, spread across almost the full width with a small margin at the left and right edges. Make the products as large as the image allows.
- All products the same height, standing on the same invisible baseline, evenly spaced, not touching each other.
- ${displayRule(products)} Shoes all point the same way.
- Real product photography: sharp, clean, true materials, soft even studio light. Never an illustration, icon, drawing or 3D render.
- Each product a different colour from this palette: nude, beige, camel, soft pink, burgundy, black, olive, navy, with small gold details. Avoid pure white products, because the background is white.
- No shadows on the background, or only a very faint one directly under each product.
- Nothing else in the image: no text, no logos, no watermarks, no labels, no people.

Generate only the image.`;
}

/* ───────────────────────────── Video generation ─────────────────────────────
   Gemini Omni Flash through the Interactions API. With a starting image the clip keeps the
   photo's exact look and only adds gentle movement. */

const GEMINI_VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.1-flash";

export async function generateVideoFromPrompt(subject: string, imageUrl?: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err: any = new Error("GEMINI_API_KEY is not configured. Add it in Secrets.");
    err.noKey = true;
    throw err;
  }

  const motion =
    "Very slow, gentle camera push-in. Fabric and light move softly and naturally. No camera shake, no cuts, no people entering, no new objects, no text. Calm, luxurious fashion mood. No dialogue, no voice, no music.";
  const input: any[] = [];
  if (imageUrl) {
    const { data, mimeType } = await fetchAsBase64(imageUrl);
    input.push({ type: "image", data, mime_type: mimeType });
    input.push({
      type: "text",
      text: `Animate this exact photo into a short, smooth clip for a women's fashion web store banner (${subject}). Keep every item, every colour, the background and the framing exactly as in the photo. ${motion}`,
    });
  } else {
    input.push({
      type: "text",
      text: `A short, smooth clip for a women's fashion web store banner. Subject: ${subject}. Show it as: ${pickOne(
        canHang(subject)
          ? [
              "a piece on a slim gold hanger swaying very gently",
              "an elegant woman wearing the piece, moving slowly and gracefully, modest classy styling",
              "a small styled group of two or three pieces, with a slow glide across them",
            ]
          : [
              "one hero piece turning slowly on an invisible stand",
              "a small styled group of two or three pieces resting on the surface, with a slow glide across them",
            ],
      )}. ${displayRule(subject)} Real studio footage on a plain, soft, solid ${pickOne(THEME_BACKGROUNDS)} background with no props or scenery, the subject centred with empty background around it, soft diffused light, elegant and feminine, colours from cream, beige, camel, soft pink, burgundy and black. ${motion}`,
    });
  }

  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: GEMINI_VIDEO_MODEL,
      input,
      generation_config: { video_config: { task: imageUrl ? "image_to_video" : "text_to_video" } },
      background: false,
      store: false,
      stream: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    const isRateLimit = res.status === 429 || /quota|rate limit/i.test(text);
    throw new Error(
      isRateLimit
        ? "Gemini rate limit / quota reached. Wait a minute and try again."
        : `Gemini video generation failed (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned an unreadable answer for the video.");
  }
  const steps: any[] = Array.isArray(json?.steps) ? json.steps : [];
  const contents: any[] = [
    ...steps.filter((st) => st?.type === "model_output").flatMap((st) => st?.content || []),
    ...(Array.isArray(json?.outputs) ? json.outputs : []),
  ];
  const video = contents.find((c) => c?.type === "video");
  if (video?.data) return Buffer.from(video.data, "base64");
  if (video?.uri) {
    const dl = await fetch(video.uri, { headers: { "x-goog-api-key": apiKey } });
    if (!dl.ok) throw new Error(`Could not download the generated video (${dl.status}).`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error(`Gemini did not return a video${json?.status ? ` (status: ${json.status})` : ""}.`);
}
