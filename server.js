require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');
const pdfParse = require('pdf-parse');

// Contexto em memória por IP (simples)
const uploadContexts = new Map();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting simples
const requestTimestamps = new Map();
const MAX_REQUESTS = 10;
const TIME_WINDOW = 60 * 1000; // 1 minuto

console.log('🚀 Iniciando Gemini Chatbot com FALLBACK...');

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const API_KEY = process.env.GEMINI_API_KEY;
const upload = multer({ dest: 'uploads/' });

// Modelos com PRIORIDADE (fallback automático)
const MODEL_PRIORITY = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-001', 
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash-latest'
];

// Pastas
['public', 'uploads'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Rate limit middleware
const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestTimestamps.has(ip)) requestTimestamps.set(ip, []);
  
  const userRequests = requestTimestamps.get(ip);
  const validRequests = userRequests.filter(time => now - time < TIME_WINDOW);
  
  if (validRequests.length >= MAX_REQUESTS) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde 1 minuto.' });
  }
  
  validRequests.push(now);
  requestTimestamps.set(ip, validRequests);
  next();
};

// 🏠 Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 📋 Modelos
app.get('/api/user-info', (req, res) => {
  const rawUsername = process.env.USERNAME || process.env.USER || 'Usuário';
  const formattedUsername = rawUsername
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Usuário';

  res.json({ success: true, username: formattedUsername });
});

// 📋 Modelos
app.get('/api/models', async (req, res) => {
  console.log('🔍 [MODELS] Listando...');
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    const models = data.models
      ?.filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      ?.map(m => ({
        value: m.name.split('/')[1],
        label: m.displayName || m.name.split('/')[1],
        description: m.description
      }))
      ?.slice(0, 15) || [];

    console.log(`✅ [MODELS] ${models.length} modelos`);
    res.json({ models, success: true });
  } catch (error) {
    console.error('❌ [MODELS]', error.message);
    res.status(500).json({ error: 'Erro carregando modelos' });
  }
});

