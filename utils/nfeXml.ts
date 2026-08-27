// Conversao de json_xml (armazenado no banco) para XML, e extracao de dados do destinatario.
// Usado pela area Nao Conciliadas de NFe (nfe_lancamentos_financeiros).

import JSZip from 'jszip';

const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const isXmlAttribute = (key: string) => key === 'xmlns' || key.startsWith('@');

const jsonToXmlNode = (key: string, value: unknown): string => {
  const tagName = key.startsWith('@') ? key.slice(1) : key;

  if (Array.isArray(value)) {
    return value.map(item => jsonToXmlNode(tagName, item)).join('');
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const attributes = Object.entries(record)
      .filter(([childKey]) => isXmlAttribute(childKey))
      .map(([childKey, childValue]) => {
        const attributeName = childKey.startsWith('@') ? childKey.slice(1) : childKey;
        return ` ${attributeName}="${escapeXml(childValue)}"`;
      })
      .join('');

    const children = Object.entries(record)
      .filter(([childKey]) => !isXmlAttribute(childKey))
      .map(([childKey, childValue]) => jsonToXmlNode(childKey, childValue))
      .join('');

    return `<${tagName}${attributes}>${children}</${tagName}>`;
  }

  return `<${tagName}>${escapeXml(value)}</${tagName}>`;
};

// Chaves cujos filhos devem virar atributos XML em vez de elementos filhos,
// reconstruindo a estrutura original do XML a partir do JSON armazenado.
const NFE_ATTR_MAP: Record<string, string[]> = {
  infNFe: ['Id', 'versao'],
  protNFe: ['versao'],
  infProt: ['Id'],
  det: ['nItem'],
};

function promoteAttributes(obj: unknown, parentKey?: string): unknown {
  if (Array.isArray(obj)) return obj.map(item => promoteAttributes(item, parentKey));
  if (!obj || typeof obj !== 'object') return obj;
  const record = obj as Record<string, unknown>;
  const attrKeys = parentKey ? (NFE_ATTR_MAP[parentKey] ?? []) : [];
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (attrKeys.includes(key)) {
      result[`@${key}`] = val;
    } else {
      result[key] = promoteAttributes(val, key);
    }
  }
  return result;
}

const NFE_XMLNS = 'http://www.portalfiscal.inf.br/nfe';

export const jsonToNfeXmlDocument = (value: unknown, chaveNfeFallback?: string) => {
  if (!value || typeof value !== 'object') return String(value ?? '');

  const root = value as Record<string, unknown>;
  const nfeNode = root.NFe as Record<string, unknown> | undefined;

  if (!nfeNode) {
    const id = chaveNfeFallback ? `NFe${chaveNfeFallback}` : '';
    const body = Object.entries(root).map(([key, childValue]) => jsonToXmlNode(key, childValue)).join('');
    return `<nfeProc versao="4.00" xmlns="${NFE_XMLNS}"><NFe xmlns="${NFE_XMLNS}">${id ? `<Id>${id}</Id>` : ''}${body}</NFe></nfeProc>`;
  }

  const versaoRoot = typeof root.versao === 'string' ? root.versao : '4.00';
  const xmlnsRoot = typeof root.xmlns === 'string' ? root.xmlns : NFE_XMLNS;
  const nfeXmlns = typeof nfeNode.xmlns === 'string' ? nfeNode.xmlns : xmlnsRoot;

  const infNFe = promoteAttributes(nfeNode.infNFe, 'infNFe') as Record<string, unknown> | undefined;
  const infNFeXml = infNFe ? jsonToXmlNode('infNFe', infNFe) : '';
  const nfeXml = `<NFe xmlns="${nfeXmlns}">${infNFeXml}</NFe>`;

  const protNode = root.protNFe ? (promoteAttributes(root.protNFe, 'protNFe') as Record<string, unknown>) : null;
  const protXml = protNode ? jsonToXmlNode('protNFe', protNode) : '';

  return `<nfeProc versao="${versaoRoot}" xmlns="${xmlnsRoot}">${nfeXml}${protXml}</nfeProc>`;
};

export const getNfeXmlContent = (xmlSource: unknown, chaveNfe?: string) => {
  if (!xmlSource) return '';

  return typeof xmlSource === 'string' && xmlSource.trim().startsWith('<')
    ? xmlSource
    : jsonToNfeXmlDocument(xmlSource, chaveNfe);
};

// Extrai CNPJ + cidade do destinatario (NFe.infNFe.dest) para exibir junto da chave NFe
export const getDestInfoNfe = (xmlSource: unknown): string | null => {
  if (!xmlSource || typeof xmlSource !== 'object') return null;
  const root = xmlSource as Record<string, unknown>;
  const nfeNode = root.NFe as Record<string, unknown> | undefined;
  const infNFe = nfeNode?.infNFe as Record<string, unknown> | undefined;
  const dest = infNFe?.dest as Record<string, unknown> | undefined;
  if (!dest) return null;
  const cnpj = typeof dest.CNPJ === 'string' ? dest.CNPJ : '';
  const ender = dest.enderDest as Record<string, unknown> | undefined;
  const xMun = ender && typeof ender.xMun === 'string' ? ender.xMun : '';
  const info = [xMun, cnpj].filter(Boolean).join('_');
  return info || null;
};

export const downloadTextFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const downloadBlobFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Baixa o XML de uma NFe a partir do json_xml e da chave, com nome de arquivo seguro
export const downloadNfeXml = (jsonXml: unknown, chaveNfe: string) => {
  const xmlContent = getNfeXmlContent(jsonXml, chaveNfe || undefined);
  if (!xmlContent) return false;
  const safeChave = chaveNfe.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadTextFile(xmlContent, `${safeChave || 'nfe'}.xml`);
  return true;
};

// Baixa um zip com o XML de varias NFes de uma vez
export const downloadNfeXmlZip = async (entries: { chave: string; json_xml: unknown }[], zipFilename: string) => {
  const zip = new JSZip();
  let total = 0;

  for (const { chave, json_xml } of entries) {
    const xmlContent = getNfeXmlContent(json_xml, chave || undefined);
    if (!xmlContent) continue;
    const safeChave = chave.replace(/[^a-zA-Z0-9_-]/g, '_');
    zip.file(`${safeChave || 'nfe'}.xml`, xmlContent);
    total += 1;
  }

  if (total === 0) return false;

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlobFile(blob, zipFilename);
  return true;
};
