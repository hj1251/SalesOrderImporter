import { DEFAULT_COLUMNS, type ParsedTable } from "../shared/schema.js";

/**
 * LLM logic for the PO -> XLSM app.
 *
 * IMPORTANT: This module calls the OpenAI and Anthropic public APIs DIRECTLY
 * via fetch using the END USER's own API token. It does NOT use the Perplexity
 * LLM proxy or any platform credentials, so it ports cleanly to Vercel.
 */

export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
export const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-latest";
export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

/** Build the base system prompt, then append the user's custom context. */
export function buildSystemPrompt(systemContext?: string): string {
  const base = `You are a precise data-extraction engine for purchase orders in a procurement/logistics workflow.

You receive messy, unstructured order data that a customer pasted (copied from a spreadsheet, email, or image OCR), optionally followed by English instructions.

Your job: convert it into STRUCTURED tabular rows matching a spreadsheet template.

Output STRICT JSON ONLY. No prose, no explanations, no markdown code fences. The JSON must have exactly this shape:
{
  "columns": ["PO Number - Customer Reference", "SKU", "QTY", "Unit Cost", "..."],
  "rows": [
    { "PO Number - Customer Reference": "...", "SKU": "...", "QTY": 5, "Unit Cost": 12.5, "...": "..." }
  ]
}

Rules:
- Default columns (use these in this exact order unless instructions clearly call for different/extra columns):
${DEFAULT_COLUMNS.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}
- The customer's data may use different labels, wording, or ordering. Map intelligently to the columns above.
- Produce ONE row per line item / SKU. Repeat shared fields (PO number, delivery name/address, telephone) across rows for the same order.
- Leave unknown fields as empty string "".
- QTY and Unit Cost should be numeric (numbers, not strings) where possible. Unit Cost is per-unit price excluding currency symbols.
- Every object in "rows" must include a key for every entry in "columns".
- If the instructions ask for additional or different columns, adapt the "columns" array accordingly while still returning one row per line item.`;

  const extra = (systemContext || "").trim();
  return extra ? `${base}\n\nAdditional company-specific instructions:\n${extra}` : base;
}

/** Strip markdown code fences and isolate the JSON object from a model reply. */
function extractJson(text: string): string {
  let t = text.trim();
  // Remove ```json ... ``` or ``` ... ``` fences.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // Fall back to the first { ... last }.
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

/** Validate and normalize the parsed object into a ParsedTable. */
function normalizeTable(parsed: any): ParsedTable {
  let columns: string[] = Array.isArray(parsed?.columns)
    ? parsed.columns.map((c: any) => String(c))
    : [];
  if (columns.length === 0) columns = [...DEFAULT_COLUMNS];

  const rawRows: any[] = Array.isArray(parsed?.rows) ? parsed.rows : [];
  const rows = rawRows.map((r) => {
    const out: Record<string, string | number> = {};
    for (const col of columns) {
      const v = r?.[col];
      if (v === undefined || v === null) out[col] = "";
      else if (typeof v === "number") out[col] = v;
      else out[col] = String(v);
    }
    return out;
  });

  return { columns, rows };
}

/** Build the user message content combining pasted data + instructions. */
function buildUserMessage(input: string, instructions?: string): string {
  const instr = (instructions || "").trim();
  let msg = `ORDER DATA (raw, may be messy):\n${input.trim()}`;
  if (instr) msg += `\n\nENGLISH INSTRUCTIONS:\n${instr}`;
  msg += `\n\nReturn the structured JSON now.`;
  return msg;
}

/** Call OpenAI Chat Completions API directly. */
export async function callOpenAI(
  token: string,
  model: string,
  systemPrompt: string,
  userInput: string,
  instructions?: string,
): Promise<ParsedTable> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_OPENAI_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildUserMessage(userInput, instructions) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("OpenAI returned an empty response");
  const parsed = JSON.parse(extractJson(content));
  return normalizeTable(parsed);
}

