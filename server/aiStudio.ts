// ── AI Studio: product videos and Instagram content ─────────────────────────
// Everything here starts from the store's own photo of the exact item that is
// sold, and follows one rule above all others: the product in the result must
// be the product in the photo. The master fidelity rules written for the AI
// product photos (FIDELITY_RULES in aiPhotoGen.ts) are reused in every prompt.
//
// What this module owns:
//   - the master prompts for product videos and Instagram stills
//   - the calls to the Gemini image model and the Gemini Omni video model
//   - the frame preparation and the single high-quality encode of each video
//   - exact text overlays (drawn by the server, never by the AI, so prices and
//     Arabic words are always spelled correctly)
//   - watermarking of downloaded photos and videos

import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { FIDELITY_RULES, TECH_QUALITY, THEME_BACKGROUNDS } from "./aiPhotoGen";
import { buildWatermarkSvg } from "./watermark";

const execFileAsync = promisify(execFile);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pickOne = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const GEMINI_VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.1-flash";

function log(...args: any[]) {
  console.log("[ai-studio]", ...args);
}

/**
 * True when Google refused the request because the account has no money left (or billing is
 * off). Nothing can work until the owner tops up, so the caller must stop instead of retrying.
 */
export function isBillingProblem(status: number, body: string): boolean {
  return status === 402 || /prepayment credits|credits are depleted|billing (?:is )?(?:not enabled|disabled|account)|enable billing/i.test(body);
}

/** The error every caller throws for an empty account. `noCredit` tells the queue to stop the whole batch. */
export function noCreditError(): Error {
  const err: any = new Error("Your Gemini API balance is empty. Top it up in Google AI Studio (ai.studio/projects), then try again. Nothing more was sent to the API.");
  err.noCredit = true;
  return err;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err: any = new Error("GEMINI_API_KEY is not configured. Add it in Secrets.");
    err.noKey = true;
    throw err;
  }
  return key;
}

/* ───────────────────────────── Formats ───────────────────────────── */

export type StudioFormat = "site" | "post" | "reel" | "square";
export type StudioQuality = "standard" | "high";

/** Pixel sizes of every output. "site" matches the 3:4 product gallery of the storefront. */
export function formatSize(format: StudioFormat, quality: StudioQuality = "high"): { width: number; height: number; aspect: string } {
  const width = quality === "high" ? 1080 : 720;
  const ratio: Record<StudioFormat, [number, number, string]> = {
    site: [3, 4, "3:4"],
    post: [4, 5, "4:5"],
    reel: [9, 16, "9:16"],
    square: [1, 1, "1:1"],
  };
  const [w, h, aspect] = ratio[format] || ratio.site;
  // Even numbers only: H.264 needs them.
  return { width, height: Math.round((width * h) / w / 2) * 2, aspect };
}

/* ───────────────────────────── Loading media ───────────────────────────── */

const uploadsDir = path.resolve(process.cwd(), "uploads");

