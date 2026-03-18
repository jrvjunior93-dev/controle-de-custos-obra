function getApiKey() {
  return (import.meta.env.VITE_GEMINI_API_KEY || "").trim();
}

function assertApiKey() {
  const key = getApiKey().trim();
  if (!key || key.includes("PLACEHOLDER")) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return key;
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3-flash-preview'];

async function loadGenAi() {
  return await import('@google/genai');
}

async function getAiClient() {
  const { GoogleGenAI } = await loadGenAi();
  return new GoogleGenAI({ apiKey: assertApiKey() });
}

function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return [error.message, error.stack].filter(Boolean).join(' ');
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error || '');
  }
}

export function getGeminiErrorMessage(error: unknown) {
  const raw = getErrorText(error);
  if (raw.includes("GEMINI_API_KEY_MISSING")) {
    return "Chave Gemini ausente ou placeholder. Defina VITE_GEMINI_API_KEY no .env.local.";
  }
  if (raw.includes("API key not valid") || raw.includes("API_KEY_INVALID")) {
    return "Chave Gemini invalida. Atualize VITE_GEMINI_API_KEY no .env.local e reinicie o frontend.";
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

export interface ExtractionInput {
  fileBase64?: string;
  mimeType?: string;
  extractedText?: string;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 45000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("GEMINI_TIMED_OUT")), timeoutMs)),
  ]);
}

async function generateWithFallback(buildRequest: (model: string) => any) {
  const ai = await getAiClient();
  let lastError: unknown;

  for (const model of GEMINI_MODELS) {
    try {
      return await ai.models.generateContent(buildRequest(model));
    } catch (error: any) {
      lastError = error;
      const message = getErrorText(error);
      const isUnavailable = message.includes('503') || message.includes('UNAVAILABLE') || message.includes('high demand');
      if (!isUnavailable || model === GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Unable to call Gemini');
}

async function callGeminiWithRetry(fn: () => Promise<any>, retries = 4, delay = 2000): Promise<any> {
  try {
    return await withTimeout(fn());
  } catch (error: any) {
    const errorMsg = getErrorText(error);
    if (retries > 0 && (errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota") || errorMsg.includes("GEMINI_TIMED_OUT"))) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callGeminiWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function validateGeminiConnection() {
  try {
    const response = await withTimeout(generateWithFallback((model) => ({
      model,
      contents: 'Responda apenas OK',
    })), 20000);
    return (response.text || '').trim().toUpperCase().includes('OK');
  } catch {
    return false;
  }
}

export const extractCostData = async (input: ExtractionInput) => {
  return callGeminiWithRetry(async () => {
    const { Type } = await loadGenAi();
    const parts: any[] = [];
    if (input.extractedText) parts.push({ text: `Texto extraido:
${input.extractedText}` });
    else if (input.fileBase64 && input.mimeType) parts.push({ inlineData: { data: input.fileBase64, mimeType: input.mimeType } });

    parts.push({ text: `Analise o documento e extraia os dados.
REGRAS OBRIGATORIAS:
1. date: busque a data do documento e retorne EXCLUSIVAMENTE no formato YYYY-MM-DD.
2. description: nome do fornecedor principal.
3. totalValue: valor total numerico.
Retorne JSON puro.` });

    const response = await generateWithFallback((model) => ({
      model,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            itemDetail: { type: Type.STRING },
            unit: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unitValue: { type: Type.NUMBER },
            totalValue: { type: Type.NUMBER },
            date: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" }
          }
        }
      }
    }));
    return JSON.parse(response.text || '{}');
  });
};

export const extractBudgetData = async (input: ExtractionInput) => {
  return callGeminiWithRetry(async () => {
    const { Type } = await loadGenAi();
    const parts: any[] = [];
    if (input.extractedText) parts.push({ text: `Planilha:
${input.extractedText}` });
    else if (input.fileBase64 && input.mimeType) parts.push({ inlineData: { data: input.fileBase64, mimeType: input.mimeType } });

    const response = await generateWithFallback((model) => ({
      model,
      contents: {
        parts: [
          ...parts,
          {
            text: `Extraia apenas itens macro de orçamento.
REGRAS:
1. Retorne apenas linhas agregadas, sem composições auxiliares.
2. description deve conter a descrição resumida do item macro.
3. budgetedValue deve ser numérico, sem símbolo de moeda.
4. Ignore linhas vazias, totais parciais e cabeçalhos.
Retorne JSON puro.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING },
              budgetedValue: { type: Type.NUMBER }
            }
          }
        }
      }
    }));
    return JSON.parse(response.text || '[]');
  });
};

export const extractInstallmentData = async (input: ExtractionInput) => {
  return callGeminiWithRetry(async () => {
    const { Type } = await loadGenAi();
    const parts: any[] = [];
    if (input.fileBase64 && input.mimeType) parts.push({ inlineData: { data: input.fileBase64, mimeType: input.mimeType } });

    const response = await generateWithFallback((model) => ({
      model,
      contents: { parts: [...parts, { text: "Extraia os dados do boleto/parcelamento. Use YYYY-MM-DD para datas." }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            provider: { type: Type.STRING },
            description: { type: Type.STRING },
            totalValue: { type: Type.NUMBER },
            totalInstallments: { type: Type.NUMBER },
            digitalLine: { type: Type.STRING },
            installments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  dueDate: { type: Type.STRING, description: "YYYY-MM-DD" },
                  value: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    }));
    return JSON.parse(response.text || '{}');
  });
};
