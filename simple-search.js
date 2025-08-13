// simple-search.js - Sistema de busca simples sem embeddings
import fs from 'fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = './data';

// Garante que o diretório de dados existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Função para extrair informações específicas do texto
function extractSpecificInfo(text, query) {
  const lowerQuery = query.toLowerCase();
  const results = [];
  
  // Extrair nomes (padrão: Nome Sobrenome)
  if (lowerQuery.includes('quem') || lowerQuery.includes('assinou') || lowerQuery.includes('nome')) {
    const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g;
    const names = text.match(namePattern) || [];
    if (names.length > 0) {
      results.push(`**Nomes encontrados:** ${names.join(', ')}`);
    }
  }
  
  // Extrair datas
  if (lowerQuery.includes('quando') || lowerQuery.includes('data')) {
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g;
    const dates = text.match(datePattern) || [];
    if (dates.length > 0) {
      results.push(`**Datas encontradas:** ${dates.join(', ')}`);
    }
  }
  
  // Extrair valores monetários
  if (lowerQuery.includes('quanto') || lowerQuery.includes('valor')) {
    const valuePattern = /R\$\s*\d+[.,]\d{2}|\d+[.,]\d{2}\s*reais?/gi;
    const values = text.match(valuePattern) || [];
    if (values.length > 0) {
      results.push(`**Valores encontrados:** ${values.join(', ')}`);
    }
  }
  
  return results;
}

// Função para extrair palavras-chave da pergunta
function extractKeywords(question) {
  const lowerQuestion = question.toLowerCase();
  
  // Palavras que indicam busca por pessoas
  const personKeywords = ['quem', 'assinou', 'assinatura', 'presidente', 'síndico', 'morador', 'proprietário', 'nome'];
  
  // Palavras que indicam busca por datas
  const dateKeywords = ['quando', 'data', 'dia', 'mês', 'ano', 'reunião', 'assembléia'];
  
  // Palavras que indicam busca por valores
  const valueKeywords = ['quanto', 'valor', 'taxa', 'multa', 'cota', 'rateio', 'valor', 'preço', 'custo'];
  
  // Palavras que indicam busca por decisões
  const decisionKeywords = ['decidiu', 'decisão', 'aprovou', 'reprovou', 'votou', 'resolução'];
  
  const keywords = [];
  
  if (personKeywords.some(k => lowerQuestion.includes(k))) {
    keywords.push('PERSON');
  }
  if (dateKeywords.some(k => lowerQuestion.includes(k))) {
    keywords.push('DATE');
  }
  if (valueKeywords.some(k => lowerQuestion.includes(k))) {
    keywords.push('VALUE');
  }
  if (decisionKeywords.some(k => lowerQuestion.includes(k))) {
    keywords.push('DECISION');
  }
  
  return keywords;
}

// Função para calcular similaridade melhorada
function calculateSimilarity(query, text, keywords = []) {
  const queryWords = query.toLowerCase().split(/\s+/);
  const textWords = text.toLowerCase().split(/\s+/);
  
  // Busca exata por palavras da pergunta
  let exactMatches = 0;
  for (const queryWord of queryWords) {
    if (queryWord.length > 2 && textWords.some(textWord => textWord.includes(queryWord) || queryWord.includes(textWord))) {
      exactMatches++;
    }
  }
  
  // Busca por padrões específicos baseado nas keywords
  let patternScore = 0;
  
  if (keywords.includes('PERSON')) {
    // Procura por padrões de nomes (maiúsculas seguidas de espaços)
    const namePattern = /\b[A-Z][a-z]+ [A-Z][a-z]+/g;
    const names = text.match(namePattern) || [];
    patternScore += names.length * 0.5;
  }
  
  if (keywords.includes('DATE')) {
    // Procura por padrões de data
    const datePattern = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g;
    const dates = text.match(datePattern) || [];
    patternScore += dates.length * 0.3;
  }
  
  if (keywords.includes('VALUE')) {
    // Procura por valores monetários
    const valuePattern = /R\$\s*\d+[.,]\d{2}|\d+[.,]\d{2}\s*reais?/gi;
    const values = text.match(valuePattern) || [];
    patternScore += values.length * 0.3;
  }
  
  // Similaridade Jaccard básica
  const set1 = new Set(queryWords);
  const set2 = new Set(textWords);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  const jaccardSimilarity = intersection.size / union.size;
  
  // Score final combinando tudo
  const finalScore = (exactMatches * 0.4) + (patternScore * 0.4) + (jaccardSimilarity * 0.2);
  
  return finalScore;
}

// Função para quebrar texto em chunks menores e mais específicos
function splitText(text, maxLength = 150) {
  // Primeiro divide por parágrafos
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  const chunks = [];
  
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      chunks.push(paragraph.trim());
    } else {
      // Se o parágrafo for muito grande, divide por frases
      const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
      let currentChunk = '';
      
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      }
      
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
    }
  }
  
  return chunks;
}

// Adicionar documento
export async function addDocument(condominio, text) {
  const fileName = `${DATA_DIR}/${condominio}.json`;
  const chunks = splitText(text);
  
  const documents = chunks.map((chunk, index) => ({
    id: crypto.randomUUID(),
    text: chunk,
    index: index,
    length: chunk.length
  }));
  
  // Salva os documentos em arquivo JSON
  fs.writeFileSync(fileName, JSON.stringify(documents, null, 2));
  
  console.log(`Documento adicionado: ${chunks.length} chunks para ${condominio}`);
}

// Buscar documentos
export async function searchDocuments(condominio, query, topK = 5) {
  const fileName = `${DATA_DIR}/${condominio}.json`;
  
  if (!fs.existsSync(fileName)) {
    return '';
  }
  
  const documents = JSON.parse(fs.readFileSync(fileName, 'utf8'));
  const keywords = extractKeywords(query);
  
  // Calcula similaridade para cada chunk
  const scoredDocs = documents.map(doc => ({
    ...doc,
    score: calculateSimilarity(query, doc.text, keywords)
  }));
  
  // Ordena por score e pega os top K
  const topDocs = scoredDocs
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter(doc => doc.score > 0.05); // Threshold mais baixo para pegar mais resultados
  
  if (topDocs.length === 0) {
    return 'Não encontrei informações relevantes para sua pergunta. Tente reformular ou ser mais específico.';
  }
  
  // Extrai informações específicas do texto encontrado
  const allText = topDocs.map(doc => doc.text).join(' ');
  const specificInfo = extractSpecificInfo(allText, query);
  
  let result = '';
  if (specificInfo.length > 0) {
    result += specificInfo.join('\n\n') + '\n\n---\n\n';
  }
  
  result += topDocs.map(doc => doc.text).join('\n\n---\n\n');
  
  return result;
}

// Listar condomínios disponíveis
export function listCondominios() {
  if (!fs.existsSync(DATA_DIR)) {
    return [];
  }
  
  return fs.readdirSync(DATA_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));
}
