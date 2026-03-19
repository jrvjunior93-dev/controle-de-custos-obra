const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "").trim();
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3-flash-preview"];

type ExtractionInput = {
  fileBase64?: string;
  mimeType?: string;
  extractedText?: string;
};

function assertGeminiApiKey() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("PLACEHOLDER")) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return GEMINI_API_KEY;
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return [error.message, error.stack].filter(Boolean).join(" ");
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error || "");
  }
}

function extractResponseText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part: any) => part?.text || "")
    .join("")
    .trim();
}

function stripJsonWrapper(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 45000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("GEMINI_TIMED_OUT")), timeoutMs)),
  ]);
}

async function callGemini(model: string, body: any) {
  const apiKey = assertGeminiApiKey();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }

  const text = extractResponseText(payload);
  if (!text) {
    throw new Error("GEMINI_EMPTY_RESPONSE");
  }

  return text;
}

async function generateWithFallback(buildBody: (model: string) => any) {
  let lastError: unknown;

  for (const model of GEMINI_MODELS) {
    try {
      return await callGemini(model, buildBody(model));
    } catch (error) {
      lastError = error;
      const message = getErrorText(error);
      const isUnavailable = message.includes("503") || message.includes("UNAVAILABLE") || message.includes("high demand");
      if (!isUnavailable || model === GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Unable to call Gemini");
}

async function callGeminiWithRetry(fn: () => Promise<string>, retries = 4, delay = 2000): Promise<string> {
  try {
    return await withTimeout(fn());
  } catch (error) {
    const errorMsg = getErrorText(error);
    if (
      retries > 0 &&
      (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("GEMINI_TIMED_OUT"))
    ) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callGeminiWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

function buildParts(input: ExtractionInput, label: string) {
  const parts: any[] = [];
  if (input.extractedText) {
    parts.push({ text: `${label}:\n${input.extractedText}` });
  } else if (input.fileBase64 && input.mimeType) {
    parts.push({ inline_data: { data: input.fileBase64, mime_type: input.mimeType } });
  }
  return parts;
}

function parseJsonResponse<T>(text: string, fallback: T): T {
  const cleaned = stripJsonWrapper(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}

export function getGeminiErrorMessage(error: unknown) {
  const raw = getErrorText(error);
  if (raw.includes("GEMINI_API_KEY_MISSING")) {
    return "Chave Gemini nao configurada no backend.";
  }
  if (raw.includes("API key not valid") || raw.includes("API_KEY_INVALID")) {
    return "Chave Gemini invalida no backend.";
  }
  if (raw.includes("429") || raw.includes("RESOURCE_EXHAUSTED") || raw.includes("quota")) {
    return "Limite da API Gemini atingido. Tente novamente em alguns minutos.";
  }
  if (raw.includes("503") || raw.includes("UNAVAILABLE") || raw.includes("high demand")) {
    return "O modelo Gemini esta indisponivel no momento. O sistema tentara um modelo alternativo automaticamente.";
  }
  if (raw.includes("timeout") || raw.includes("TIMED_OUT")) {
    return "A IA demorou demais para responder. Tente novamente ou importe a planilha em um formato mais simples.";
  }
  return "Falha na IA ao processar o arquivo.";
}

export async function extractCostData(input: ExtractionInput) {
  const parts = buildParts(input, "Texto extraido");
  parts.push({
    text: `Analise o documento e extraia os dados.
REGRAS OBRIGATORIAS:
1. date: busque a data do documento e retorne EXCLUSIVAMENTE no formato YYYY-MM-DD.
2. description: nome do fornecedor principal.
3. totalValue: valor total numerico.
Retorne JSON puro com as chaves: description, itemDetail, unit, quantity, unitValue, totalValue, date.`,
  });

  const text = await callGeminiWithRetry(() =>
    generateWithFallback((model) => ({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }))
  );

  return parseJsonResponse(text, {});
}

export async function extractBudgetData(input: ExtractionInput) {
  const parts = buildParts(input, "Planilha");
  parts.push({
    text: `Extraia apenas itens macro de orcamento.
REGRAS:
1. Retorne apenas linhas agregadas, sem composicoes auxiliares.
2. description deve conter a descricao resumida do item macro.
3. budgetedValue deve ser numerico, sem simbolo de moeda.
4. Ignore linhas vazias, totais parciais e cabecalhos.
Retorne JSON puro como array de objetos com as chaves description e budgetedValue.`,
  });

  const text = await callGeminiWithRetry(() =>
    generateWithFallback((model) => ({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }))
  );

  return parseJsonResponse(text, []);
}

export async function extractInstallmentData(input: ExtractionInput) {
  const parts = buildParts(input, "Documento");
  parts.push({
    text: `Extraia os dados do boleto ou parcelamento.
Use YYYY-MM-DD para datas.
Retorne JSON puro com as chaves: provider, description, totalValue, totalInstallments, digitalLine, installments.
installments deve ser um array de objetos com dueDate e value.`,
  });

  const text = await callGeminiWithRetry(() =>
    generateWithFallback((model) => ({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }))
  );

  return parseJsonResponse(text, {});
}
