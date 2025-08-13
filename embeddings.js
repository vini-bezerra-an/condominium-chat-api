// embeddings.js
export async function generateEmbedding(text) {
  const HF_API_KEY = process.env.HF_API_KEY;
  if (!HF_API_KEY) throw new Error('Defina HF_API_KEY no seu .env');

  const res = await fetch(
    'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        options: { wait_for_model: true }
      }),
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`HF API error ${res.status}: ${t}`);
  }

  const data = await res.json();

  // Retorno pode ser [dim] ou [tokens][dim]
  if (Array.isArray(data) && Array.isArray(data[0])) {
    // mean pooling
    const tokens = data;
    const dim = tokens[0].length;
    const out = new Float32Array(dim);
    for (const row of tokens) for (let j = 0; j < dim; j++) out[j] += row[j];
    for (let j = 0; j < dim; j++) out[j] /= tokens.length;
    return out;
  }
  return Float32Array.from(data);
}

// Alias para compatibilidade
export const generateDocumentEmbedding = generateEmbedding;
