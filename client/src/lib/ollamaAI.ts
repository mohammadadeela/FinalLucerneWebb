// Ollama client — talks ONLY to our own backend proxy (/api/ollama/*), never to
// Ollama directly. The backend forwards to local Ollama or a Cloudflare Tunnel
// URL, which removes the browser CORS / mixed-content problem entirely.

const LS_MODEL = "ollama_model";
const LS_ENABLED = "ollama_enabled";

export const OLLAMA_DEFAULTS = {
  model: "llava",
};

const AI_PROMPT_BASE = `You are a fashion product expert for a women's boutique. Analyze this clothing/fashion image and return a JSON object with ONLY these fields. EVERY text field MUST be written in ARABIC only — no English words — EXCEPT the "styleKey" field which MUST be in English:
- name: short product name in Arabic (max 5 words, e.g. "فستان ميدي بالزهور")
- nameAr: same Arabic product name
- description: 2-sentence compelling product description in Arabic
- descriptionAr: same Arabic description
- colors: array with EXACTLY ONE hex color code — the single MAIN/DOMINANT fabric color of the garment (e.g. ["#2c3e50"]). IGNORE every secondary color: beads, sequins, crystals, rhinestones, embroidery, trim, lace, buttons, zippers, prints, patterns, logos, belts and any accent. Only the main body color counts. Never return more than one color.
- colorNames: array with EXACTLY ONE Arabic color name matching the single color above (e.g. ["كحلي"])
- styleKey: a short ENGLISH description of the garment's STRUCTURAL design that stays the SAME no matter the color — include the garment type, cut/silhouette, sleeve, neckline, length and any distinctive structural detail, but NEVER mention any color (e.g. "long sleeve ribbed bodycon midi dress mock neck"). This is used to detect the same product in different colors, so be precise and consistent.
- suggestedPrice: a realistic retail price number in ILS/NIS (just the number)

IMPORTANT — FOOTWEAR NAMING RULE (heels/sandals/shoes only):
When naming footwear, whether it is "مفتوح" (open) or "مسكر" (closed) is decided ONLY by the TOE, never by the back/heel strap:
- If the toes are covered and enclosed (pointed toe, round toe, almond toe, etc.) → it is "مسكر" (closed), e.g. "كعب مسكر" or "صندل مسكر" — even if the back has an open sling-back strap, an open heel counter, or no back at all.
- If the toes are visible/exposed (peep-toe, open-toe sandal) → it is "مفتوح" (open), e.g. "كعب مفتوح" or "صندل مفتوح".
Never call a shoe "مفتوح" just because the back/heel area is strappy or open — check the toe box only.

Respond ONLY with valid JSON, no markdown, no extra text.`;

const AI_PROMPT_MULTI_COLOR_ADDENDUM = `

IMPORTANT ADDITIONAL RULES — this product comes in MULTIPLE COLORS (different images of the same product):
- NEVER include any color in the "name" field — the name must describe only the product type/style (correct: "فستان ميدي", wrong: "فستان ميدي أسود")
- NEVER mention any color in the "description" field — describe only the style, fabric and features (colors will be appended automatically)
- In the "colors" field: return the main color of THIS specific image
- In the "colorNames" field: return the Arabic color name for THIS specific image`;

export const AI_PROMPT = AI_PROMPT_BASE;

export function getAIPrompt(isMultiColor: boolean): string {
  return isMultiColor ? AI_PROMPT_BASE + AI_PROMPT_MULTI_COLOR_ADDENDUM : AI_PROMPT_BASE;
}

export interface OllamaConfig {
  model: string;
  enabled: boolean;
}

export function getOllamaConfig(): OllamaConfig {
  const storedEnabled = localStorage.getItem(LS_ENABLED);
  return {
    model: localStorage.getItem(LS_MODEL) || OLLAMA_DEFAULTS.model,
    // Default to Ollama unless the user explicitly turned it off.
    enabled: storedEnabled === null ? true : storedEnabled === "true",
  };
}

export function saveOllamaConfig(cfg: Partial<OllamaConfig>) {
  if (cfg.model !== undefined) localStorage.setItem(LS_MODEL, cfg.model);
  if (cfg.enabled !== undefined) localStorage.setItem(LS_ENABLED, String(cfg.enabled));
}

// ── Server-side Ollama URL config ───────────────────────────────────────────
export async function getOllamaUrl(): Promise<{ url: string; isCustom: boolean }> {
  const res = await fetch("/api/ollama/url");
  if (!res.ok) throw new Error("Failed to load the Ollama URL");
  return res.json();
}

export async function saveOllamaUrl(url: string): Promise<{ url: string }> {
  const res = await fetch("/api/ollama/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Failed to save the URL");
  return json;
}

// ── Health / diagnostics ─────────────────────────────────────────────────────
export interface OllamaHealth {
  reachable: boolean;
  modelCount: number;
  models: string[];
  tunnelUrl: string;
  error: string | null;
  /** HTTP status of our proxy endpoint. */
  status?: number;
  /** HTTP status returned by Ollama itself (null if we never reached it). */
  upstreamStatus?: number | null;
}

export async function checkOllamaHealth(): Promise<OllamaHealth> {
  try {
    const res = await fetch("/api/ollama/health");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        reachable: false,
        modelCount: 0,
        models: [],
        tunnelUrl: json.tunnelUrl || "",
        error: json.message || `Server error ${res.status}`,
        status: res.status,
      };
    }
    return { ...json, status: res.status };
  } catch (err: any) {
    return {
      reachable: false,
      modelCount: 0,
      models: [],
      tunnelUrl: "",
      error: err?.message || "Could not reach the server",
    };
  }
}

async function imageUrlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mimeType };
}

export interface OllamaResult {
  url: string;
  success: boolean;
  data?: {
    name: string;
    nameAr: string;
    description: string;
    descriptionAr: string;
    colors: string[];
    colorNames?: string[];
    styleKey?: string;
    suggestedPrice: number;
  };
  error?: string;
}

export async function generateWithOllama(
  imageUrls: string[],
  model: string,
  isMultiColor = false,
): Promise<OllamaResult[]> {
  const prompt = getAIPrompt(isMultiColor);
  return Promise.all(
    imageUrls.map(async (url): Promise<OllamaResult> => {
      try {
        const { base64, mimeType } = await imageUrlToBase64(url);
        const dataUrl = `data:${mimeType};base64,${base64}`;

        // Goes to OUR backend (same origin → no CORS); the server forwards it.
        const res = await fetch("/api/ollama/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              },
            ],
          }),
        });

        const text = await res.text();
        let json: any = {};
        try {
          json = text ? JSON.parse(text) : {};
        } catch {
          throw new Error(`Unexpected response from server: ${text.slice(0, 120)}`);
        }
        if (!res.ok) throw new Error(json.message || `Ollama proxy error ${res.status}`);

        const content: string = json.choices?.[0]?.message?.content || "{}";
        const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return { url, success: true, data: parsed };
      } catch (err: any) {
        return { url, success: false, error: err?.message || "Ollama generation failed" };
      }
    }),
  );
}
