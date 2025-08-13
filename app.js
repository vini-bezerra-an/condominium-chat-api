import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import fs from 'fs';
import dotenv from 'dotenv';
import { addDocument, searchDocuments, listCondominios, getSystemStatus } from './groq-search.js';

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });
app.use(express.json());

// Upload PDF
app.post('/:condominio/admin/upload', upload.single('file'), async (req, res) => {
  try {
    const condominio = req.params.condominio;
    const filePath = req.file.path;

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    await addDocument(condominio, pdfData.text);

    fs.unlinkSync(filePath);
    res.json({ message: 'Documento indexado com sucesso!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Falha ao indexar documento' });
  }
});

// Chat usando Groq API com análise inteligente
app.post('/:condominio/chat', async (req, res) => {
  try {
    const condominio = req.params.condominio;
    const { question } = req.body;

    const context = await searchDocuments(condominio, question);

    const prompt = `Analise o texto e responda a pergunta de forma direta e específica. Responda APENAS com a informação solicitada, sem adicionar frases como "A resposta é:" ou "Baseado no texto:".

TEXTO: ${context}

PERGUNTA: ${question}

RESPOSTA DIRETA:`;

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 200, // Reduzido para economizar tokens
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '');
      throw new Error(`Groq API error ${aiRes.status}: ${errText}`);
    }

    const data = await aiRes.json();
    let answer = data.choices?.[0]?.message?.content ?? '';
    
    // Remove prefixos desnecessários
    answer = answer.replace(/^(A resposta é:|Baseado no texto:|Resposta:|Resposta direta:)\s*/i, '').trim();
    
    res.json({ answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Falha no chat' });
  }
});

// Listar condomínios
app.get('/condominios', (req, res) => {
  try {
    const condominios = listCondominios();
    res.json({ condominios });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Falha ao listar condomínios' });
  }
});

// Limpar cache
app.post('/admin/clear-cache', (req, res) => {
  try {
    const cacheDir = './cache';
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      files.forEach(file => {
        fs.unlinkSync(path.join(cacheDir, file));
      });
    }
    res.json({ message: 'Cache limpo com sucesso!' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Falha ao limpar cache' });
  }
});

// Status do sistema
app.get('/admin/status', (req, res) => {
  try {
    const cacheDir = './cache';
    const dataDir = './data';
    
    const cacheFiles = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).length : 0;
    const dataFiles = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).length : 0;
    const systemStatus = getSystemStatus();
    
    res.json({
      cache: {
        files: cacheFiles,
        memoryEntries: systemStatus.memoryCacheSize
      },
      data: {
        files: dataFiles
      },
      rateLimit: {
        lastRequestTime: new Date(systemStatus.lastRequestTime).toISOString(),
        minInterval: '2s'
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Falha ao obter status' });
  }
});

app.listen(3000, () => {
  console.log('Servidor rodando na porta 3000');
  console.log('Sistema de busca com Groq AI ativo! 🤖');
});
