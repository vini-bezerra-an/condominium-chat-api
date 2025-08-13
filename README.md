# Condominium Search API

Sistema de busca inteligente para documentos de condomínio usando Groq AI.

## 🚀 Configuração

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Copie o arquivo `env.example` para `.env`:
```bash
cp env.example .env
```

Edite o arquivo `.env` e adicione suas chaves de API:
```env
GROQ_API_KEY=sua_chave_groq_aqui
HF_API_KEY=sua_chave_hf_aqui
```

### 3. Obter chaves de API

#### Groq API Key
1. Acesse [console.groq.com](https://console.groq.com/)
2. Crie uma conta ou faça login
3. Vá em "API Keys" e crie uma nova chave
4. Copie a chave para o arquivo `.env`

## 🏃‍♂️ Executar

### Desenvolvimento (com watch)
```bash
npm run dev
```

### Produção
```bash
npm start
```

## 📡 Endpoints

### Upload de documento
```bash
POST /{condominio}/admin/upload
Content-Type: multipart/form-data
Body: file (PDF)
```

### Chat/Pesquisa
```bash
POST /{condominio}/chat
Content-Type: application/json
Body: { "question": "sua pergunta aqui" }
```

### Listar condomínios
```bash
GET /condominios
```

### Status do sistema
```bash
GET /admin/status
```

### Limpar cache
```bash
POST /admin/clear-cache
```

## 🔧 Resolver problema de chaves expostas

Se você commitou chaves de API acidentalmente:

### 1. Remover do histórico do Git
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all
```

### 2. Forçar push
```bash
git push origin --force --all
```

### 3. Regerar chaves
- Vá para [console.groq.com](https://console.groq.com/) e gere uma nova chave
- Atualize o arquivo `.env` com a nova chave

## 🛡️ Segurança

- Nunca commite o arquivo `.env`
- O `.gitignore` já está configurado para ignorar arquivos sensíveis
- Use sempre o `env.example` como template

## 📁 Estrutura

```
├── app.js              # Servidor Express
├── groq-search.js      # Sistema de busca com Groq AI
├── simple-search.js    # Sistema de busca simples (backup)
├── embeddings.js       # Sistema de embeddings (não usado)
├── data/              # Documentos processados
├── cache/             # Cache de consultas
├── uploads/           # Arquivos temporários
└── .env               # Variáveis de ambiente (não commitar)
```