// 💬 Chat com FALLBACK AUTOMÁTICO + RETRY DE CICLOS
app.post('/api/chat', rateLimit, async (req, res) => {
  const { prompt, model: requestedModel, temperature = 0.7 } = req.body;
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const uploadContext = uploadContexts.get(ip) || '';
  const contextPrefix = uploadContext
    ? `Contexto de arquivos enviados pelo usuário:\n${uploadContext}\n\n---\n\n`
    : '';
  const systemInstruction = `
Você é um Assistente de Consulta de Telecomunicações.
Objetivo:
- Responder com precisão e inteligência.
- Ser SEMPRE objetivo e direto.
- NÃO usar frases de abertura genéricas ou repetitivas como: "Com certeza posso te ajudar com isso", "Claro!", "Perfeito!", "Ótima pergunta!".
- Começar já com a resposta útil, sem introduções desnecessárias.
- Associar entidades relevantes quando possível: produtos, serviços, contratos, faturamento, financeiro, centro de custo, cliente e período.
- Caso a pergunta não tenha dados suficientes, NÃO invente: faça perguntas curtas e objetivas para coletar os detalhes faltantes.
- Manter linguagem profissional.
- Quando houver contexto de arquivos, priorizar esses dados e deixar explícito em qual evidência se baseou.
- Para faturas em PDF, extrair e organizar todas as informações disponíveis no documento, incluindo quando existir:
  - fornecedor/operadora, cliente e CNPJ/CPF;
  - número da fatura, período de referência e vencimento;
  - valor total, subtotais, impostos/taxas e descontos;
  - itens cobrados, linhas/serviços e centros de custo.
- Se algum campo não estiver no arquivo, informar explicitamente "não identificado no documento".

Formato recomendado:
1) Resposta direta (linha inicial objetiva)
2) Associações encontradas
3) Próximos passos ou pergunta de esclarecimento (se necessário)
`.trim();

  const finalPrompt = `${systemInstruction}\n\n${contextPrefix}Pergunta do usuário:\n${prompt}`;

  console.log(`💬 [CHAT] Prompt: "${prompt.substring(0, 40)}..." | Modelo solicitado: ${requestedModel} | Contexto: ${uploadContext ? 'SIM' : 'NÃO'}`);

  const MAX_FALLBACK_CYCLES = 3;

  for (let cycle = 1; cycle <= MAX_FALLBACK_CYCLES; cycle++) {
    console.log(`🔁 [CHAT] Iniciando ciclo ${cycle}/${MAX_FALLBACK_CYCLES} de fallback`);

    for (const fallbackModel of MODEL_PRIORITY) {
      try {
        console.log(`🔄 [Ciclo ${cycle}] Tentando modelo: ${fallbackModel}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${API_KEY}`;

        const body = {
          contents: [{ parts: [{ text: finalPrompt }] }],
          generationConfig: {
            temperature: Number(temperature),
            topP: 0.95,
            maxOutputTokens: 2048
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        console.log(`📊 [${fallbackModel}] Status: ${response.status}`);

        if (response.status === 503) {
          console.log(`⚠️ [${fallbackModel}] Sobrecarregado, tentando próximo modelo...`);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [${fallbackModel}]`, errorText.substring(0, 140));
          continue;
        }

        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sem resposta';

        console.log(`✅ [${fallbackModel}] Sucesso no ciclo ${cycle}!`);
        return res.json({
          answer: answer.trim(),
          model: fallbackModel,
          success: true
        });
      } catch (error) {
        console.error(`💥 [${fallbackModel}] Erro no ciclo ${cycle}:`, error.message);
        continue;
      }
    }

    console.warn(`⚠️ [CHAT] Ciclo ${cycle}/${MAX_FALLBACK_CYCLES} finalizado sem sucesso.`);
  }

  console.error('💥 [CHAT] TODOS OS CICLOS/MODELOS FALHARAM');
  res.status(503).json({
    error: 'Isso está demorando mais que o esperado, pedimos desculpas. Tentamos novamente algumas vezes, mas todos os modelos estão indisponíveis no momento.',
    success: false
  });
});

// 📁 Upload
app.post('/api/upload', upload.array('files', 5), async (req, res) => {
  console.log(`📁 [UPLOAD] ${req.files?.length || 0} arquivos recebidos`);
  
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const files = req.files?.map(f => f.originalname) || [];
    const extractedParts = [];

    for (const file of (req.files || [])) {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const fileName = file.originalname || 'arquivo_sem_nome';

      try {
        if (ext === '.xlsx' || ext === '.xls') {
          const workbook = XLSX.readFile(file.path, { cellDates: true });
          const sheetTexts = workbook.SheetNames.map((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const asText = XLSX.utils.sheet_to_csv(sheet);
            return `Arquivo: ${fileName}\nAba: ${sheetName}\nConteúdo:\n${asText.slice(0, 8000)}`;
          });
          extractedParts.push(sheetTexts.join('\n\n'));
        } else if (ext === '.csv' || ext === '.txt') {
          const text = fs.readFileSync(file.path, 'utf8');
          extractedParts.push(`Arquivo: ${fileName}\nConteúdo:\n${text.slice(0, 12000)}`);
        } else if (ext === '.pdf') {
          const pdfBuffer = fs.readFileSync(file.path);
          const pdfData = await pdfParse(pdfBuffer);
          const pdfText = (pdfData.text || '').replace(/\u0000/g, ' ').trim();
          const pageCount = pdfData.numpages || 'desconhecido';

          if (!pdfText) {
            extractedParts.push(`Arquivo: ${fileName}\nTipo: PDF\nPáginas: ${pageCount}\nObservação: Não foi possível extrair texto legível do PDF.`);
          } else {
            extractedParts.push(
              `Arquivo: ${fileName}\nTipo: PDF\nPáginas: ${pageCount}\nConteúdo extraído:\n${pdfText.slice(0, 40000)}`
            );
          }
        } else {
          extractedParts.push(`Arquivo: ${fileName}\nObservação: formato não suportado para extração (${ext || 'desconhecido'}).`);
        }
      } catch (fileError) {
        extractedParts.push(`Arquivo: ${fileName}\nErro ao processar: ${fileError.message}`);
      }
    }

    const mergedContext = extractedParts.join('\n\n====================\n\n').slice(0, 120000);
    uploadContexts.set(ip, mergedContext);

    // Limpeza
    req.files?.forEach(f => {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    });

    res.json({ 
      files, 
      message: `${files.length} arquivos processados. Contexto disponível para o chat.`,
      contextLoaded: true,
      contextSize: mergedContext.length,
      success: true 
    });
  } catch (error) {
    console.error('❌ [UPLOAD]', error);
    res.status(500).json({ error: error.message });
  }
});

// 🌐 Scraping
app.post('/api/scrape', async (req, res) => {
  const { url } = req.body;
  console.log(`🌐 [SCRAPE] ${url}`);
  
  try {
    const response = await axios.get(url, { 
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const $ = cheerio.load(response.data);
    $('script, style, nav, footer').remove();
    
    const title = $('title').text().trim();
    const content = $('body').text().trim().slice(0, 1500);

    res.json({
      title: title || 'Sem título',
      content,
      preview: content.substring(0, 300) + '...',
      success: true
    });
  } catch (error) {
    console.error('❌ [SCRAPE]', error.message);
    res.status(500).json({ error: 'Falha no scraping' });
  }
});

// 🧹 Cleanup
app.delete('/api/cleanup', (req, res) => {
  try {
    if (fs.existsSync('uploads')) {
      fs.rmSync('uploads', { recursive: true, force: true });
      fs.mkdirSync('uploads');
    }
    console.log('🧹 [CLEANUP] Uploads limpos');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🚀 Start
app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(60));
  console.log('🌟 GEMINI 2.5 CHATBOT com FALLBACK AUTOMÁTICO');
  console.log(`📍 http://localhost:${PORT}`);
  console.log('🔄 Modelos: 2.5 Flash → 2.0 Flash → 1.5 Flash');
  console.log('⚡ Rate Limit: 10/minuto');
  console.log('═'.repeat(60) + '\n');
});