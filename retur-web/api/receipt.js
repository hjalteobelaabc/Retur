import { RECEIPT_PROMPT, callClaude, parseJson, rateLimited, send } from "./_claude.js";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "bad_request" });
  if (rateLimited(req, 10)) return send(res, 429, { error: "rate_limited" });

  const { image, mediaType = "image/jpeg", today } = req.body || {};
  if (typeof image !== "string" || !image || !TYPES.includes(mediaType)) return send(res, 400, { error: "bad_request" });
  if (image.length > 4_000_000) return send(res, 413, { error: "too_large" });
  const dateLine = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? `Dagens dato er ${today}.` : "";

  const out = await callClaude({
    system: RECEIPT_PROMPT,
    maxTokens: 300,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
        { type: "text", text: `Aflæs denne kvittering. ${dateLine}` },
      ],
    }],
  });
  if (out.error) return send(res, out.status, { error: out.error });

  const r = parseJson(out.text);
  if (!r || typeof r !== "object") return send(res, 422, { error: "invalid_json" });
  return send(res, 200, r);
}
