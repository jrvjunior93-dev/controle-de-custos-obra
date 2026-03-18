const BROKEN_CHAR = '[\\uFFFD\\?]';

const COMMON_REPLACEMENTS: Array<[RegExp, string]> = [
  [new RegExp(`ADMINISTRAC(?:${BROKEN_CHAR}){1,2}O`, 'gi'), 'ADMINISTRAÇÃO'],
  [new RegExp(`SERVIC(?:${BROKEN_CHAR})OS`, 'gi'), 'SERVIÇOS'],
  [new RegExp(`TECNIC(?:${BROKEN_CHAR})S?`, 'gi'), 'TÉCNICOS'],
  [new RegExp(`BENEFIC(?:${BROKEN_CHAR})OS`, 'gi'), 'BENEFÍCIOS'],
  [new RegExp(`INSTALAC(?:${BROKEN_CHAR}){1,2}ES`, 'gi'), 'INSTALAÇÕES'],
  [new RegExp('PROVISORIAS', 'gi'), 'PROVISÓRIAS'],
  [new RegExp('ORCAMENTO', 'gi'), 'ORÇAMENTO'],
  [new RegExp('ORCAMENTARIA', 'gi'), 'ORÇAMENTÁRIA'],
  [new RegExp(`DESCRIC(?:${BROKEN_CHAR}){1,2}O`, 'gi'), 'DESCRIÇÃO'],
  [new RegExp('ORCADO', 'gi'), 'ORÇADO'],
  [new RegExp(`AC(?:${BROKEN_CHAR})ES`, 'gi'), 'AÇÕES'],
  [new RegExp(`INTERAC(?:${BROKEN_CHAR})ES`, 'gi'), 'INTERAÇÕES'],
  [new RegExp(`SOLICITAC(?:${BROKEN_CHAR}){1,2}ES`, 'gi'), 'SOLICITAÇÕES'],
  [new RegExp('TECNICA', 'gi'), 'TÉCNICA'],
  [new RegExp('TECNICO', 'gi'), 'TÉCNICO'],
  [new RegExp(`VOC(?:${BROKEN_CHAR})`, 'gi'), 'VOCÊ'],
  [new RegExp(`GEST(?:${BROKEN_CHAR})O`, 'gi'), 'GESTÃO'],
  [new RegExp(`APROVAC(?:${BROKEN_CHAR}){1,2}ES`, 'gi'), 'APROVAÇÕES'],
  [new RegExp(`COMPOSIC(?:${BROKEN_CHAR}){1,2}ES`, 'gi'), 'COMPOSIÇÕES'],
  [/N\?O/gi, 'NÃO'],
  [/SESSAO/gi, 'SESSÃO'],
  [/SESS?O/gi, 'SESSÃO'],
  [/CONEXAO/gi, 'CONEXÃO'],
  [/SINCRONIZACAO/gi, 'SINCRONIZAÇÃO'],
  [/RELATORIO/gi, 'RELATÓRIO'],
  [/USUARIOS/gi, 'USUÁRIOS'],
];

function scoreText(text: string) {
  const weird = (text.match(/[\uFFFD?]/g) || []).length;
  const accent = (text.match(/[À-ÿ]/g) || []).length;
  return accent - weird;
}

function decodeLatin1AsUtf8(text: string) {
  try {
    const bytes = Uint8Array.from([...text].map((char) => char.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return text;
  }
}

export function normalizePtText(value: unknown): string {
  let text = String(value || '');
  if (!text) return '';

  const decoded = /[�?]/.test(text) ? decodeLatin1AsUtf8(text) : text;
  if (scoreText(decoded) > scoreText(text)) {
    text = decoded;
  }

  for (const [pattern, replacement] of COMMON_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, ' ').trim();
}
