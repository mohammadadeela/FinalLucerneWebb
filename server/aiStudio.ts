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

export type VideoStyle = "photo" | "tryOn" | "hands" | "unbox";

const REEL_SET =
  "a bright, minimal fashion studio: smooth light-grey polished concrete floor, plain pale walls, tall industrial windows softly out of focus in the background, soft natural daylight from the side, no clutter. Shot on a phone-style 26mm lens at knee height, shallow depth of field, like a premium shoe boutique's Instagram reel";

/** Prompt for the opening frame of a styled video. The attached photos are the same product; a logo image may follow them. */
export function buildStyleFramePrompt(opts: { style: Exclude<VideoStyle, "photo">; isFootwear: boolean; photoCount: number; hasLogo: boolean; spec?: string; fixes?: string[] }): string {
  const scene: Record<Exclude<VideoStyle, "photo">, string> = {
    tryOn: opts.isFootwear
      ? "A woman is WEARING the pair. Frame from just below the knee down to the floor: bare legs or sheer tights only as far as the product allows, feet standing naturally on the floor, one foot slightly forward and angled so the side profile of the shoe from the photo is clearly visible. No face, no upper body."
      : "A woman is WEARING the garment, standing relaxed. Frame from the chin or shoulders down to the knees or the hem, so the whole garment is visible. Her face is never in the frame. Plain, neutral underlayers and shoes that do not draw attention.",
    hands: opts.isFootwear
      ? "A woman's hands with neat natural nails hold ONE shoe of the pair gently by the heel and the toe, a little above the floor, showing the same side as the photo. The other shoe of the pair stands on the floor just behind it, slightly out of focus. No face, no body beyond the forearms."
      : "A woman's hands with neat natural nails hold the garment up on a slim wooden hanger in front of the studio, the garment hanging straight and fully visible. No face, no body beyond the forearms.",
    unbox: `Top-down view of the floor. An open ${opts.isFootwear ? "shoe box" : "gift box"} in soft blush pink lies on the floor with white tissue paper inside. The product rests in the tissue paper, fully visible. The box lid lies beside it, face up${opts.hasLogo ? ", printed with the logo from the LAST attached image, copied exactly: the butterfly mark with the words LUCERNE BOUTIQUE below it, flat and centred on the lid, spelled exactly like that" : ", completely plain with no print"}. A woman's hands rest on the edges of the box, about to lift the product out.`,
  };
  return `You are re-shooting a REAL product for an online boutique. The first ${opts.photoCount > 1 ? `${opts.photoCount} attached images are photos of the SAME physical product from different sides` : "attached image is a photo of the product"}. It will be shipped to paying customers exactly as shown. Product accuracy is your HIGHEST PRIORITY — higher than styling, higher than aesthetics.

${FIDELITY_RULES}

═══════════════════════════════════════
📸 THE NEW SHOT:
═══════════════════════════════════════
- Scene: ${REEL_SET}.
- ${scene[opts.style]}
- The product is reproduced EXACTLY from the photos: same shape, proportions, colour, material and texture, same stitching, sole, heel, hardware, zips, straps and trims, in the same places. Use every attached product photo to get each side right. Do not simplify, restyle or "improve" anything. Do not add any detail the photos do not show.
- The product is the hero: sharp, well lit, fully inside the central part of the frame, with clear space above and below it.
- Skin, hands and legs look real and natural, never retouched or plastic.
- No text anywhere${opts.style === "unbox" && opts.hasLogo ? " except the logo on the box lid" : ""}. No other brand names, no price tags, no watermarks, no captions.
- Vertical 9:16 frame.
${opts.spec ? `\n═══════════════════════════════════════\n📋 PRODUCT SPEC — written from the real photos. Every point must be true in your image:\n═══════════════════════════════════════\n${opts.spec}\n` : ""}${opts.fixes?.length ? `\n⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED by quality control because the product did not match the photos. Fix exactly these points this time:\n${opts.fixes.map((f) => `- ${f}`).join("\n")}\n` : ""}
${TECH_QUALITY}`;
}

