skyp
# 🚀 Assistente Telecom IA (Gemini Chatbot)

Aplicação web com interface moderna + API Node.js para chat com modelos Gemini, enriquecimento por upload de arquivos e scraping de páginas.

---

## ✨ Visão geral

O projeto combina:

- **Frontend web** (chat estilo GPT, histórico local, tema claro/escuro);
- **Backend Express** com:
  - fallback automático entre modelos Gemini;
  - upload e extração de contexto por IP;
  - scraping básico;
  - limpeza de uploads.

Também inclui um **launcher em Python (`launcher.py`)** para facilitar a inicialização e encerramento do ambiente.

---

## ✅ Funcionalidades principais

### Backend (API)

- **Chat com fallback automático de modelos**
  - Prioridade atual:
    1. `gemini-2.5-flash`
    2. `gemini-2.0-flash-001`
    3. `gemini-2.0-flash`
    4. `gemini-flash-latest`
    5. `gemini-1.5-flash-latest`
  - Até **3 ciclos** completos de tentativa.
- **Rate limit por IP**
  - **10 requisições/minuto** no endpoint `/api/chat`.
- **Upload com extração de contexto**
  - Até **5 arquivos** por requisição.
  - Suporta: `.xlsx`, `.xls`, `.csv`, `.txt`, `.pdf`.
  - Contexto consolidado por IP (memória), com limite aproximado de **120.000 chars**.
- **Scraping de páginas**
  - Remove elementos não essenciais e retorna título + conteúdo resumido.
- **Porta dinâmica**
  - `process.env.PORT || 3000`.
- **Info do usuário**
  - `/api/user-info` com nome formatado baseado no ambiente.

### Frontend (UI)

- Multi-chat com histórico persistido em `localStorage`;
- Alternância de tema claro/escuro;
- Botões de ação rápida;
- Renderização Markdown nas respostas;
- Ações na mensagem da IA: copiar, regenerar, feedback 👍/👎;
- Indicador de digitação e aviso de lentidão.

---

## 🧰 Stack

**Node.js / API**
- express, dotenv, cors, node-fetch, multer, axios, cheerio, xlsx, pdf-parse

**Frontend**
- HTML, CSS, JavaScript vanilla

**Launcher**
- Python 3 + `psutil`

---

## 📁 Estrutura do projeto

```text
.
├── server.js
├── launcher.py
├── executar.bat
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
├── TODO.md
├── public/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── uploads/
├── testdata/
│   ├── broken.pdf
│   ├── chat.json
│   ├── sample.csv
│   ├── sample.txt
│   └── scrape.json
├── test-chat.json
└── test-scrape.json
```

---

## ⚙️ Pré-requisitos

- **Node.js 18+**
- **npm**
- (Opcional, para launcher) **Python 3.10+**

---

## 🔐 Configuração de ambiente

Crie o arquivo `.env` na raiz:

```env
GEMINI_API_KEY=sua_chave_aqui
# opcional
# PORT=4010
```

Se `PORT` não for definida, a aplicação usa `3000`.

---

## ▶️ Inicialização rápida

### Opção A — Node direto

```bash
npm install
npm start
```

### Opção B — Script batch (Windows)

```cmd
executar.bat
```

### Opção C — Launcher Python (recomendado para fluxo guiado)

```bash
pip install psutil
python launcher.py
```

---

## 🐍 Novo arquivo: `launcher.py`

O `launcher.py` automatiza a execução local:

1. inicia o servidor com `npm start`;
2. aguarda ~3 segundos;
3. abre `public/index.html` no navegador padrão;
4. mantém monitoramento do processo Node;
5. ao encerrar, finaliza processo pai e filhos com `psutil`.

### Observações do launcher

- Usa `shell=True` para localizar `npm` no ambiente Windows.
- Abre o arquivo local `public/index.html` via `file://`.
- Requer `psutil` instalado no Python em uso.

### Instalação da dependência Python

```bash
pip install psutil
```

### Limitações atuais

- O launcher abre o HTML local, não uma URL HTTP diretamente.
- O tempo fixo de espera (3s) pode variar conforme máquina/ambiente.

---

## 🌐 Endpoints da API

### `GET /`
Retorna a interface web.

### `GET /api/user-info`
Retorna nome do usuário formatado.

### `GET /api/models`
Lista modelos Gemini disponíveis.

### `POST /api/chat`
Envia prompt para geração com fallback de modelos.

Exemplo body:
```json
{
  "prompt": "Resumo da fatura anexada",
  "model": "gemini-2.5-flash",
  "temperature": 0.7
}
```

### `POST /api/upload`
Upload de até 5 arquivos em `files` (form-data) para gerar contexto.

### `POST /api/scrape`
Exemplo body:
```json
{ "url": "https://example.com" }
```

### `DELETE /api/cleanup`
Limpa a pasta `uploads/`.

---

## 🧪 Testes rápidos (manual)

PowerShell:
```powershell
$env:PORT=4010; npm start
curl.exe -i http://localhost:4010/api/user-info
```

---

## ⚠️ Limitações e notas importantes

- Contexto de upload fica **em memória por IP** (não persistente).
- Reiniciar servidor limpa contextos.
- Frontend tenta `DELETE /api/memory` ao limpar chat, mas esse endpoint não existe no backend atual.
- PDFs escaneados podem não ter texto extraível.

---

## 🛠️ Troubleshooting

- **429 / quota Gemini**: validar billing/limites da chave.
- **Porta em uso**: definir outra porta em `PORT`.
- **Sem resposta útil**: confirmar upload/contexto antes do chat.
- **Erro no launcher**:
  - verificar Python e `psutil`;
  - validar que `npm start` funciona manualmente no terminal.
