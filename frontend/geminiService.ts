const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_KEY = "csc_brape_token";

function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function getAuthHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

export function getGeminiErrorMessage(error: unknown) {
  const raw = getErrorText(error);
  if (raw.includes("Chave Gemini nao configurada no backend")) {
    return "Chave Gemini nao configurada no backend.";
  }
  if (raw.includes("Chave Gemini invalida no backend")) {
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

export interface ExtractionInput {
  fileBase64?: string;
  mimeType?: string;
  extractedText?: string;
}

async function request<T>(path: string, payload: ExtractionInput): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function validateGeminiConnection() {
  try {
    await request("/ai/extract/budget", { extractedText: "ITEM;DESCRICAO;VALOR\n1.0;TESTE;100,00" });
    return true;
  } catch {
    return false;
  }
}

export const extractCostData = async (input: ExtractionInput) => {
  return request<any>("/ai/extract/cost", input);
};

export const extractBudgetData = async (input: ExtractionInput) => {
  return request<any[]>("/ai/extract/budget", input);
};

export const extractInstallmentData = async (input: ExtractionInput) => {
  return request<any>("/ai/extract/installment", input);
};
