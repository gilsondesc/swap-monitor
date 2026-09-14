# Swap Monitor

**Monitor de cotações DEPIX (Liquid) → USDG (Arbitrum)**

Compara os preços entre SideShift e DeFlow em tempo real, armazena histórico, calcula estatísticas e exibe um dashboard web local.

> ⚠️ **Este sistema é SOMENTE MONITORAMENTO.**  
> Não executa swaps. Não envia DEPIX. Não cria ordens. Não movimenta carteiras.  
> Não solicita nem armazena seed phrase ou chave privada.

---

## Índice

1. [Requisitos](#1-requisitos)
2. [Instalação](#2-instalação)
3. [Configuração](#3-configuração)
4. [Modo Mock](#4-modo-mock)
5. [Modo Real](#5-modo-real)
6. [Estrutura do Projeto](#6-estrutura-do-projeto)
7. [Como Iniciar](#7-como-iniciar)
8. [Como Rodar Testes](#8-como-rodar-testes)
9. [Como Adicionar um Novo Provider](#9-como-adicionar-um-novo-provider)
10. [Como Alterar o Valor Monitorado](#10-como-alterar-o-valor-monitorado)
11. [Como Alterar o Intervalo](#11-como-alterar-o-intervalo)
12. [API REST](#12-api-rest)
13. [Status da Integração DeFlow](#13-status-da-integração-deflow)
14. [Segurança](#14-segurança)
15. [Produção / VPS](#15-produção--vps)

---

## 1. Requisitos

- **Node.js** 22 LTS ou superior (mínimo 22.5.0 para suporte a `node:sqlite` nativo)
- **npm** 10+
- Linux (Ubuntu/Debian) para VPS, ou Windows/macOS para desenvolvimento local

---

## 2. Instalação

```bash
git clone <repo-url> swap-monitor
cd swap-monitor
npm install
```

---

## 3. Configuração

Copie o arquivo de exemplo e edite conforme necessário:

```bash
copy .env.example .env
```

Principais variáveis:

| Variável | Padrão | Descrição |
|---|---|---|
| `MOCK_MODE` | `true` | Usa cotações simuladas (sem APIs reais) |
| `MONITOR_AMOUNT` | `1000` | Quantidade de DEPIX monitorada |
| `QUOTE_INTERVAL_SECONDS` | `300` | Intervalo entre consultas (segundos) |
| `PORT` | `3000` | Porta do servidor local |
| `SIDESHIFT_ENABLED` | `true` | Ativa integração SideShift |
| `SIDESHIFT_API_KEY` | *(vazio)* | API key SideShift (opcional) |
| `DEFLOW_ENABLED` | `false` | Integração DeFlow (pendente de validação) |
| `DATABASE_PATH` | `./data/swap-monitor.db` | Caminho do banco SQLite |
| `TELEGRAM_ENABLED` | `false` | Alertas Telegram (desabilitado) |

---

## 4. Modo Mock

O modo mock permite testar o dashboard **sem precisar de APIs reais**:

```env
# .env
MOCK_MODE=true
```

Em modo mock:
- Cotações são geradas localmente com variações realistas
- SideShift e DeFlow simulam dados válidos
- Timestamps são reais
- O banco SQLite é populado normalmente
- Todos os cálculos e gráficos funcionam

Para iniciar em modo mock:

```bash
npm run dev
```

Acesse: **http://localhost:3000**

---

## 5. Modo Real

Para consultar a API real da SideShift:

```env
# .env
MOCK_MODE=false
SIDESHIFT_ENABLED=true
SIDESHIFT_API_KEY=sua_api_key_aqui   # opcional, mas recomendado
```

> A API key da SideShift pode ser obtida em: https://sideshift.ai/affiliate  
> Sem API key, o endpoint público de pares ainda funciona para rate/min/max.

Para DeFlow: veja a seção [Status da Integração DeFlow](#13-status-da-integração-deflow).

---

## 6. Estrutura do Projeto

```
swap-monitor/
├── src/
│   ├── config/           # Configuração central (dotenv)
│   ├── database/         # SQLite — schema, migrations, helpers
│   ├── providers/
│   │   ├── sideshift/    # client.ts, parser.ts, types.ts
│   │   └── deflow/       # client.ts, parser.ts, types.ts (pending)
│   ├── services/
│   │   ├── quote-monitor.ts      # Loop de coleta
│   │   ├── comparison.service.ts # Melhor provedor
│   │   ├── statistics.service.ts # Médias, melhor, pior
│   │   └── scoring.service.ts    # Score 0-100
│   ├── api/              # Express + rotas REST
│   ├── dashboard/        # HTML + CSS + JS (frontend)
│   ├── mock/             # Gerador de cotações simuladas
│   ├── alerts/           # Telegram (desabilitado por padrão)
│   └── index.ts          # Entry point
├── tests/                # Testes Vitest
├── data/                 # Banco SQLite (gitignored)
├── .env.example          # Exemplo de configuração
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 7. Como Iniciar

**Desenvolvimento (com hot-reload):**

```bash
npm run dev
```

**Build de produção:**

```bash
npm run build
npm start
```

**Inicializar apenas o banco:**

```bash
npm run db:init
```

Após iniciar, acesse: **http://localhost:3000**

---

## 8. Como Rodar Testes

```bash
# Todos os testes (sem APIs reais)
npm test

# Modo watch (re-executa ao salvar)
npm run test:watch

# Com cobertura
npm run test:coverage
```

Os testes cobrem:
- Cálculo de rate (effective_rate = quoted_amount / source_amount)
- Comparação entre providers (melhor quoted_amount final)
- Médias 1h, 6h, 24h
- Score 0–100 e classificações
- Parser SideShift (valid, error, sem rate)
- Provider indisponível (não quebra o sistema)
- Resposta inválida / null / zero
- Casas decimais longas
- Segurança: API key não aparece no rawResponse

---

## 9. Como Adicionar um Novo Provider

1. Criar a pasta `src/providers/novo-provider/`
2. Criar `types.ts`, `parser.ts`, `client.ts`
3. O `client.ts` deve exportar `fetchNovoPoviderQuote(amount): Promise<...>`
4. O tipo retornado deve ter os campos compatíveis com `QuoteRow` do banco
5. Adicionar chamada em `src/services/quote-monitor.ts`
6. Adicionar variáveis no `.env.example`
7. Adicionar seed em `src/database/db.ts` (função `seedProviders`)

---

## 10. Como Alterar o Valor Monitorado

No `.env`:

```env
MONITOR_AMOUNT=500
```

Valores sugeridos para futura versão com múltiplos amounts:
`100`, `500`, `1000`, `2500`, `5000`

---

## 11. Como Alterar o Intervalo

No `.env`:

```env
QUOTE_INTERVAL_SECONDS=60   # 1 minuto
QUOTE_INTERVAL_SECONDS=300  # 5 minutos (padrão)
QUOTE_INTERVAL_SECONDS=600  # 10 minutos
```

---

## 12. API REST

Todos os endpoints são GET, somente leitura, sem autenticação.

| Endpoint | Descrição |
|---|---|
| `GET /api/status` | Status do sistema |
| `GET /api/providers` | Lista e status dos providers |
| `GET /api/quotes/latest` | Última cotação de cada provider |
| `GET /api/quotes/history?hours=24&provider=sideshift` | Histórico |
| `GET /api/comparison` | Comparação atual com scores |
| `GET /api/stats` | Estatísticas 1h/6h/24h |
| `GET /api/config` | Configuração pública (sem secrets) |

---

## 13. Status da Integração DeFlow

**Situação atual: `PENDING_VALIDATION`**

A pesquisa realizada antes da implementação **não encontrou documentação pública** de uma API "DeFlow" para o par `DEPIX (Liquid) → USDG (Arbitrum)`.

O que encontramos:
- **DFlow (dflow.net):** Opera na rede Solana. Não relacionado ao par DEPIX/Liquid.
- **SideSwap:** Exchange Liquid com API WebSocket (JSON-RPC v2.0). Diferente do solicitado.

**Para ativar a integração DeFlow, é necessário:**

1. Confirmar o URL/domínio exato da plataforma "DeFlow"
2. Identificar o endpoint de cotação (GET ou POST `/quote`)
3. Confirmar identificadores: DEPIX na rede Liquid, USDG na rede Arbitrum
4. Confirmar modelo de autenticação
5. Implementar `src/providers/deflow/client.ts` e `parser.ts`
6. Configurar no `.env`:
   ```env
   DEFLOW_ENABLED=true
   DEFLOW_API_BASE_URL=https://...
   DEFLOW_API_KEY=...
   ```

O adaptador `DeFlowProvider` está criado e pronto para receber a implementação.

---

## 14. Segurança

- ✅ Nenhuma execução de swap
- ✅ Nenhum envio de DEPIX
- ✅ Nenhuma chave privada ou seed phrase
- ✅ Secrets apenas em variáveis de ambiente
- ✅ `.env` no `.gitignore`
- ✅ API key nunca aparece em logs ou no banco
- ✅ `raw_response` gravado sem secrets

---

## 15. Produção / VPS

> 🔒 **REGRA DE ISOLAMENTO TOTAL:**  
> O Swap Monitor é um serviço 100% autônomo. Ele **NÃO** compartilha banco de dados, variáveis de ambiente, portas, Redis ou processos com o sistema `Gerenciador` existente na VPS. O diretório `/root/automacao` e o processo PM2 `gerenciador-api` não são tocados.

### 15.1. Requisitos do Servidor VPS
- **Sistema Operacional:** Linux (Ubuntu 22.04 / 24.04 LTS ou Debian 12)
- **Node.js:** `>= 22.5.0` (definido no arquivo `.nvmrc`). O suporte ao SQLite nativo (`DatabaseSync`) exige Node 22+.
- **PM2:** Instalado globalmente (`npm install -g pm2`)

### 15.2. Estrutura de Diretórios na VPS
```
/root/
├── automacao/              ← NÃO TOCAR (Projeto Gerenciador)
│
└── swap-monitor/           ← PROJETO ISOLADO
    ├── .env                ← Configurações e secrets próprios
    ├── .nvmrc              ← Versão Node.js 22
    ├── ecosystem.config.js ← Configuração PM2 (fork, 1 instância)
    ├── data/
    │   └── swap-monitor.db ← Banco SQLite próprio (WAL)
    ├── backups/            ← Backups diários com retenção de 30 dias
    ├── dist/               ← Build de produção compilado
    │   ├── index.js
    │   └── dashboard/      ← Frontend servido estaticamente
    ├── logs/               ← Logs do PM2
    └── scripts/
        ├── backup.sh       ← Script de backup WAL consistente
        ├── copy-assets.js  ← Copiador de assets para dist/
        └── deploy.sh       ← Script de atualização do projeto
```

### 15.3. Instalação e Configuração Passo a Passo na VPS

1. **Clonar o repositório em `/root/swap-monitor`:**
   ```bash
   cd /root
   git clone <repo-url> swap-monitor
   cd swap-monitor
   ```

2. **Garantir Node.js 22 LTS ativo:**
   ```bash
   nvm use || nvm install 22
   node -v  # Deve exibir v22.x ou superior
   ```

3. **Configurar as Variáveis de Ambiente:**
   ```bash
   cp .env.example .env
   nano .env
   ```
   *Configurações essenciais para produção:*
   ```env
   NODE_ENV=production
   PORT=3100
   MOCK_MODE=false
   QUOTE_INTERVAL_SECONDS=300
   DATABASE_PATH=./data/swap-monitor.db
   ```

4. **Instalar Dependências e Compilar:**
   ```bash
   npm ci
   npm run build
   ```
   *O comando `npm run build` compila o TypeScript (`tsc`) e copia automaticamente o dashboard para `dist/dashboard`.*

5. **Iniciar com PM2:**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   ```

6. **Verificar Status e Logs:**
   ```bash
   pm2 status swap-monitor
   pm2 logs swap-monitor
   ```

7. **Testar Health Check:**
   ```bash
   curl http://127.0.0.1:3100/health
   # Resposta esperada:
   # {"status":"ok","uptime":10,"timestamp":"...","environment":"production","database":"ok"}
   ```

### 15.4. Backup do Banco de Dados
O script `scripts/backup.sh` realiza backups atômicos consistentes com o modo WAL do SQLite e remove backups com mais de 30 dias:

```bash
# Execução manual:
bash scripts/backup.sh

# Agendar no crontab da VPS (diariamente às 03:00):
# 0 3 * * * /bin/bash /root/swap-monitor/scripts/backup.sh >> /root/swap-monitor/logs/cron-backup.log 2>&1
```

*Para restaurar um backup:*
```bash
pm2 stop swap-monitor
cp /root/swap-monitor/backups/monitor_YYYYMMDD_HHMMSS.db /root/swap-monitor/data/swap-monitor.db
pm2 start swap-monitor
```

### 15.5. Atualização / Deploy Contínuo
O script `scripts/deploy.sh` automatiza o ciclo de atualização na VPS de forma segura:

```bash
cd /root/swap-monitor
bash scripts/deploy.sh
```

### 15.6. Configuração Futura de Nginx (Proxy Reverso)
Quando o domínio for configurado, adicionar um bloco de servidor independente no Nginx:

```nginx
server {
    listen 80;
    server_name swap.seudominio.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

*Swap Monitor V1 — apenas monitoramento de cotações.*