/** Reads a stored photo or video: a public media URL, or a file in /uploads. */
export async function loadMedia(url: string, timeoutMs = 45000): Promise<Buffer> {
  const clean = String(url || "").trim();
  if (clean.startsWith("/uploads/")) {
    return fs.promises.readFile(path.join(uploadsDir, path.basename(clean.split(/[?#]/)[0])));
  }
  if (!/^https?:\/\//i.test(clean)) throw new Error("Unsupported media address");
  const res = await fetch(clean, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Could not read the stored file (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** A clean JPEG of a reference photo, small enough to send to the model without losing detail. */
async function referenceJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 93, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/**
 * Places a picture on a canvas of the exact output size without cutting the product.
 * A picture of (nearly) the right shape simply fills the canvas. Any other shape is shown
 * whole, on a soft blurred copy of itself, so nothing is cropped away.
 */
export async function fitToCanvas(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  const base = sharp(buffer, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
  const meta = await base.metadata();
  const sourceAspect = (meta.width || width) / (meta.height || height);
  const targetAspect = width / height;
  if (Math.abs(sourceAspect - targetAspect) / targetAspect <= 0.06) {
    return base.resize(width, height, { fit: "cover", kernel: "lanczos3" }).png().toBuffer();
  }
  const input = await base.png().toBuffer();
  const backdrop = await sharp(input).resize(width, height, { fit: "cover" }).blur(48).modulate({ brightness: 1.03 }).toBuffer();
  const whole = await sharp(input).resize(width, height, { fit: "inside", kernel: "lanczos3" }).toBuffer();
  return sharp(backdrop).composite([{ input: whole, gravity: "centre" }]).png().toBuffer();
}

/**
 * First frame for a storefront product video. The video model only makes 9:16 clips, while the
 * product gallery is 3:4. The photo is placed whole in the central 3:4 area of a 9:16 frame and
 * the bands above and below are a blurred continuation; after generation the clip is cut back to
 * that central area, so the storefront video shows exactly the framing of the photo.
 */
export async function buildSiteFirstFrame(photo: Buffer): Promise<Buffer> {
  const width = 1080;
  const height = 1920;
  const centre = await fitToCanvas(photo, 1080, 1440);
  const backdrop = await sharp(centre).resize(width, height, { fit: "cover" }).blur(40).toBuffer();
  return sharp(backdrop)
    .composite([{ input: centre, left: 0, top: (height - 1440) / 2 }])
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/* ───────────────────────────── Master prompts ───────────────────────────── */

export type VideoMotion = "pushIn" | "drift" | "light";

const MOTIONS: Record<VideoMotion, string> = {
  pushIn:
    "a very slow, perfectly smooth camera push-in toward the product, ending only about 8% closer than it started. Nothing else moves.",
  drift:
    "a very slow, perfectly smooth sideways camera slide of only a few centimetres, with gentle natural parallax. The camera keeps facing the same side of the product from start to end.",
  light:
    "the camera is locked off and perfectly still. Soft daylight shifts very gently across the scene, as if a sheer curtain moved slightly, giving a subtle travelling highlight on the product's material.",
};

/**
 * Master prompt for every product video. The photo is the first frame; the product never changes
 * and never turns to show a side the photo does not show, because every unseen side would have to
 * be invented by the model — and an invented detail is a wrong product in front of a customer.
 */
export function buildProductVideoPrompt(opts: {
  isFootwear: boolean;
  motion: VideoMotion;
  seconds: number;
  /** Storefront clips are cut to the central 3:4 area afterwards. */
  centralCrop: boolean;
  /** How many separate products are in the frame (Instagram group shots). */
  productCount?: number;
}): string {
  const count = Math.max(1, opts.productCount || 1);
  const subject = count > 1 ? `the ${count} products` : "the product";
  return `You are animating a REAL commercial product photo for an e-commerce store. The attached image is the FIRST FRAME of the video. It shows the EXACT physical ${count > 1 ? "items" : "item"} that will be shipped to paying customers. Product accuracy is your HIGHEST PRIORITY — higher than motion, higher than aesthetics, higher than creativity.

${FIDELITY_RULES}

═══════════════════════════════════════
🎬 VIDEO RULES — the same product in every single frame:
═══════════════════════════════════════
- The video starts on this exact photo. In every later frame ${subject} must be identical to the first frame: same shape, same colours, same materials, same stitching, hardware, sole${opts.isFootwear ? ", same heel height and toe shape" : ", same length, neckline and cut"}. ${count > 1 ? "Every product keeps its own design and its own colour — nothing is exchanged between them, none disappears and none is added." : ""}
- ${count > 1 ? "The products do NOT" : "The product does NOT"} move, rotate, turn, open, bend or float. Never reveal a side of a product that is not visible in the photo — do not invent hidden details.
- The product must never morph, flicker, melt, stretch, shrink, change colour, or gain or lose any detail at any moment.
- If a person is wearing the product in the photo: she keeps the same pose, with only the slightest natural movement (a tiny weight shift, fabric settling). Her feet stay planted, the product stays fully visible, and no new part of her body or face enters the frame.
- ONLY the camera and the light move: ${MOTIONS[opts.motion] || MOTIONS.pushIn}
- The background, floor and props stay exactly as in the photo. No new objects, no people or hands entering, no text, no captions, no logos, no stickers, no graphics.
- A vertical 9:16 video with the same framing as the first frame. ONE continuous shot of about ${opts.seconds} seconds. No cuts, no transitions, no zoom jumps, no speed changes, no camera shake. The last frame is as calm as the first, so the clip loops cleanly.
- Look: real camera footage, natural colour and contrast, true materials. Never a 3D render, never a glow or beauty filter.
${opts.centralCrop ? "- Keep the product inside the central area of the frame at all times; the top and bottom edges of the frame are cut away later.\n" : ""}- No dialogue, no voice, no music.

FINAL REMINDER — the single most important rule: ${subject} must stay perfectly unchanged from the first frame to the last. Only the camera and the light may move.`;
}

/* ───────────────────────────── Try-on style videos ───────────────────────────── */
// The boutique-reel look: a close shot in a bright studio where the piece is worn, shown by hand,
// or taken out of its Lucerne box. These are made in two steps. First the image model shoots the
// opening frame from the real product photos (a still is where the product is easiest to keep
// exact). Then the video model animates that frame with small, natural movement.

export type VideoStyle = "photo" | "tryOn" | "hands" | "unbox" | "model";

/** What kind of piece a product is. Each kind is worn, held and unboxed in its own way. */
export type ProductKind = "shoes" | "dress" | "abaya" | "top" | "bottom" | "bag" | "belt" | "clothes";

/** Works out the kind from the names of the product, its category and its subcategories (Arabic or English). */
export function detectProductKind(texts: Array<string | null | undefined>, isShoesCategory = false): ProductKind {
  const t = texts.filter(Boolean).join(" ").toLowerCase();
  const has = (re: RegExp) => re.test(t);
  if (has(/عباي|عباء|abaya|جلباب|jilbab|kaftan|قفطان/)) return "abaya";
  if (has(/حزام|أحزمة|احزمة|أقشط|اقشط|قشاط|\bbelts?\b/)) return "belt";
  if (has(/حقيب|حقائب|شنط|شنت|جزدان|محفظ|\bbags?\b|handbag|clutch|\btote|purse|wallet/)) return "bag";
  if (isShoesCategory || has(/حذاء|أحذية|احذية|شوز|بوت|كعب|صندل|سنيكر|سنيكرز|بابوج|شبشب|shoe|boot|heel|sandal|sneaker|loafer|slipper|mule|pump/)) return "shoes";
  if (has(/فستان|فساتين|dress|gown/)) return "dress";
  if (has(/بنطلون|بنطال|بناطيل|تنور|تنانير|جينز|شورت|\bpants\b|trouser|jeans|skirt|\bshorts\b|legging/)) return "bottom";
  if (has(/بلوز|قميص|قمصان|تيشيرت|كنز|بلوفر|جاكيت|جاكت|سترة|معطف|كارديغان|\btops?\b|shirt|blouse|sweater|jacket|coat|cardigan|hoodie|blazer/)) return "top";
  return "clothes";
}

const KIND_NOUN: Record<ProductKind, string> = {
  shoes: "pair of shoes", dress: "dress", abaya: "abaya", top: "top", bottom: "trousers or skirt", bag: "bag", belt: "belt", clothes: "garment",
};

// The model: a believable professional, face in frame, wearing the piece exactly as it is designed.
const MODEL = "She is a professional fashion model with a natural, beautiful, believable face: real skin, soft natural makeup, hair simply styled, a calm confident expression. She is an invented person and does not resemble any celebrity or known individual. She wears the piece exactly as it is designed to be worn, styled like an international fashion campaign, with simple pieces that suit it and never compete with it.";

/**
 * Sets for the styled videos. Each video gets one at random, so a page of products never looks
 * like the same room over and over. All are soft, bright, feminine and uncluttered.
 */
export const REEL_SETS: string[] = [
  "a bright minimal fashion studio: smooth light-grey polished concrete floor, plain pale walls, tall windows softly out of focus, soft daylight from the side",
  "a soft blush-pink studio: seamless powder-pink backdrop curving into the floor, gentle even daylight, one sheer white curtain moving slightly at the edge",
  "an elegant boutique interior: warm cream walls with delicate panel mouldings, pale oak herringbone floor, a brass clothes rail and an arched mirror softly out of focus, warm window light",
  "a creamy beige studio with soft plaster walls and a rounded arch niche, pale travertine floor, a single vase of dried pampas grass far in the background, soft golden-hour light",
  "a light sage-green studio: muted pastel green wall, pale stone floor, a small round side table with fresh white flowers out of focus, soft diffused daylight",
  "a romantic Parisian-style room: tall white French windows with sheer curtains, white panelled walls, light oak floor, soft morning light and gentle shadows of the window frames",
  "a soft lilac-and-ivory studio: pale lavender backdrop, ivory floor, large soft shadows of leaves on the wall from window light, airy and calm",
  "a luxury fitting room: ivory boucle bench, soft champagne curtains, pale marble floor, a tall mirror with a thin gold frame out of focus, warm flattering light",
  "a sunlit terrace in soft pastel tones: pale pink plaster wall, light terracotta tiles, a few green leaves at the edge of the frame, gentle open-shade daylight",
  "a clean white marble boutique corner: white marble floor with faint grey veining, pale rose velvet armchair out of focus, fresh peonies in a glass vase, bright soft daylight",
];

type Styled = Exclude<VideoStyle, "photo">;
type Staged = Exclude<Styled, "model">;

// "Model" style: a fashion-film presentation. The model shows the piece the way a model
// would on a shoot: a few steps, a pose, a turn of the body toward the camera.
const MODEL_SCENES: Record<ProductKind, string> = {
  shoes: `A model is WEARING the pair, caught mid-stride walking toward the camera. Full-length frame from above her head to the floor, shot from a low angle so the shoes are large, sharp and clearly lit in the lower part of the picture, one shoe showing the same side as the photo. ${MODEL} Her outfit ends above the ankle so nothing covers the shoes.`,
  dress: `A model is WEARING the dress, standing in a confident, graceful fashion pose, one hand lightly on her waist, weight on one leg. Full-length frame from above her head down to her shoes; the whole dress is visible and falls naturally. ${MODEL}`,
  abaya: `A model is WEARING the abaya, standing in a graceful, elegant pose, one arm slightly lifted so the sleeve opens. Full-length frame from above her head to the floor; the whole abaya, its trim and its flow are visible. ${MODEL} The abaya is worn exactly as its photos show it, with the head covering only if the photos show one.`,
  top: `A model is WEARING the top, in a relaxed, confident fashion pose, one hand in her trouser pocket. Frame from above her head down to mid-thigh; the whole top is visible. ${MODEL} Worn with simple well-cut trousers.`,
  bottom: `A model is WEARING the piece, standing in a confident fashion pose with one leg slightly forward. Full-length frame from above her head to the floor; its whole length, waistband and cut are visible. ${MODEL} Worn with a simple fitted top tucked in, and elegant simple shoes.`,
  bag: `A model presents the bag, holding it up slightly in front of her hip with one hand so its front faces the camera, sharp and fully visible. Three-quarter frame from above her head to the knee. ${MODEL} Her outfit is simple and in a soft colour that makes the bag stand out.`,
  belt: `A model is WEARING the belt at her waist over a simple dress or high-waisted trousers in a soft plain colour, standing in a confident pose, one hand resting by the buckle. Frame from above her head to mid-thigh, the buckle sharp and fully visible. ${MODEL}`,
  clothes: `A model is WEARING the garment, standing in a confident, graceful fashion pose. Full-length frame from above her head to the floor; the whole garment is visible. ${MODEL}`,
};

const MODEL_ACTIONS: Record<ProductKind, string> = {
  shoes: "She walks three slow, elegant steps toward the camera and stops, turning one foot outward to present the shoe. The camera lowers gently toward the shoes as she stops.",
  dress: "She takes two slow steps toward the camera, stops, and turns her body a quarter to one side and back with a soft smile, the skirt moving with her. One hand brushes the fabric lightly.",
  abaya: "She takes two slow, graceful steps toward the camera so the abaya flows, stops, and opens one arm to show the sleeve, then lets it fall.",
  top: "She shifts her weight, adjusts the collar or cuff with one hand, and turns her shoulders a quarter to one side and back, looking toward the camera.",
  bottom: "She takes two slow steps toward the camera, stops with one leg forward, and turns her hips a quarter to one side and back so the cut is seen.",
  bag: "She takes one slow step, lifts the bag a little toward the camera, turns it a few degrees and back, then lowers it to her side.",
  belt: "She turns her waist a quarter to one side and back, one hand sliding along the belt to the buckle, light travelling over it.",
  clothes: "She takes two slow steps toward the camera, stops, and turns a quarter to one side and back, one hand smoothing the fabric.",
};

const FRAME_SCENES: Record<ProductKind, Record<Staged, string>> = {
  shoes: {
    tryOn: "A woman is WEARING the pair. Frame from just below the knee down to the floor: bare ankles, sheer tights or the hem of plain trousers, as suits the shoe. Feet standing naturally on the floor, one foot slightly forward and angled so the side profile of the shoe from the photo is clearly visible. No face, no upper body.",
    hands: "A woman's hands with neat natural nails hold ONE shoe of the pair gently by the heel and the toe, a little above the floor, showing the same side as the photo. The other shoe of the pair stands on the floor just behind it, slightly out of focus. No face, no body beyond the forearms.",
    unbox: "Top-down view of the floor. An open shoe box in soft blush pink lies on the floor with white tissue paper inside. The pair rests in the tissue paper, fully visible. A woman's hands rest on the edges of the box, about to lift one shoe out.",
  },
  dress: {
    tryOn: `A woman is WEARING the dress, standing relaxed with one hand lightly holding the skirt. Full-length frame from above her head down to the hem and her shoes, so the whole dress is visible, its full length and how it falls. ${MODEL} Elegant simple shoes.`,
    hands: "The dress hangs on a slim wooden hanger on a plain clothes rail. A woman's hand with neat natural nails holds the side of the skirt out a little to show the fabric and how it drapes. The whole dress is visible. No face, no body beyond the forearm.",
    unbox: "Top-down view of the floor. A wide, shallow gift box in soft blush pink lies open with white tissue paper inside. The dress lies neatly folded in the tissue, its neckline and the most distinctive part of its fabric clearly visible. A woman's hands rest on the tissue, about to unfold it.",
  },
  abaya: {
    tryOn: `A woman is WEARING the abaya, standing gracefully, one hand lightly lifting the edge of the sleeve or the front panel. Full-length frame from above her head down to the floor so the full length, the sleeves and the way the fabric flows are visible. ${MODEL} The abaya is worn exactly as it is cut and as its photos show it, with the head covering only if the photos show one.`,
    hands: "The abaya hangs full length on a slim wooden hanger on a plain clothes rail. A woman's hand with neat natural nails holds the sleeve out to show its cut, its trim and the weight of the fabric. The whole abaya is visible. No face, no body beyond the forearm.",
    unbox: "Top-down view of the floor. A wide, shallow gift box in soft blush pink lies open with white tissue paper inside. The abaya lies neatly folded in the tissue with its neckline, front trim or embroidery on top and clearly visible. A woman's hands rest on the tissue, about to unfold it.",
  },
  top: {
    tryOn: `A woman is WEARING the top, standing relaxed, one hand adjusting the cuff or the hem. Frame from above her head down to the hips so the whole top is visible. ${MODEL} Worn with simple well-cut trousers.`,
    hands: "The top hangs on a slim wooden hanger on a plain clothes rail. A woman's hand with neat natural nails holds the sleeve or the hem out a little to show the fabric. The whole top is visible. No face, no body beyond the forearm.",
    unbox: "Top-down view of the floor. A gift box in soft blush pink lies open with white tissue paper inside. The top lies neatly folded in the tissue with its neckline and front clearly visible. A woman's hands rest on the tissue, about to lift it.",
  },
  bottom: {
    tryOn: `A woman is WEARING the piece, standing relaxed with one foot slightly forward. Full-length frame from above her head down to the floor, the piece in the centre, so its whole length, waistband and cut are visible. ${MODEL} Worn with a simple fitted top tucked in at the waist, and elegant simple shoes.`,
    hands: "The piece hangs from a slim clip hanger on a plain clothes rail. A woman's hand with neat natural nails holds the side of the leg or the hem out a little to show the fabric and the cut. The whole piece is visible. No face, no body beyond the forearm.",
    unbox: "Top-down view of the floor. A gift box in soft blush pink lies open with white tissue paper inside. The piece lies neatly folded in the tissue with its waistband and front clearly visible. A woman's hands rest on the tissue, about to lift it.",
  },
  bag: {
    tryOn: `A woman CARRIES the bag the way it is made to be carried (in the hand by its handle, on the forearm, or on the shoulder by its strap, whichever its design shows). Three-quarter frame from above her head down to the knee, the bag at her side facing the camera with its front fully visible and sharp. ${MODEL} Her outfit is simple and in a soft colour that makes the bag stand out.`,
    hands: "The bag stands upright on a low pale stone block. A woman's hands with neat natural nails rest on it: one steadies the handle, the other touches the clasp or the front flap. The whole bag is visible from the same side as the photo. No face, no body beyond the forearms.",
    unbox: "Top-down view of the floor. A gift box in soft blush pink lies open with white tissue paper inside. The bag lies in the tissue on its back, front side up and fully visible, handle or strap laid neatly. A woman's hands rest on the edges of the box, about to lift it out.",
  },
  belt: {
    tryOn: `A woman is WEARING the belt at her waist over plain high-waisted trousers or a plain dress in a soft neutral colour. Frame from her shoulders to her hips, the buckle centred and sharp, the whole width of the belt and the buckle fully visible. One hand rests near the buckle. ${MODEL}`,
    hands: "A woman's hands with neat natural nails hold the belt in a gentle loose coil, the buckle on top facing the camera, above a pale stone surface. The buckle, the strap's surface, its edge stitching and its holes are sharp and fully visible. No face, no body beyond the forearms.",
    unbox: "Top-down view of the floor. A small gift box in soft blush pink lies open with white tissue paper inside. The belt lies in a neat coil in the tissue with the buckle on top, fully visible. A woman's hands rest on the edges of the box, about to lift it out.",
  },
  clothes: {
    tryOn: `A woman is WEARING the garment, standing relaxed. Full-length frame from above her head, so the whole garment is visible from its top edge to its hem. ${MODEL} Simple pieces with it, and elegant shoes.`,
    hands: "The garment hangs on a slim wooden hanger on a plain clothes rail. A woman's hand with neat natural nails holds its side out a little to show the fabric. The whole garment is visible. No face, no body beyond the forearm.",
    unbox: "Top-down view of the floor. A gift box in soft blush pink lies open with white tissue paper inside. The garment lies neatly folded in the tissue with its most distinctive part clearly visible. A woman's hands rest on the tissue, about to lift it.",
  },
};

const VIDEO_ACTIONS: Record<ProductKind, Record<Staged, string>> = {
  shoes: {
    tryOn: "She shifts her weight, lifts the front foot slightly and turns it a little left and right to show the shoe, then sets it down again and takes one small step in place. Her hand may come down once to smooth or adjust the top of the shoe.",
    hands: "The hands slowly tilt the shoe a few degrees toward the camera and back, one thumb gently pressing the material to show its softness, then lower it toward the floor next to the other shoe.",
    unbox: "The hands fold the tissue paper aside, lift one shoe slowly out of the box and hold it just above the box for the camera.",
  },
  dress: {
    tryOn: "She sways gently from side to side so the skirt moves, lets the fabric fall from her hand, and makes a slow quarter turn and back. The fabric moves with its real weight.",
    hands: "The hand lets the skirt fall, then runs slowly down the fabric and lifts the hem a little so it catches the light and drapes back.",
    unbox: "The hands open the tissue paper and lift the top of the dress a little out of the box so the fabric unfolds softly.",
  },
  abaya: {
    tryOn: "She takes one slow, small step forward and back so the abaya flows, then raises one arm slightly to let the sleeve open and fall. The fabric moves with its real weight and settles calmly.",
    hands: "The hand lets the sleeve fall, then runs slowly along the front trim and lifts the fabric a little so it flows back into place.",
    unbox: "The hands open the tissue paper and lift the top of the abaya a little out of the box so the fabric unfolds softly, the trim staying in view.",
  },
  top: {
    tryOn: "She adjusts the cuff, smooths the front once with her hand and makes a small quarter turn and back, so the fabric moves naturally.",
    hands: "The hand rubs the fabric lightly between two fingers, then lets it go and gently sways the hanger a few degrees.",
    unbox: "The hands open the tissue paper and lift the top by its shoulders a little out of the box.",
  },
  bottom: {
    tryOn: "She shifts her weight from one leg to the other, takes one small step in place and makes a slight quarter turn and back, so the fabric moves and falls naturally.",
    hands: "The hand lets the fabric fall, runs down its side seam and lifts the hem a little so it drapes back.",
    unbox: "The hands open the tissue paper and lift the piece by its waistband a little out of the box.",
  },
  bag: {
    tryOn: "She lets the bag swing very slightly, turns it a few degrees toward the camera and back with her hand, and adjusts her grip on the handle or strap once.",
    hands: "One hand lifts the handle and lets it fall softly, the other slides a fingertip over the clasp and the surface of the bag. The bag itself stays upright and does not open.",
    unbox: "The hands fold the tissue paper aside, lift the bag slowly out of the box by its handle and hold it upright above the box, front to the camera.",
  },
  belt: {
    tryOn: "Her hand touches the buckle, slides along the belt to the side and back, and she turns her waist a few degrees left and right so light travels over the buckle.",
    hands: "The hands slowly uncoil a little of the belt and tilt the buckle a few degrees toward the camera and back so it catches the light.",
    unbox: "The hands fold the tissue paper aside, lift the belt by its buckle slowly out of the box and let the strap hang straight.",
  },
  clothes: {
    tryOn: "She shifts her weight gently, smooths the fabric once with one hand and makes a small quarter turn and back, so the fabric moves naturally.",
    hands: "The hand rubs the fabric lightly between two fingers, then lets it go and gently sways the hanger a few degrees.",
    unbox: "The hands open the tissue paper and lift the garment a little out of the box.",
  },
};

/** Prompt for the opening frame of a styled video. The attached photos are the same product; a logo image may follow them. */
export function buildStyleFramePrompt(opts: { style: Styled; kind: ProductKind; photoCount: number; hasLogo: boolean; spec?: string; fixes?: string[]; set?: string; colours?: string[]; simple?: boolean }): string {
  const lid = opts.hasLogo
    ? " The box lid lies beside it, face up, printed with the logo from the LAST attached image, copied exactly: the butterfly mark with the words LUCERNE BOUTIQUE below it, flat and centred on the lid, spelled exactly like that."
    : " The box lid lies beside it, face up and completely plain.";
  const scene: Record<Styled, string> = {
    tryOn: FRAME_SCENES[opts.kind].tryOn,
    hands: FRAME_SCENES[opts.kind].hands,
    unbox: FRAME_SCENES[opts.kind].unbox + lid,
    model: MODEL_SCENES[opts.kind],
  };
  const colours = (opts.colours || []).filter(Boolean);
  const many = colours.length > 1;
  const one = opts.kind === "shoes" ? "pair" : "piece";
  // All the colours of one model in a single shot: one is worn or held, the others are laid out beside it.
  const others: Record<Styled, string> = {
    tryOn: opts.kind === "shoes"
      ? `She wears the FIRST colour. The other ${colours.length - 1} colour(s) stand on the floor right beside her feet as complete pairs, in a neat staggered row, each pair fully visible, in focus and not overlapping another.`
      : opts.kind === "bag" || opts.kind === "belt"
        ? `She carries or wears the FIRST colour. The other ${colours.length - 1} colour(s) are displayed right beside her on a low pale plinth, side by side, each one fully visible, in focus and not overlapping another.`
        : `She wears the FIRST colour. The other ${colours.length - 1} colour(s) hang right beside her on a slim clothes rail, each on its own hanger, spaced apart, facing the camera, fully visible from top to hem and in focus.`,
    hands: `The hands hold or touch the FIRST colour. The other ${colours.length - 1} colour(s) are arranged right beside it in a neat row, each ${one} fully visible, in focus and not overlapping another.`,
    model: opts.kind === "shoes" || opts.kind === "bag" || opts.kind === "belt"
      ? `She wears or carries the FIRST colour. The other ${colours.length - 1} colour(s) are displayed right beside her on a low pale plinth, side by side, each one fully visible, in focus and not overlapping another.`
      : `She wears the FIRST colour. The other ${colours.length - 1} colour(s) hang right beside her on a slim clothes rail, each on its own hanger, spaced apart, facing the camera, fully visible from top to hem and in focus.`,
    unbox: `The box holds the FIRST colour. The other ${colours.length - 1} colour(s) lie on the floor right beside the box on their own sheets of white tissue paper, in a neat row, each ${one} fully visible and not overlapping another.`,
  };
  const colourBlock = many
    ? `
═══════════════════════════════════════
🎨 ALL ${colours.length} COLOURS IN ONE SHOT:
═══════════════════════════════════════
- This model is sold in ${colours.length} colours. The attached product photos are in this order, one photo per colour: ${colours.map((c, i) => `image ${i + 1} = ${c}`).join("; ")}.
- Show exactly ${colours.length} ${opts.kind === "shoes" ? "pairs" : "pieces"}: one of each colour. No colour twice, none missing, no extra colour invented.
- ${others[opts.style]}
- Every colour is the SAME design: identical shape, size, material and details. ONLY the colour differs, and each colour matches its own photo exactly (hue, depth and sheen). Never mix colours between pieces and never blend two colours into one piece.
- All ${colours.length} colours are clearly visible at the same time, evenly lit, with a little space between them, so a customer can count and compare them at a glance.
`
    : "";
  const lens = opts.kind === "shoes" ? "camera at knee height" : opts.kind === "belt" || opts.kind === "bag" ? "camera at waist height" : "camera at chest height, far enough back to show the whole piece";
  return `You are re-shooting a REAL product for an online boutique. The first ${many ? `${opts.photoCount} attached images are photos of the SAME model in ${colours.length} different colours, one photo per colour` : opts.photoCount > 1 ? `${opts.photoCount} attached images are photos of the SAME physical product from different sides` : "attached image is a photo of the product"}. It is a ${KIND_NOUN[opts.kind]} and will be shipped to paying customers exactly as shown. Product accuracy is your HIGHEST PRIORITY — higher than styling, higher than aesthetics.

${FIDELITY_RULES}

═══════════════════════════════════════
📸 THE NEW SHOT:
═══════════════════════════════════════
- Scene: ${opts.set || REEL_SETS[0]}. Uncluttered, soft, feminine and luxurious, like the campaign of an international fashion house shot in a professional studio or boutique. Colours stay gentle so the product is the strongest thing in the picture. Shot on a professional full-frame camera with a 50mm lens, shallow depth of field, ${lens}.
- ${scene[opts.style]}
- The product is reproduced EXACTLY from the photos: same shape, proportions, length, colour, material and texture, same stitching, seams, hardware, zips, buttons, buckles, straps, prints, embroidery and trims, in the same places. Use every attached product photo to get each side right. Do not simplify, restyle or "improve" anything. Do not add any detail the photos do not show.
- The product is the hero: sharp, well lit, fully inside the central part of the frame, with clear space above and below it.
- REAL PEOPLE, REAL PHOTOGRAPH. This must look like an unedited frame from a professional fashion film of a real woman in a real place, not like an illustration, a render or an AI picture:
  • skin with true texture: visible pores, fine lines on knuckles and knees, faint veins and tendons, tiny hairs, slight natural unevenness of tone, a small mole or freckle is welcome. Never smooth, waxy, airbrushed, glossy or doll-like.
  • anatomically correct hands and feet: five fingers, real knuckles and nail beds, natural short nails, normal proportions, a relaxed natural grip with real pressure on what they touch.
  • real ankles, calves and knees with normal anatomy and weight on the floor; tights, if any, show their real weave and slight creases.
  • real contact: soft true shadows under the shoes and hands, the floor slightly reflecting, fabric and leather creasing where they bend.
  • real camera: natural daylight with its small imperfections, true colours, slight sensor grain, natural depth of field. No HDR glow, no over-sharpening, no perfect symmetry, no studio-render lighting.
- No text anywhere${opts.style === "unbox" && opts.hasLogo ? " except the logo on the box lid" : ""}. No other brand names, no price tags, no watermarks, no captions.
${opts.simple ? "- FRAMING OVERRIDE (this replaces any framing above): do NOT show a face. Frame the model from the shoulders or neck down only, fully and neatly dressed, in a calm standing pose. Keep the picture simple: one woman, the product, the room.\n" : ""}${colourBlock}- Vertical 9:16 frame. The top eighth and the bottom eighth of the picture are trimmed off later, so keep her head, the whole product and everything important inside the middle three quarters of the height, with only background or floor in the top and bottom strips.
${opts.spec ? `\n═══════════════════════════════════════\n📋 PRODUCT SPEC — written from the real photos. Every point must be true in your image:\n═══════════════════════════════════════\n${opts.spec}\n` : ""}${opts.fixes?.length ? `\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED by quality control because the product did not match the photos. Fix exactly these points this time:\n${opts.fixes.map((f) => `- ${f}`).join("\n")}\n` : ""}
${TECH_QUALITY}`;
}

/**
 * Prompt for the next part of a long video. The attached image is the LAST frame of the part
 * before it, so the clips join into one continuous shot.
 */
export function buildContinuationPrompt(opts: { kind: ProductKind; cameraOnly: boolean; part: number; parts: number; seconds: number; spec?: string; colourCount?: number }): string {
  const soft = opts.kind !== "shoes" && opts.kind !== "bag" && opts.kind !== "belt";
  const cameraBeats = [
    "The camera glides very slowly a little closer to the product, then holds.",
    "The camera slides very slowly a few centimetres to one side with gentle parallax, then holds.",
    "The camera eases very slowly back to a slightly wider view, then holds.",
  ];
  const modelBeats = [
    "She relaxes into a new natural pose and the camera moves slowly closer to the product to show its material and details, then holds there.",
    soft
      ? "She moves gently so the fabric sways, touches the piece lightly with one hand, and the camera travels slowly along it from top to bottom."
      : "She turns the product a few degrees toward the light and back, touching it lightly with one hand, while the camera stays close on its details.",
    "The camera eases slowly back to the full view while she settles into a calm final pose and stays still for the last second.",
  ];
  const beat = (opts.cameraOnly ? cameraBeats : modelBeats)[(opts.part - 2) % 3];
  const many = (opts.colourCount || 1) > 1;
  return `You are continuing a product video for an online boutique. The attached image is the LAST FRAME of the previous part, so this part must begin on exactly this image and carry on the SAME continuous shot: same place, same light, same person, same product, same camera. This is part ${opts.part} of ${opts.parts}. The product is a REAL item that will be shipped to paying customers; its accuracy is the HIGHEST PRIORITY.

- The product looks identical in every frame to how it looks in this image: same shape, length, colour, material, stitching, hardware, prints and trims. It never morphs, flickers, stretches, changes colour, or gains or loses a detail.
- What happens in this part: ${opts.cameraOnly ? "nothing in the scene moves; only the camera does. " : ""}${beat}
- ${opts.cameraOnly ? "No people or hands enter." : "If a face is visible it stays the same person with a calm natural expression and no talking. Hands keep five natural fingers. Real human movement at normal speed, never floaty."}
${many ? `- All ${opts.colourCount} colours shown stay in the frame, in their places, unchanged.\n` : ""}- Do not reveal a side of the product that has not been seen. Nothing new enters the scene. No text, captions or graphics appear; any logo already visible stays exactly as it is.
- ONE continuous shot of about ${opts.seconds} seconds with no cuts or speed changes, starting without any jump from the attached frame.
- Keep the product inside the central area of the frame; the top and bottom edges are cut away later.
- Real camera footage, natural colour, slight grain. Never a render, glow or filter. No dialogue, no voice, no music.
${opts.spec ? `\nPRODUCT SPEC — true in every frame:\n${opts.spec}\n` : ""}
FINAL REMINDER: the product stays exactly as in the attached frame from start to end.`;
}

/** Opening frame for the product-only style when all colours share one video: a clean line-up, nobody in the shot. */
export function buildColourLineupPrompt(opts: { kind: ProductKind; colours: string[]; set: string; spec?: string; fixes?: string[] }): string {
  const n = opts.colours.length;
  const unit = opts.kind === "shoes" ? "pairs" : "pieces";
  const layout =
    opts.kind === "shoes" ? "standing on the floor in a neat, slightly staggered row, each pair angled the same way to show its side profile"
    : opts.kind === "bag" ? "standing upright side by side on a low pale plinth, fronts to the camera"
    : opts.kind === "belt" ? "laid in neat loose coils side by side on a pale stone surface, buckles on top"
    : "hanging side by side on a slim clothes rail, each on its own hanger, spaced apart, fronts to the camera, visible from top to hem";
  return `You are re-shooting a REAL product for an online boutique. The ${n} attached images are photos of the SAME model in ${n} different colours, one photo per colour, in this order: ${opts.colours.map((c, i) => `image ${i + 1} = ${c}`).join("; ")}. Product accuracy is your HIGHEST PRIORITY.

${FIDELITY_RULES}

═══════════════════════════════════════
📸 THE NEW SHOT — all ${n} colours together, no people:
═══════════════════════════════════════
- Scene: ${opts.set}. Soft, feminine, uncluttered, like a professional studio or boutique.
- Exactly ${n} ${unit}, one of each colour, ${layout}. No colour twice, none missing, none invented.
- Every colour is the SAME design; ONLY the colour differs, and each matches its own photo exactly. Never mix or blend colours between pieces.
- All ${n} are sharp, evenly lit, fully visible, not overlapping, with a little space between them.
- No people, no hands, no text, no logos other than what is on the product, no price tags.
- Vertical 9:16 frame. The top eighth and the bottom eighth are trimmed off later: keep every piece inside the middle three quarters of the height.
${opts.spec ? `\nPRODUCT SPEC (true for every colour, apart from the colour itself):\n${opts.spec}\n` : ""}${opts.fixes?.length ? `\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED by quality control. Fix exactly these points:\n${opts.fixes.map((f) => `- ${f}`).join("\n")}\n` : ""}
${TECH_QUALITY}`;
}

/** Prompt that animates the opening frame made by buildStyleFramePrompt. */
export function buildStyleVideoPrompt(opts: { style: Styled; kind: ProductKind; seconds: number; spec?: string; colourCount?: number }): string {
  const many = (opts.colourCount || 1) > 1;
  const action = opts.style === "model" ? MODEL_ACTIONS[opts.kind] : VIDEO_ACTIONS[opts.kind][opts.style] + (opts.style === "unbox" ? " The lid with its logo stays where it is, flat and unchanged." : "");
  const soft = opts.kind !== "shoes" && opts.kind !== "bag" && opts.kind !== "belt";
  return `You are animating the attached image, which is the FIRST FRAME of a short product video for an online boutique. The product in it is a REAL item that will be shipped to paying customers. Product accuracy is your HIGHEST PRIORITY — higher than motion, higher than aesthetics.

═══════════════════════════════════════
🎬 VIDEO RULES:
═══════════════════════════════════════
- The product must look identical in every frame to how it looks in the first frame: same shape, length, colour, material, stitching, hardware, prints and trims. It never morphs, flickers, melts, stretches, changes colour, or gains or loses a detail. ${soft ? "The fabric moves and folds like that real fabric does, but its print, embroidery, seams and buttons stay exactly where they are and its length and cut never change." : "It keeps its real stiffness: leather, soles, buckles and bag bodies do not bend like cloth."}
- Movement: ${action} All movement is calm, small and natural, like a professional fashion film.
${many ? `- The first frame shows ${opts.colourCount} colours of the same model. All ${opts.colourCount} stay in the frame, in their places, fully visible and unchanged for the whole clip: none disappears, none is added, none changes colour, and colours never swap or bleed between pieces. Only the one being worn or held moves. Near the end the camera drifts slowly across the other colours so each one is seen clearly.\n` : ""}- Do not turn the product far enough to reveal a side that is not visible in the first frame.
- Hands always have five natural fingers. If a face is in the first frame it stays the same person in every frame, with a calm, natural expression, natural blinking and no talking; her features never change. If no face is in the first frame, none enters.
- The camera is handheld but very steady, with at most a slight slow push-in. Same room, same light, same floor from start to end. Nothing new enters the scene.
- Any logo or lettering visible in the first frame stays exactly as it is, sharp and unchanged. No new text, captions, stickers or graphics appear.
- ONE continuous shot of about ${opts.seconds} seconds. No cuts, no transitions, no speed changes.
- Keep the product inside the central area of the frame at all times; the top and bottom edges are cut away later.
- REAL FOOTAGE, NOT ANIMATION. It must look like a real fashion film of a real woman: skin keeps its pores, lines and texture in every frame and never turns smooth or waxy; hands keep five correct fingers and never merge, bend wrongly or slide through the product; muscles and tendons move under the skin; her body carries real weight.
- Real-world physics and timing: movement at normal human speed with tiny natural hesitations, never floaty, never slow-motion, never gliding or sliding. Materials behave like the real thing: leather creases a little where it bends and springs back, fabric swings and settles. Shadows and reflections move with the movement.
- Real camera feel: a professional camera on a gimbal with very slight natural movement, natural motion blur on fast parts, slight sensor grain, constant exposure and white balance. Never a 3D render, never a glow or beauty filter, no morphing, no warping backgrounds.
- No dialogue, no voice, no music.
${opts.spec ? `\nPRODUCT SPEC — these facts about the product stay true in every frame:\n${opts.spec}\n` : ""}
FINAL REMINDER: the product stays exactly as in the first frame from start to end.`;
}

/* ───────────────────────────── Quality control ───────────────────────────── */
// A second model looks at what was generated and compares it with the real photos, the way a
// careful shop owner would: first it writes down what the product really looks like, then it
// scores every generated frame against the photos. A frame that does not match is shot again.

const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-flash-latest";

async function visionJson(prompt: string, images: Buffer[]): Promise<any | null> {
  try {
    const parts: any[] = [{ text: prompt }];
    for (const image of images) {
      const jpeg = await sharp(image, { failOn: "none" }).rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
      parts.push({ inline_data: { mime_type: "image/jpeg", data: jpeg.toString("base64") } });
    }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const body = await res.text();
      if (isBillingProblem(res.status, body)) throw noCreditError();
      throw new Error(`${res.status} ${body.slice(0, 160)}`);
    }
    const data: any = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).filter((p: any) => typeof p?.text === "string" && !p.thought).map((p: any) => p.text).join("");
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch (err: any) {
    if (err?.noCredit) throw err;
    // Quality control is a safety net; if it is unavailable the video is still made.
    log("quality check unavailable:", err?.message || err);
    return null;
  }
}

/** A short, exact written description of the product, taken only from its real photos. */
export async function describeProduct(photos: Buffer[], kind: ProductKind): Promise<string> {
  const isFootwear = kind === "shoes";
  const data = await visionJson(
    `These ${photos.length} image(s) show ONE real ${KIND_NOUN[kind]} sold by a boutique. Write its exact visual specification so that an artist who cannot see the photos could not get any detail wrong. Only state what is clearly visible; never guess.
Return JSON: {"spec": ["...", "..."]} with 8 to 14 short bullet strings covering, where visible: item type; exact colour(s) in plain words and where each colour sits; material and surface (smooth, grained, suede, patent, knit, mesh...) and how shiny; overall silhouette and height (${isFootwear ? "ankle / mid-calf / knee-high shaft, toe shape, heel type, heel height and heel shape, sole thickness, sole colour and tread, platform" : kind === "bag" ? "size, shape, handles and strap, flap, base" : kind === "belt" ? "width, length, buckle shape and size, tip, holes, keeper loop" : "length, neckline, sleeves, cuffs, waist, fit, lining, slits"}); closures and exactly where they are (zip side, elastic panels, buckles, laces, straps, bows); stitching, seams and panel lines; trims, hardware colour; anything distinctive; and what it does NOT have that someone might wrongly add.`,
    photos.slice(0, 4),
  );
  const list: string[] = Array.isArray(data?.spec) ? data.spec.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 14) : [];
  return list.map((line) => `- ${line.slice(0, 220)}`).join("\n");
}

export interface FidelityVerdict { score: number; issues: string[]; realism: number | null }

/**
 * Compares a generated picture (the LAST image) with the real product photos (all images before it).
 * Returns null when the check could not be run.
 */
export async function judgeFidelity(photos: Buffer[], candidate: Buffer, candidateIs: "still" | "video frames", colours: string[] = []): Promise<FidelityVerdict | null> {
  const many = colours.length > 1;
  const data = await visionJson(
    `You are the strict quality controller of an online fashion boutique. The first ${photos.length} image(s) are REAL photos of ${many ? `one model in ${colours.length} colours, one photo per colour (${colours.join(", ")})` : "a product"}. The LAST image is ${candidateIs === "still" ? "an AI-generated picture" : "a strip of frames taken from an AI-generated video"} that is supposed to show that same product. A customer will receive the real product, so any difference is a false advertisement.
${many ? `The generated picture must show exactly ${colours.length} pieces, one of each colour. Count them. Score 5 or less if a colour is missing, repeated, invented, or blended into another, or if any colour is hidden or cut off. Check each colour against its own photo.\n` : ""}Compare ONLY the product itself (ignore background, model, hands, lighting, pose and camera angle). Check: overall shape and proportions; exact colour; material and surface texture; toe shape, heel shape and height, sole thickness and tread; shaft height; closures (zips, elastic, buckles, straps, laces, bows) and their positions; stitching and panel lines; trims and hardware; anything added that the real product does not have; anything missing.${candidateIs === "video frames" ? " Also check that the product looks the same in every frame of the strip and never deforms." : ""}
Separately, judge REALISM of the whole picture: would a viewer believe it is real camera footage of a real person? Mark it down for waxy or over-smooth skin, wrong hands or fingers, impossible anatomy, a rendered or illustrated look, or objects that melt into each other.
Return JSON: {"score": <integer 0-10>, "realism": <integer 0-10>, "issues": ["short, concrete instruction to fix one difference or one unreal-looking thing", ...]}.
Scoring: 10 = indistinguishable product; 8-9 = same product, only tiny differences a customer would not notice; 6-7 = clearly the same style but a visible detail is wrong; 0-5 = a different product. Be strict. List at most 6 issues, most important first; an empty list only if the score is 10.`,
    [...photos.slice(0, many ? 6 : 4), candidate],
  );
  const score = Number(data?.score);
  if (!Number.isFinite(score)) return null;
  return {
    score: Math.max(0, Math.min(10, Math.round(score))),
    realism: Number.isFinite(Number(data?.realism)) ? Math.max(0, Math.min(10, Math.round(Number(data.realism)))) : null,
    issues: (Array.isArray(data?.issues) ? data.issues : []).map((x: unknown) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 6),
  };
}

/** The very last picture of a clip, used as the first frame of the part that follows it. */
export async function videoLastFrame(video: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inFile = path.join(dir, "in.mp4");
    const outFile = path.join(dir, "last.png");
    await fs.promises.writeFile(inFile, video);
    try {
      await ffmpeg(["-sseof", "-0.2", "-i", inFile, "-update", "1", "-frames:v", "1", "-y", outFile]);
    } catch {
      // Some clips have no readable frame that close to the end: step back a little further.
      await ffmpeg(["-sseof", "-1", "-i", inFile, "-update", "1", "-frames:v", "1", "-y", outFile]);
    }
    return fs.promises.readFile(outFile);
  });
}

/** Joins the parts of a long video into one clip (same size, no sound). */
export async function joinVideos(parts: Buffer[]): Promise<Buffer> {
  if (parts.length === 1) return parts[0];
  return withTempDir(async (dir) => {
    const args: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const file = path.join(dir, `part${i}.mp4`);
      await fs.promises.writeFile(file, parts[i]);
      args.push("-i", file);
    }
    const outFile = path.join(dir, "joined.mp4");
    // Every part is brought to the same 9:16 size and frame rate first, so they join cleanly.
    const prepared = parts.map((_, i) => `[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,format=yuv420p[v${i}]`).join(";");
    const joined = `${parts.map((_, i) => `[v${i}]`).join("")}concat=n=${parts.length}:v=1:a=0[v]`;
    await ffmpeg([...args, "-filter_complex", `${prepared};${joined}`, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-y", outFile]);
    return fs.promises.readFile(outFile);
  });
}

/** Four frames from across a clip, side by side, for the quality controller to look at. */
export async function videoFrameStrip(video: Buffer, seconds: number): Promise<Buffer | null> {
  try {
    return await withTempDir(async (dir) => {
      const inFile = path.join(dir, "in.mp4");
      const outFile = path.join(dir, "strip.jpg");
      await fs.promises.writeFile(inFile, video);
      const step = Math.max(0.5, (Math.max(2, seconds) - 0.4) / 4);
      await ffmpeg(["-i", inFile, "-vf", `fps=1/${step.toFixed(2)},scale=540:-2,tile=4x1`, "-frames:v", "1", "-q:v", "3", "-y", outFile]);
      return fs.promises.readFile(outFile);
    });
  } catch (err: any) {
    log("could not read frames for the quality check:", err?.message || err);
    return null;
  }
}

export type StudioScene = "studio" | "boutique";
export type StudioMode = "single" | "multi" | "colors";

const BOUTIQUE_FLOORS = [
  "a real light-grey polished concrete floor with subtle natural mottling, in soft window daylight",
  "a warm off-white honed stone floor with faint natural speckle, in soft window daylight",
  "a pale travertine floor with visible natural pores, in soft diffused daylight",
];

/**
 * Master prompt for an Instagram still built from one or several reference photos.
 * `refs` are in the same order as the attached images.
 */
export function buildInstagramImagePrompt(opts: {
  mode: StudioMode;
  refs: { productName: string; colorName?: string }[];
  isFootwear: boolean;
  scene: StudioScene;
  aspect: string;
  /** Where a headline is added afterwards; that part of the frame is kept calm. */
  textZone?: "top" | "bottom" | null;
}): string {
  const n = opts.refs.length;
  const list = opts.refs
    .map((ref, i) => `- Image ${i + 1}: "${ref.productName}"${ref.colorName ? ` — colour "${ref.colorName}"` : ""}`)
    .join("\n");

  const unit = opts.isFootwear ? (n <= 3 ? "pair of shoes" : "single shoe") : "piece";
  let task: string;
  if (opts.mode === "colors") {
    task = `The ${n} reference images show the SAME model in ${n} different colourways. Photograph all ${n} colourways together in ONE scene: exactly ${n} ${opts.isFootwear ? (n <= 3 ? "pairs" : "single shoes") : "pieces"}, one for each reference image, in the order of the images from left to right. Every ${unit} has the identical shape and design, and the exact colour of its own reference image. Do not invent a colourway, do not repeat one, do not leave one out, and do not blend colours between them.`;
  } else if (opts.mode === "multi") {
    task = `Photograph ALL ${n} products together in ONE scene: exactly ${n} products, one from each reference image, each reproduced exactly as its own reference shows it. Do not merge two designs into one, do not move a colour or a detail from one product to another, do not add any product that has no reference image, and do not leave any out.`;
  } else {
    task = `Re-photograph the product from the reference image as one premium Instagram photo. Show this one product only${opts.isFootwear ? " (the pair)" : ""}.`;
  }

  const presentation = opts.isFootwear
    ? `Footwear stands on the surface and is seen from a clear side profile, every shoe complete from toe to heel with its heel and sole visible, all pointing the same way. ${n > 1 ? "Evenly spaced, at the same scale, none hidden behind another and none touching." : ""} No feet, no legs, no person.`
    : `Each garment is shown from the front, complete, on a slim gold hanger or neatly laid, with its real drape. ${n > 1 ? "Evenly spaced, at the same scale, none covering another." : ""} No person.`;

  const scene =
    opts.scene === "boutique"
      ? `Real boutique setting: ${pickOne(BOUTIQUE_FLOORS)}. At most one soft, out-of-focus prop at the edge of the frame. Real texture, real contact shadows, never an empty 3D-render void.`
      : `Clean studio: plain, soft, solid ${pickOne(THEME_BACKGROUNDS)} backdrop and surface with only a very gentle gradient, soft diffused light from the front-left, a small soft natural shadow under every product. No props, no scenery.`;

  const textRule = opts.textZone
    ? `Leave the ${opts.textZone} 24% of the frame as calm, plain, uncluttered background with nothing in it: a headline is added there afterwards. Place the products in the rest of the frame.`
    : "Centre the products with comfortable empty background around them.";

  return `You are creating ONE photograph for the Instagram page of a women's fashion store. You are given ${n} reference photo${n > 1 ? "s" : ""}. Each one shows the EXACT physical item that will be shipped to a paying customer. Product accuracy is your HIGHEST PRIORITY — higher than aesthetics, higher than creativity.

Reference images, in order:
${list}

${FIDELITY_RULES}

═══════════════════════════════════════
✅ WHAT TO CREATE:
═══════════════════════════════════════
${task}
- Presentation: ${presentation}
- Scene: ${scene}
- Frame: ${opts.aspect} ${opts.aspect === "1:1" ? "square" : "vertical"} image. ${textRule} Nothing important within 6% of any edge.
- Do NOT draw any text, letter, number, price, logo, watermark, sticker or label anywhere in the image, other than what already exists on the products themselves.

═══════════════════════════════════════
${TECH_QUALITY}

FINAL REMINDER — the single most important rule: ${n > 1 ? `there are exactly ${n} products in the image, and each one` : "the product"} must be perfectly unchanged from its reference photo — shape, colour, heel height, garment length, materials and every decoration. Only the background, the light and the arrangement may change.`;
}

/* ───────────────────────────── Gemini image model ───────────────────────────── */

let imageConfigSupported = true;

/** Sends a prompt and reference photos to the image model and returns the picture it made. */
export async function generateStudioImage(prompt: string, references: Buffer[], aspect: string): Promise<Buffer> {
  const key = apiKey();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`;
  const parts: any[] = [{ text: prompt }];
  for (const reference of references) {
    parts.push({ inline_data: { mime_type: "image/jpeg", data: (await referenceJpeg(reference)).toString("base64") } });
  }

  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const generationConfig: any = { responseModalities: ["TEXT", "IMAGE"] };
    if (imageConfigSupported) generationConfig.imageConfig = { aspectRatio: aspect };
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts }], generationConfig }),
        signal: AbortSignal.timeout(180000),
      });
    } catch (networkErr: any) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(1500 * attempt);
        continue;
      }
      throw new Error(`Network error contacting Gemini: ${networkErr?.message || networkErr}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      // An older image model does not know the aspect setting: ask again without it. The picture
      // is fitted to the exact output size afterwards either way.
      if (res.status === 400 && imageConfigSupported && /imageConfig|aspectRatio|image_config|Unknown name/i.test(text)) {
        imageConfigSupported = false;
        log("image model rejected imageConfig; continuing without it");
        continue;
      }
      if (isBillingProblem(res.status, text)) throw noCreditError();
      const isRateLimit = res.status === 429 || /quota|rate limit/i.test(text);
      if ((isRateLimit || res.status >= 500) && attempt < MAX_ATTEMPTS) {
        const retryMatch = text.match(/retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i);
        await sleep(Math.min(retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 2500 * 2 ** (attempt - 1), 15000));
        continue;
      }
      throw new Error(
        isRateLimit
          ? "Gemini rate limit / quota reached. Wait a minute and try again."
          : `Gemini image generation failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const json: any = await res.json();
    const out: any[] = json?.candidates?.[0]?.content?.parts || [];
    const imagePart = out.find((p) => p.inlineData || p.inline_data);
    const inline = imagePart?.inlineData || imagePart?.inline_data;
    if (!inline?.data) {
      const textPart = out.find((p) => typeof p.text === "string")?.text;
      const finishReason = json?.candidates?.[0]?.finishReason;
      if (attempt < 2) continue; // an empty answer is often a one-off
      const blockReason = json?.promptFeedback?.blockReason;
      const err: any = new Error(
        textPart
          ? `Gemini did not return an image: ${textPart.slice(0, 200)}`
          : `Gemini did not return an image${finishReason || blockReason ? ` (${finishReason || blockReason})` : ""}.`,
      );
      // The model declined this picture (its own content rules, or it could not compose it).
      // The caller can ask again in a simpler way instead of failing the whole video.
      err.declined = true;
      throw err;
    }
    return Buffer.from(inline.data, "base64");
  }
  throw new Error("AI image generation failed after retries");
}

/* ───────────────────────────── Gemini Omni video model ───────────────────────────── */

// The output settings the API accepts differ between model versions. Each level asks for a
// little less; the first level that the API accepts is remembered for the following clips.
let videoFormatLevel = 0;

function videoResponseFormat(level: number, seconds: number, quality: StudioQuality): any | undefined {
  const resolution = quality === "high" ? "1080p" : "720p";
  if (level === 0) return { type: "video", aspect_ratio: "9:16", resolution, duration: `${seconds}s` };
  if (level === 1) return { type: "video", aspect_ratio: "9:16", resolution };
  if (level === 2) return { type: "video", aspect_ratio: "9:16" };
  return undefined;
}

/**
 * Animates one first frame into a vertical clip. The clip comes back as the model made it
 * (with its own length and sound); finishVideo() trims, crops and encodes it once.
 */
export async function generateStudioVideo(opts: {
  firstFrame: Buffer;
  prompt: string;
  seconds: number;
  quality: StudioQuality;
}): Promise<Buffer> {
  const key = apiKey();
  const frame = await sharp(opts.firstFrame, { failOn: "none" }).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
  const input = [
    { type: "image", data: frame.toString("base64"), mime_type: "image/jpeg" },
    { type: "text", text: opts.prompt },
  ];

  let lastError = "";
  // A setting the API refuses is dropped for this clip; the level is only remembered once a
  // clip has actually been made with it.
  let level = videoFormatLevel;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const response_format = videoResponseFormat(level, opts.seconds, opts.quality);
    let res: Response;
    try {
      res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: GEMINI_VIDEO_MODEL,
          input,
          ...(response_format ? { response_format } : {}),
          generation_config: { video_config: { task: "image_to_video" } },
          background: false,
          store: false,
          stream: false,
        }),
        signal: AbortSignal.timeout(14 * 60 * 1000),
      });
    } catch (networkErr: any) {
      // Never ask again after a dropped connection: the first request may still be running
      // (and billed) on Google's side, so a second one could be paid for twice.
      throw new Error(`The connection to Gemini was lost while the video was being made (${networkErr?.message || networkErr}). It was not sent again, to avoid paying twice. Try again in a few minutes.`);
    }

    const text = await res.text();
    if (!res.ok) {
      if (isBillingProblem(res.status, text)) throw noCreditError();
      const isRateLimit = res.status === 429 || /quota|rate limit/i.test(text);
      if (res.status === 400 && level < 3 && /response_format|aspect_ratio|resolution|duration|Unknown name/i.test(text)) {
        level++;
        log(`video model rejected an output setting; trying level ${level}:`, text.slice(0, 200));
        continue;
      }
      if (isRateLimit && attempt < 3) {
        await sleep(20000);
        continue;
      }
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
    if (video?.data || video?.uri) videoFormatLevel = level;
    if (video?.data) return Buffer.from(video.data, "base64");
    if (video?.uri) {
      const dl = await fetch(video.uri, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(180000) });
      if (!dl.ok) throw new Error(`Could not download the generated video (${dl.status}).`);
      return Buffer.from(await dl.arrayBuffer());
    }
    const said = contents.find((c) => typeof c?.text === "string")?.text;
    throw new Error(
      said
        ? `Gemini did not return a video: ${String(said).slice(0, 200)}`
        : `Gemini did not return a video${json?.status ? ` (status: ${json.status})` : ""}.`,
    );
  }
  throw new Error(lastError || "AI video generation failed after retries");
}

/* ───────────────────────────── ffmpeg ───────────────────────────── */

async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "lucerne-studio-"));
  try {
    return await work(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ffmpeg(args: string[]): Promise<void> {
  try {
    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { maxBuffer: 8 * 1024 * 1024 });
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new Error("ffmpeg is not installed on the server.");
    throw new Error(`Video processing failed: ${String(err?.stderr || err?.message || err).slice(-400)}`);
  }
}

/** Width and height of a video file, read from ffmpeg's own description of it. */
async function videoSize(file: string): Promise<{ width: number; height: number }> {
  let described = "";
  try {
    const { stderr } = await execFileAsync("ffmpeg", ["-hide_banner", "-i", file], { maxBuffer: 4 * 1024 * 1024 });
    described = stderr;
  } catch (err: any) {
    // ffmpeg exits with an error when no output file is named; the description is still printed.
    if (err?.code === "ENOENT") throw new Error("ffmpeg is not installed on the server.");
    described = String(err?.stderr || "");
  }
  const line = described.split("\n").find((l) => /Stream #.*Video:/.test(l)) || "";
  const match = line.match(/,\s*(\d{2,5})x(\d{2,5})[\s,\[]/);
  if (!match) throw new Error("Could not read the size of the video.");
  let width = Number(match[1]);
  let height = Number(match[2]);
  // A phone video stored sideways is shown turned by the player and by ffmpeg's output.
  if (/rotation of -?(90|270)/.test(described) || /rotate\s*:\s*(90|270)/.test(described)) [width, height] = [height, width];
  return { width, height };
}

/**
 * The single encode of a generated clip: cut to the output shape, set the exact size, trim to
 * the chosen length, remove the sound, optionally lay a text picture over it, and write a
 * high-quality, fast-starting H.264 file. Nothing encodes the clip again after this.
 */
export async function finishVideo(
  raw: Buffer,
  opts: { width: number; height: number; seconds: number; overlayPng?: Buffer | null },
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inFile = path.join(dir, "in.mp4");
    const outFile = path.join(dir, "out.mp4");
    await fs.promises.writeFile(inFile, raw);
    const { width, height } = opts;
    // Cover the output shape from the centre of the clip, then set the exact size.
    const shape = `crop='min(iw,ih*${width}/${height})':'min(ih,iw*${height}/${width})',scale=${width}:${height}:flags=lanczos,setsar=1`;
    const args = ["-i", inFile];
    let filter: string;
    if (opts.overlayPng) {
      const overlayFile = path.join(dir, "overlay.png");
      await fs.promises.writeFile(overlayFile, opts.overlayPng);
      args.push("-i", overlayFile);
      filter = `[0:v]${shape}[base];[base][1:v]overlay=0:0:format=auto,format=yuv420p[v]`;
    } else {
      filter = `[0:v]${shape},format=yuv420p[v]`;
    }
    args.push(
      "-filter_complex", filter,
      "-map", "[v]",
      "-t", String(opts.seconds),
      "-an",
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", "18",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y", outFile,
    );
    await ffmpeg(args);
    return fs.promises.readFile(outFile);
  });
}

/** Burns the Lucerne watermark into the centre of a video (same mark as the photo export). */
export async function watermarkVideo(input: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inFile = path.join(dir, "in.mp4");
    const markFile = path.join(dir, "mark.png");
    const outFile = path.join(dir, "out.mp4");
    await fs.promises.writeFile(inFile, input);
    const { width } = await videoSize(inFile);
    const markWidth = Math.max(120, Math.round(width * 0.4));
    await sharp(buildWatermarkSvg(markWidth)).png().toFile(markFile);
    await ffmpeg([
      "-i", inFile,
      "-i", markFile,
      "-filter_complex", "[0:v][1:v]overlay=(W-w)/2:(H-h)/2:format=auto,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p[v]",
      "-map", "[v]",
      "-map", "0:a?",
      "-c:a", "copy",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-y", outFile,
    ]);
    return fs.promises.readFile(outFile);
  });
}

/* ───────────────────────────── Exact text overlay ───────────────────────────── */

// The brand's Arabic typeface. It is fetched once and kept on disk; when the server cannot
// reach it, the text is drawn with the server's own font instead.
const FONT_SOURCES = [
  "https://github.com/google/fonts/raw/main/ofl/tajawal/Tajawal-Bold.ttf",
  "https://raw.githubusercontent.com/google/fonts/main/ofl/tajawal/Tajawal-Bold.ttf",
];
let fontPromise: Promise<{ file?: string; name: string }> | null = null;
let fontRetryAfter = 0;

function looksLikeFont(buffer: Buffer): boolean {
  if (buffer.length < 20000) return false;
  const tag = buffer.subarray(0, 4).toString("latin1");
  return tag === "\u0000\u0001\u0000\u0000" || tag === "OTTO" || tag === "true";
}

async function studioFont(): Promise<{ file?: string; name: string }> {
  const custom = process.env.STUDIO_FONT_FILE;
  if (custom && fs.existsSync(custom)) return { file: custom, name: process.env.STUDIO_FONT_NAME || "sans bold" };
  if (!fontPromise && Date.now() < fontRetryAfter) return { name: "sans bold" };
  if (!fontPromise) {
    fontPromise = (async () => {
      const dir = path.join(uploadsDir, ".studio-fonts");
      const file = path.join(dir, "Tajawal-Bold.ttf");
      try {
        if (fs.existsSync(file) && looksLikeFont(await fs.promises.readFile(file))) return { file, name: "Tajawal Bold" };
        for (const source of FONT_SOURCES) {
          try {
            const res = await fetch(source, { signal: AbortSignal.timeout(20000) });
            if (!res.ok) continue;
            const buffer = Buffer.from(await res.arrayBuffer());
            if (!looksLikeFont(buffer)) continue;
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(file, buffer);
            return { file, name: "Tajawal Bold" };
          } catch {
            /* try the next address */
          }
        }
      } catch {
        /* fall through to the server font */
      }
      log("brand font unavailable; using the server font for text overlays");
      // Tried again after a while, not on every single text.
      fontPromise = null;
      fontRetryAfter = Date.now() + 15 * 60 * 1000;
      return { name: "sans bold" };
    })();
  }
  return fontPromise;
}

function escapeMarkup(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function textPicture(text: string, colour: string, boxWidth: number, boxHeight: number): Promise<{ data: Buffer; width: number; height: number }> {
  const font = await studioFont();
  const out = await sharp({
    text: {
      text: `<span foreground="${colour}">${escapeMarkup(text)}</span>`,
      font: font.name,
      ...(font.file ? { fontfile: font.file } : {}),
      width: boxWidth,
      height: boxHeight,
      align: "centre",
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

export interface StudioText {
  headline?: string;
  subline?: string;
  position?: "top" | "bottom";
  /** "auto" reads the picture behind the text and picks the readable one. */
  tone?: "auto" | "light" | "dark";
}

export function hasText(text?: StudioText | null): boolean {
  return !!(text && (String(text.headline || "").trim() || String(text.subline || "").trim()));
}

/**
 * Draws the headline and the smaller line as a transparent picture of the full frame size.
 * The words are drawn by the server from the exact characters typed by the admin, so a price
 * or an Arabic word can never come out misspelled.
 */
export async function renderTextOverlay(
  text: StudioText,
  width: number,
  height: number,
  /** The picture the text will sit on; used to choose white or dark text. */
  behind?: Buffer,
): Promise<Buffer | null> {
  const headline = String(text.headline || "").trim().slice(0, 80);
  const subline = String(text.subline || "").trim().slice(0, 120);
  if (!headline && !subline) return null;

  const vertical = height / width > 1.5; // reels and stories: Instagram covers the top and the bottom
  const position = text.position === "bottom" ? "bottom" : "top";
  const zoneTop = position === "top" ? Math.round(height * (vertical ? 0.1 : 0.05)) : Math.round(height * (vertical ? 0.64 : 0.77));
  const zoneHeight = Math.round(height * (vertical ? 0.15 : 0.18));

  let tone = text.tone === "light" || text.tone === "dark" ? text.tone : "auto";
  if (tone === "auto") {
    tone = "light";
    if (behind) {
      try {
        const stats = await sharp(behind, { failOn: "none" })
          .resize(width, height, { fit: "fill" })
          .extract({ left: Math.round(width * 0.1), top: zoneTop, width: Math.round(width * 0.8), height: zoneHeight })
          .greyscale()
          .stats();
        tone = stats.channels[0].mean > 150 ? "dark" : "light";
      } catch {
        /* keep white text */
      }
    }
  }
  const ink = tone === "dark" ? "#1f1a1c" : "#ffffff";
  const halo = tone === "dark" ? "#ffffff" : "#000000";

  const boxWidth = Math.round(width * 0.84);
  const lines: { main: Buffer; shade: Buffer; width: number; height: number }[] = [];
  for (const [value, share] of [[headline, 0.62], [subline, 0.34]] as [string, number][]) {
    if (!value) continue;
    const boxHeight = Math.round(zoneHeight * (headline && subline ? share : 0.7));
    const main = await textPicture(value, ink, boxWidth, boxHeight);
    const shade = await textPicture(value, halo, boxWidth, boxHeight);
    lines.push({ main: main.data, shade: shade.data, width: main.width, height: main.height });
  }

  const gap = Math.round(zoneHeight * 0.08);
  const blockHeight = lines.reduce((sum, line) => sum + line.height, 0) + gap * (lines.length - 1);
  let y = zoneTop + Math.max(0, Math.round((zoneHeight - blockHeight) / 2));
  const shades: sharp.OverlayOptions[] = [];
  const mains: sharp.OverlayOptions[] = [];
  for (const line of lines) {
    const left = Math.round((width - line.width) / 2);
    shades.push({ input: line.shade, left, top: y });
    mains.push({ input: line.main, left, top: y });
    y += line.height + gap;
  }

  const blank = { create: { width, height, channels: 4 as const, background: { r: 0, g: 0, b: 0, alpha: 0 } } };
  // A soft halo of the opposite colour keeps the words readable on any picture.
  const haloLayer = await sharp(blank).composite(shades).png().toBuffer();
  const softHalo = await sharp(haloLayer)
    .blur(Math.max(2, width / 180))
    .ensureAlpha()
    .linear([1, 1, 1, tone === "dark" ? 0.85 : 0.6], [0, 0, 0, 0])
    .png()
    .toBuffer();
  return sharp(blank)
    .composite([{ input: softHalo }, { input: softHalo }, ...mains])
    .png()
    .toBuffer();
}

/** Lays a text picture over a still and returns a high-quality JPEG. */
export async function composeStill(picture: Buffer, overlayPng?: Buffer | null): Promise<Buffer> {
  let pipeline = sharp(picture, { failOn: "none" }).flatten({ background: "#ffffff" });
  if (overlayPng) pipeline = pipeline.composite([{ input: overlayPng }]);
  return pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true }).toBuffer();
}
