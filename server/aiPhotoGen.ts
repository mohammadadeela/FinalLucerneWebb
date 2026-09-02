// ── AI Product Photo Generation (Gemini "Nano Banana" image model) ─────────
// Takes an existing product photo (the exact item that will be sold) and
// generates premium campaign-style photos of it — new background, lighting,
// angle, styling, optionally worn by a model — while the physical product
// itself must remain pixel-for-pixel the same item: same shape, same color,
// same heel height, same hemline, same everything. This module owns the
// prompts and the call to the Gemini image-generation endpoint; callers just
// pass a source image URL + shot type and get back image bytes to upload
// wherever they like (Cloudinary).

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
  "the pair resting directly on the floor, shot top-down as a flat lay, with the chrome leg of a modern chair partially entering the top corner of the frame as a subtle real-life prop",
  "the pair resting directly on the floor, shot top-down as a flat lay, one shoe laid flat and the other tipped naturally on its side against it, toes pointing slightly apart",
  "the pair resting directly on the floor, shot top-down as a flat lay, with generous empty floor around them and nothing else in frame",
  "the pair resting directly on the floor near the soft out-of-focus edge of a sheer white curtain touching the floor",
  "the pair on a low honed-stone step, shot from a slightly elevated three-quarter angle",
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
⚠️ MANDATORY: Show the product from the FRONT. Never generate a back view, rear view, or an angle where the front design of the product is hidden or turned away from the camera.
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

FINAL REMINDER — the single most important rule: every physical detail of the product (shape, color, heel height, garment length, materials, decorations) must remain perfectly unchanged from the source image. Only the background, lighting, angle, and styling may change, and this shot must contain the product ALONE with no person in it.`;
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
- The shoes must be shown from the FRONT/side-front — the toe box and front upper of the shoe must be clearly visible facing the camera. Do NOT show only the back/heel of the shoe.
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
⚠️ MANDATORY: The product must be shown from the FRONT. Never generate a back view, rear view, or a view where the front design of the product is hidden or turned away from the camera.
${wornInstructions}
- Background / set: ${scene.background}
- Lighting: ${scene.lighting}
- Camera angle: ${scene.angle}
- Realistic soft contact shadow grounded on the floor
- Overall look: a real boutique's Instagram fashion photo — a styled interior set with real props, shot like premium fashion social content (in the spirit of Zara, Mango, Massimo Dutti lookbooks). Warm, elegant, believable. No other people in the frame.

${REALISM_RULES}

═══════════════════════════════════════
${TECH_QUALITY} Do not generate any readable text, watermark, or brand logo other than what already exists on the product itself. Do not depict any real, identifiable public figure — the model must be a completely fictional, invented person. The model's face must be sharp and clearly visible — never blurred, pixelated, or censored.

FINAL REMINDER — the single most important rule: every physical detail of the product (shape, color, heel height, garment length, materials, decorations) must remain perfectly unchanged from the source image, AND the product must face the camera — front view only, never the back.`;
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
    contents: [{ parts: [{ text: prompt }] }],
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
