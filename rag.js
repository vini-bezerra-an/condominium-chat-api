// rag.js (ESM)
import { connect } from '@lancedb/lancedb';
import { generateEmbedding, generateDocumentEmbedding } from './embeddings.js';
import crypto from 'node:crypto';
import path from 'node:path';

const dbDir = path.resolve('./lancedb');
const db = await connect(dbDir);

/** Quebra texto em chunks simples (ajuste se quiser por sentença) */
function splitText(text, maxLen) {
  const parts = [];
  for (let i = 0; i < text.length; i += maxLen) {
    parts.push(text.slice(i, i + maxLen));
  }
  return parts;
}

async function getOrCreateTable(tableName, sampleRow) {
  const names = await db.tableNames();
  if (names.includes(tableName)) return db.openTable(tableName);
  // Cria a tabela inferindo o schema a partir do sampleRow
  return db.createTable(tableName, [sampleRow]);
}

export async function addDocument(condominio, text) {
  const tableName = `docs_${condominio}`;
  const chunks = splitText(text, 500);

  // compute todas as embeddings primeiro
  const rows = [];
  for (const chunk of chunks) {
    const vec = await generateDocumentEmbedding(chunk); // Float32Array
    rows.push({
      id: crypto.randomUUID(),
      condominio,
      text: chunk,
      vector: vec, // nome de coluna padrão para busca
    });
  }

  // cria/abre a tabela e adiciona os dados
  const table = await getOrCreateTable(tableName, rows[0]);
  if (rows.length > 1) {
    await table.add(rows.slice(1));
  }
}

export async function searchDocuments(condominio, query, topK = 3) {
  const tableName = `docs_${condominio}`;
  const names = await db.tableNames();
  if (!names.includes(tableName)) return '';

  const table = await db.openTable(tableName);
  const qvec = await generateEmbedding(query);

  const results = await table
    .search(qvec)            // usa a coluna "vector" por padrão
    .limit(topK)
    .execute();

  return results.map(r => r.text).join('\n\n');
}
