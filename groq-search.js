// groq-search.js - Sistema de busca usando Groq AI
import fs from 'fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = './data';
const CACHE_DIR = './cache';

// Garante que os diretórios existem
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Cache simples em memória
const memoryCache = new Map();

// Controle de rate limit
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 segundos entre requests

// Função para gerar hash do conteúdo
function generateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

// Função para salvar cache
function saveCache(key, data) {
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  memoryCache.set(key, data);
}

// Função para carregar cache
function loadCache(key) {
  // Primeiro tenta memória
  if (memoryCache.has(key)) {
    return memoryCache.get(key);
  }
  
  // Depois tenta arquivo
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(cacheFile)) {
    const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    memoryCache.set(key, data);
    return data;
  }
  
  return null;
}

// Função para aguardar entre requests
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

// Função para fazer request com retry
async function makeGroqRequest(prompt, maxRetries = 3) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) throw new Error('Defina GROQ_API_KEY no seu .env');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await waitForRateLimit();
      
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 30, // Reduzido para economizar tokens
          temperature: 0.1,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content?.trim();
      }

      if (response.status === 429) {
        const errorData = await response.json();
        const retryAfter = errorData.error?.retry_after || 5;
        console.log(`Rate limit atingido. Aguardando ${retryAfter} segundos...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
      
    } catch (error) {
      console.error(`Tentativa ${attempt} falhou:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Aguarda antes da próxima tentativa
      await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
    }
  }
}

// Função para quebrar texto em chunks menores
function splitText(text, maxLength = 1500) { // Reduzido para economizar tokens
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

// Função para buscar chunks relevantes usando Groq com cache
async function findRelevantChunks(chunks, query) {
  const queryHash = generateHash(query);
  const relevantChunks = [];
  
  // Processa chunks em lotes menores para economizar tokens
  const batchSize = 3; // Reduzido de 5 para 3
  const batches = [];
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    batches.push(chunks.slice(i, i + batchSize));
  }
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchKey = `${queryHash}_batch_${batchIndex}`;
    
    // Tenta carregar do cache
    let batchResults = loadCache(batchKey);
    
    if (!batchResults) {
      // Se não está em cache, faz a chamada à API
      batchResults = [];
      
      // Prompt mais conciso para economizar tokens
      const combinedText = batch.map((chunk, idx) => `${idx + 1}:${chunk.substring(0, 300)}...`).join('\n');
      
      const prompt = `Q: ${query}\n\nDocs:\n${combinedText}\n\nR: (números dos docs relevantes ou "nenhum"):`;

      try {
        const answer = await makeGroqRequest(prompt);
        
        if (answer && !answer.toLowerCase().includes('nenhum')) {
          const numbers = answer.match(/\d+/g);
          if (numbers) {
            numbers.forEach(num => {
              const index = parseInt(num) - 1;
              if (index >= 0 && index < batch.length) {
                batchResults.push(batch[index]);
              }
            });
          }
        }
        
        // Salva no cache
        saveCache(batchKey, batchResults);
        
      } catch (error) {
        console.error('Erro ao analisar batch:', error);
      }
    }
    
    relevantChunks.push(...batchResults);
  }
  
  return relevantChunks;
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
  
  // Limpa cache antigo deste condomínio
  const cacheFiles = fs.readdirSync(CACHE_DIR);
  cacheFiles.forEach(file => {
    if (file.includes(condominio)) {
      fs.unlinkSync(path.join(CACHE_DIR, file));
    }
  });
  
  console.log(`Documento adicionado: ${chunks.length} chunks para ${condominio}`);
}

// Buscar documentos usando Groq
export async function searchDocuments(condominio, query, topK = 3) {
  const fileName = `${DATA_DIR}/${condominio}.json`;
  
  if (!fs.existsSync(fileName)) {
    return 'Nenhum documento encontrado para este condomínio.';
  }
  
  const documents = JSON.parse(fs.readFileSync(fileName, 'utf8'));
  const chunks = documents.map(doc => doc.text);
  
  // Encontra chunks relevantes usando Groq
  const relevantChunks = await findRelevantChunks(chunks, query);
  
  if (relevantChunks.length === 0) {
    return 'Não encontrei informações relevantes para sua pergunta. Tente reformular ou ser mais específico.';
  }
  
  // Limita o número de chunks para não exceder o limite de tokens
  const limitedChunks = relevantChunks.slice(0, topK);
  
  return limitedChunks.join('\n\n---\n\n');
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

// Exportar variáveis de controle para status
export function getSystemStatus() {
  return {
    memoryCacheSize: memoryCache.size,
    lastRequestTime: lastRequestTime
  };
}