/** Call Anthropic Messages API directly. */
export async function callAnthropic(
  token: string,
  model: string,
  systemPrompt: string,
  userInput: string,
  instructions?: string,
): Promise<ParsedTable> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: `${systemPrompt}\n\nRespond with ONLY the JSON object. Do not wrap it in markdown code fences.`,
      messages: [
        { role: "user", content: buildUserMessage(userInput, instructions) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const content: string = Array.isArray(data?.content)
    ? data.content.map((b: any) => b?.text ?? "").join("")
    : "";
  if (!content) throw new Error("Anthropic returned an empty response");
  const parsed = JSON.parse(extractJson(content));
  return normalizeTable(parsed);
}

/** Call Google Gemini API directly. */
export async function callGemini(
  token: string,
  model: string,
  systemPrompt: string,
  userInput: string,
  instructions?: string,
): Promise<ParsedTable> {
  const m = model || DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${systemPrompt}\n\nRespond with ONLY the JSON object. Do not wrap it in markdown code fences.` }],
      },
      contents: [
        { role: "user", parts: [{ text: buildUserMessage(userInput, instructions) }] },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const content: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!content) throw new Error("Gemini returned an empty response");
  const parsed = JSON.parse(extractJson(content));
  return normalizeTable(parsed);
}

/**
 * Demo / fallback parser. Used when no real token is configured so the full
 * generate -> download -> preview flow can be QA'd WITHOUT a real API key.
 *
 * Heuristic: split the pasted text into lines, and for each non-empty line try
 * to pull out a SKU-like token, a quantity, and a price. Shared header-ish
 * fields (PO number, delivery info) are detected from labeled lines and
 * repeated across every line-item row. Deterministic output.
 */
export function demoParse(input: string, instructions?: string): ParsedTable {
  const columns = [...DEFAULT_COLUMNS];
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Shared / header fields detected from "Label: value" style lines.
  const shared: Record<string, string> = {};
  const labelMap: Record<string, string> = {
    po: "PO Number - Customer Reference",
    "po number": "PO Number - Customer Reference",
    "purchase order": "PO Number - Customer Reference",
    reference: "PO Number - Customer Reference",
    ref: "PO Number - Customer Reference",
    name: "Delivery Name",
    "delivery name": "Delivery Name",
    customer: "Delivery Name",
    company: "Delivery Name",
    address: "Delivery Address 1",
    "address 1": "Delivery Address 1",
    "address line 1": "Delivery Address 1",
    "address 2": "Delivery Address 2",
    "address line 2": "Delivery Address 2",
    city: "Delivery City",
    town: "Delivery City",
    county: "Delivery County",
    state: "Delivery County",
    postcode: "Delivery Postcode",
    "post code": "Delivery Postcode",
    zip: "Delivery Postcode",
    "zip code": "Delivery Postcode",
    country: "Delivery Country",
    telephone: "Telephone",
    phone: "Telephone",
    tel: "Telephone",
    mobile: "Telephone",
  };

  const itemLines: string[] = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 /._-]{0,30}?)\s*[:=]\s*(.+)$/);
    if (m) {
      const key = m[1].trim().toLowerCase();
      const val = m[2].trim();
      const mapped = labelMap[key];
      if (mapped) {
        shared[mapped] = val;
        continue;
      }
    }
    itemLines.push(line);
  }

  // Parse each remaining line as a line item.
  const rows: Record<string, string | number>[] = [];
  for (const line of itemLines) {
    // Find a price (currency-prefixed or decimal number).
    const priceMatch = line.match(/(?:[£$€]\s?)(\d+(?:\.\d+)?)|(\d+\.\d{1,2})\b/);
    const price = priceMatch ? parseFloat(priceMatch[1] ?? priceMatch[2]) : "";

    // Find a quantity: "x5", "qty 5", "5 x", or a standalone small integer.
    let qty: number | "" = "";
    const qtyMatch =
      line.match(/(?:qty|quantity)\s*[:=]?\s*(\d+)/i) ||
      line.match(/\b(\d+)\s*x\b/i) ||
      line.match(/\bx\s*(\d+)(?!\.\d)\b/i) ||
      line.match(/\b(\d{1,4})\s*(?:pcs|units|ea|off)\b/i);
    if (qtyMatch) qty = parseInt(qtyMatch[1], 10);

    // SKU: a token with letters+digits/hyphen, otherwise first word.
    const skuMatch =
      line.match(/\b([A-Z0-9]{2,}(?:[-/][A-Z0-9]+)+)\b/i) ||
      line.match(/\b([A-Z]{2,}\d{2,})\b/i);
    const sku = skuMatch ? skuMatch[1] : line.split(/\s+/)[0];

    const row: Record<string, string | number> = {};
    for (const col of columns) row[col] = shared[col] ?? "";
    row["SKU"] = sku;
    row["QTY"] = qty;
    row["Unit Cost"] = price;
    rows.push(row);
  }

  // If nothing parsed as an item, emit a single sample row so QA still works.
  if (rows.length === 0) {
    const row: Record<string, string | number> = {};
    for (const col of columns) row[col] = shared[col] ?? "";
    row["SKU"] = "SAMPLE-001";
    row["QTY"] = 1;
    row["Unit Cost"] = 0;
    rows.push(row);
  }

  return { columns, rows };
}

/** Dispatch to the correct provider. */
export async function parseOrder(opts: {
  provider: string;
  token: string;
  model: string;
  systemContext: string;
  input: string;
  instructions: string;
}): Promise<{ table: ParsedTable; usedDemo: boolean }> {
  const { provider, token, model, systemContext, input, instructions } = opts;
  const hasToken = token && token.trim().length > 0;

  if (provider === "openai" && hasToken) {
    const systemPrompt = buildSystemPrompt(systemContext);
    return { table: await callOpenAI(token, model, systemPrompt, input, instructions), usedDemo: false };
  }
  if (provider === "anthropic" && hasToken) {
    const systemPrompt = buildSystemPrompt(systemContext);
    return { table: await callAnthropic(token, model, systemPrompt, input, instructions), usedDemo: false };
  }
  if (provider === "gemini" && hasToken) {
    const systemPrompt = buildSystemPrompt(systemContext);
    return { table: await callGemini(token, model, systemPrompt, input, instructions), usedDemo: false };
  }
  throw new Error(`No API token configured for provider "${provider}". Add a token in Settings.`);
}
