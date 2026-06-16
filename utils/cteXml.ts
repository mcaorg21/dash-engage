// Conversao de json_xml (armazenado no banco) para XML, e extracao de dados do remetente.
// Compartilhado entre DashboardView (listagem Nao Conciliadas) e FerramentasView (Conciliar Planilhas Transp.)

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

const CTe_XMLNS = 'http://www.portalfiscal.inf.br/cte';

// Some importers store XML attributes as { "attributes": { key: val } }.
// Flatten those into direct properties so they render as child elements,
// matching the format of records that store properties directly.
function flattenAttributes(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const record = obj as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (key === 'attributes' && val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, val);
    } else {
      result[key] = flattenAttributes(val);
    }
  }
  return result;
}

// Recursively finds the node that IS a CTe (identified by having infCte as child)
function findCTeNode(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const record = obj as Record<string, unknown>;
  if ('infCte' in record) return record;
  for (const val of Object.values(record)) {
    const found = findCTeNode(val);
    if (found) return found;
  }
  return null;
}

// Which child keys of each element should be rendered as XML attributes (not child elements).
// This reconstructs the original XML attribute structure that JSON importers flatten.
const CTE_ATTR_MAP: Record<string, string[]> = {
  infCte: ['Id', 'versao'],
  infModal: ['versaoModal'],
  ObsCont: ['xCampo'],
  Reference: ['URI'],
  CanonicalizationMethod: ['Algorithm'],
  SignatureMethod: ['Algorithm'],
  DigestMethod: ['Algorithm'],
  Transform: ['Algorithm'],
};

function normalizeCteJson(obj: unknown, parentKey?: string): unknown {
  if (Array.isArray(obj)) return obj.map(item => normalizeCteJson(item, parentKey));
  if (!obj || typeof obj !== 'object') return obj;
  const record = obj as Record<string, unknown>;
  const attrKeys = parentKey ? (CTE_ATTR_MAP[parentKey] ?? []) : [];
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (attrKeys.includes(key)) {
      result[`@${key}`] = val;
    } else {
      result[key] = normalizeCteJson(val, key);
    }
  }
  return result;
}

export const jsonToXmlDocument = (value: unknown, chaveCteFallback?: string) => {
  if (!value || typeof value !== 'object') return String(value ?? '');

  // Normalize { attributes: {...} } sub-objects into flat properties first
  const record = flattenAttributes(value) as Record<string, unknown>;

  // Find CTe node: either at root or nested inside any wrapper (data>xml>CTe etc.)
  const cteNode = record.CTe
    ? (record.CTe as Record<string, unknown>)
    : findCTeNode(record);

  if (cteNode) {
    // Promote specific child elements to XML attributes to match cteProc standard format
    const normalized = normalizeCteJson(cteNode) as Record<string, unknown>;
    const cteWithNs = { xmlns: (cteNode.xmlns as string) ?? CTe_XMLNS, ...normalized };
    const cteXml = jsonToXmlNode('CTe', cteWithNs);
    return `<cteProc versao="4.00" xmlns="${CTe_XMLNS}">${cteXml}</cteProc>`;
  }

  // No CTe structure found — wrap raw content in <CTe> with Id from chave_cte
  const id = chaveCteFallback ? `CTe${chaveCteFallback}` : '';
  const entries = Object.entries(record);
  const body = entries.map(([key, childValue]) => jsonToXmlNode(key, childValue)).join('');
  return `<cteProc versao="4.00" xmlns="${CTe_XMLNS}"><CTe xmlns="${CTe_XMLNS}">${id ? `<Id>${id}</Id>` : ''}${body}</CTe></cteProc>`;
};

export const getXmlContent = (xmlSource: unknown, chaveCte?: string) => {
  if (!xmlSource) return '';

  return typeof xmlSource === 'string' && xmlSource.trim().startsWith('<')
    ? xmlSource
    : jsonToXmlDocument(xmlSource, chaveCte);
};

// Extrai CNPJ + cidade do remetente (infCte.rem) para exibir junto da chave CTe
export const getRemInfo = (xmlSource: unknown): string | null => {
  if (!xmlSource || typeof xmlSource !== 'object') return null;
  const record = flattenAttributes(xmlSource) as Record<string, unknown>;
  const cteNode = record.CTe ? (record.CTe as Record<string, unknown>) : findCTeNode(record);
  const infCte = cteNode?.infCte as Record<string, unknown> | undefined;
  const rem = infCte?.rem as Record<string, unknown> | undefined;
  if (!rem) return null;
  const cnpj = typeof rem.CNPJ === 'string' ? rem.CNPJ : '';
  const ender = rem.enderReme as Record<string, unknown> | undefined;
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

// Baixa o XML de uma CTe a partir do json_xml e da chave, com nome de arquivo seguro
export const downloadCteXml = (jsonXml: unknown, chaveCte: string) => {
  const xmlContent = getXmlContent(jsonXml, chaveCte || undefined);
  if (!xmlContent) return false;
  const safeChave = chaveCte.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadTextFile(xmlContent, `${safeChave || 'cte'}.xml`);
  return true;
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

// Baixa um zip com o XML de varias CTes de uma vez
export const downloadCteXmlZip = async (entries: { chave: string; json_xml: unknown }[], zipFilename: string) => {
  const zip = new JSZip();
  let total = 0;

  for (const { chave, json_xml } of entries) {
    const xmlContent = getXmlContent(json_xml, chave || undefined);
    if (!xmlContent) continue;
    const safeChave = chave.replace(/[^a-zA-Z0-9_-]/g, '_');
    zip.file(`${safeChave || 'cte'}.xml`, xmlContent);
    total += 1;
  }

  if (total === 0) return false;

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlobFile(blob, zipFilename);
  return true;
};