/** Prompt that animates the opening frame made by buildStyleFramePrompt. */
export function buildStyleVideoPrompt(opts: { style: Exclude<VideoStyle, "photo">; isFootwear: boolean; seconds: number; spec?: string }): string {
  const action: Record<Exclude<VideoStyle, "photo">, string> = {
    tryOn: opts.isFootwear
      ? "She shifts her weight, lifts the front foot slightly and turns it a little left and right to show the shoe, then sets it down again and takes one small step in place. Her hand may come down once to smooth or adjust the top of the shoe."
      : "She shifts her weight gently, smooths the fabric once with one hand and makes a small quarter turn and back, so the fabric moves naturally.",
    hands: opts.isFootwear
      ? "The hands slowly tilt the shoe a few degrees toward the camera and back, one thumb gently pressing the material to show its softness, then lower it toward the floor next to the other shoe."
      : "The hands gently sway the hanger a few degrees and one hand runs lightly down the fabric to show how it falls.",
    unbox: "The hands fold the tissue paper aside, lift the product slowly out of the box and hold it just above the box for the camera. The lid with its logo stays where it is, flat and unchanged.",
  };
  return `You are animating the attached image, which is the FIRST FRAME of a short product video for an online boutique. The product in it is a REAL item that will be shipped to paying customers. Product accuracy is your HIGHEST PRIORITY — higher than motion, higher than aesthetics.

═══════════════════════════════════════
🎬 VIDEO RULES:
═══════════════════════════════════════
- The product must look identical in every frame to how it looks in the first frame: same shape, colour, material, stitching, sole, heel, hardware and trims. It never morphs, flickers, melts, stretches, changes colour, or gains or loses a detail. It keeps its real stiffness: leather and soles do not bend like cloth.
- Movement: ${action[opts.style]} All movement is slow, small and natural, like real phone footage in a boutique.
- Do not turn the product far enough to reveal a side that is not visible in the first frame.
- Hands always have five natural fingers. No face ever enters the frame.
- The camera is handheld but very steady, with at most a slight slow push-in. Same room, same light, same floor from start to end. Nothing new enters the scene.
- Any logo or lettering visible in the first frame stays exactly as it is, sharp and unchanged. No new text, captions, stickers or graphics appear.
- ONE continuous shot of about ${opts.seconds} seconds. No cuts, no transitions, no speed changes.
- Keep the product inside the central area of the frame at all times; the top and bottom edges are cut away later.
- Look: real camera footage with natural colour. Never a 3D render, never a glow or beauty filter.
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
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
    const data: any = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts || []).filter((p: any) => typeof p?.text === "string" && !p.thought).map((p: any) => p.text).join("");
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch (err: any) {
    // Quality control is a safety net; if it is unavailable the video is still made.
    log("quality check unavailable:", err?.message || err);
    return null;
  }
}

/** A short, exact written description of the product, taken only from its real photos. */
export async function describeProduct(photos: Buffer[], isFootwear: boolean): Promise<string> {
  const data = await visionJson(
    `These ${photos.length} image(s) show ONE real ${isFootwear ? "pair of shoes" : "fashion item"} sold by a boutique. Write its exact visual specification so that an artist who cannot see the photos could not get any detail wrong. Only state what is clearly visible; never guess.
Return JSON: {"spec": ["...", "..."]} with 8 to 14 short bullet strings covering, where visible: item type; exact colour(s) in plain words and where each colour sits; material and surface (smooth, grained, suede, patent, knit, mesh...) and how shiny; overall silhouette and height (${isFootwear ? "ankle / mid-calf / knee-high shaft, toe shape, heel type, heel height and heel shape, sole thickness, sole colour and tread, platform" : "length, neckline, sleeves, waist, fit"}); closures and exactly where they are (zip side, elastic panels, buckles, laces, straps, bows); stitching, seams and panel lines; trims, hardware colour; anything distinctive; and what it does NOT have that someone might wrongly add.`,
    photos.slice(0, 4),
  );
  const list: string[] = Array.isArray(data?.spec) ? data.spec.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 14) : [];
  return list.map((line) => `- ${line.slice(0, 220)}`).join("\n");
}

export interface FidelityVerdict { score: number; issues: string[] }

/**
 * Compares a generated picture (the LAST image) with the real product photos (all images before it).
 * Returns null when the check could not be run.
 */
export async function judgeFidelity(photos: Buffer[], candidate: Buffer, candidateIs: "still" | "video frames"): Promise<FidelityVerdict | null> {
  const data = await visionJson(
    `You are the strict quality controller of an online fashion boutique. The first ${photos.length} image(s) are REAL photos of a product. The LAST image is ${candidateIs === "still" ? "an AI-generated picture" : "a strip of frames taken from an AI-generated video"} that is supposed to show that same product. A customer will receive the real product, so any difference is a false advertisement.
Compare ONLY the product itself (ignore background, model, hands, lighting, pose and camera angle). Check: overall shape and proportions; exact colour; material and surface texture; toe shape, heel shape and height, sole thickness and tread; shaft height; closures (zips, elastic, buckles, straps, laces, bows) and their positions; stitching and panel lines; trims and hardware; anything added that the real product does not have; anything missing.${candidateIs === "video frames" ? " Also check that the product looks the same in every frame of the strip and never deforms." : ""}
Return JSON: {"score": <integer 0-10>, "issues": ["short, concrete instruction to fix one difference", ...]}.
Scoring: 10 = indistinguishable product; 8-9 = same product, only tiny differences a customer would not notice; 6-7 = clearly the same style but a visible detail is wrong; 0-5 = a different product. Be strict. List at most 6 issues, most important first; an empty list only if the score is 10.`,
    [...photos.slice(0, 4), candidate],
  );
  const score = Number(data?.score);
  if (!Number.isFinite(score)) return null;
  return {
    score: Math.max(0, Math.min(10, Math.round(score))),
    issues: (Array.isArray(data?.issues) ? data.issues : []).map((x: unknown) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 6),
  };
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
      throw new Error(
        textPart
          ? `Gemini did not return an image: ${textPart.slice(0, 200)}`
          : `Gemini did not return an image${finishReason ? ` (${finishReason})` : ""}.`,
      );
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
      lastError = `Network error contacting Gemini: ${networkErr?.message || networkErr}`;
      if (attempt >= 2) break;
      await sleep(4000);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
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
