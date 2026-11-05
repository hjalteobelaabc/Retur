import { CHAT_PROMPT, callClaude, rateLimited, send } from "./_claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "bad_request" });
  if (rateLimited(req, 20)) return send(res, 429, { error: "rate_limited" });

  const { messages, data } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return send(res, 400, { error: "bad_request" });

  // Kun de seneste 10 beskeder, kun user/assistant, højst 2.000 tegn pr. besked.
  const turns = messages.slice(-10)
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return send(res, 400, { error: "bad_request" });

  const dataText = JSON.stringify(data ?? {}).slice(0, 30_000);
  const out = await callClaude({
    system: `${CHAT_PROMPT}\n\n<data>\n${dataText}\n</data>`,
    maxTokens: 500,
    messages: turns,
  });
  if (out.error) return send(res, out.status, { error: out.error });
  return send(res, 200, { text: out.text });
}
