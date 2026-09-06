# 🚀 WhatsApp Traffic Redirector & Rotator (Rotacionador de Tráfego de WhatsApp)

Sistema profissional de **Redirecionamento, Rotação e Gestão de Tráfego de WhatsApp** com tela pública de carregamento e **Painel Administrativo** para cadastro, ativação/desativação em tempo real, controle de limites e rastreamento de campanhas (UTMs e Pixels).

---

## 🌟 Recursos Principais

### 1. 📱 Tela de Redirecionamento Pública (`/`)
- **Fiel ao design moderno do WhatsApp** (idêntico à referência visual).
- **Animação fluida de carregamento** com spinner verde WhatsApp e barra de progresso.
- **Preservação e captura de parâmetros UTM** (`utm_source`, `utm_campaign`, `utm_medium`, `utm_content`, `utm_term`, `src`, `fbclid`, `gclid`).
- **Disparo de Pixels**: Suporte nativo ao **Meta Pixel (Facebook Ads)** e **Google Analytics 4 / Google Tag Manager** antes de disparar o redirect.
- **Botão de Contingência (Fallback)** para garantir que o usuário não fique preso caso o navegador bloqueie o redirect automático.

### 2. ⚙️ Painel de Controle Administrativo (`/admin`)
- **Gestão de Links e Atendentes**:
  - Cadastro de números com DDD/DDI, nome do atendente e mensagem inicial personalizada.
  - **Botão Liga/Desliga Instantâneo**: Desative um número e o tráfego é redistribuído na hora para os demais atendentes ativos.
  - **Limite Diário de Cliques**: Desativação inteligente automática ao atingir a meta do dia.
  - **QR Code e Teste Rápido** para cada link cadastrado.
- **Estratégias de Rotação Inteligente**:
  - 🔄 **Round-Robin (Revezamento Circular)**: 1 lead para cada atendente sequencialmente (100% igualitário).
  - 🎲 **Aleatório Balanceado**: Sorteio ponderado por pesos.
  - 🥇 **Prioridade / Transbordo (Failover)**: Enche o primeiro atendente até seu limite antes de enviar para o próximo.
- **Link de Backup Geral**: Garante que seus anúncios nunca percam vendas, mesmo se todos os atendentes forem desativados.
- **Relatório de UTMs & Histórico**:
  - Gráficos de distribuição de cliques por atendente.
  - Tabela com origens de tráfego mais frequentes (`utm_source`, `utm_campaign`).
  - Logs detalhados dos últimos acessos em tempo real.
- **Backup & Restauração**: Exporte e importe todos os dados com 1 clique em formato JSON.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)

### Passo a Passo:

1. Abra o terminal na pasta do projeto e instale as dependências (se ainda não instalou):
```bash
npm install
```

2. Inicie o servidor:
```bash
npm start
```

3. Acesse nos navegadores:
- **Página de Redirecionamento (Link dos Anúncios)**: [http://localhost:3000](http://localhost:3000)
- **Painel de Controle**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🎯 Exemplos de Uso com Tráfego Pago (Facebook / Google Ads)

Envie o tráfego dos seus anúncios diretamente para a sua URL com as UTMs configuradas:

```
https://seusite.com.br/?utm_source=facebook&utm_campaign=black_friday&utm_medium=stories
```

O sistema irá:
1. Identificar o próximo atendente ativo na rotação.
2. Contabilizar o clique e registrar as UTMs no painel.
3. Disparar o evento de `Lead` e `PageView` no Pixel do Facebook / Google.
4. Abrir o WhatsApp do atendente com a mensagem personalizada configurada.

---

## 📦 Estrutura de Arquivos

```
├── data/                      # Armazenamento persistente (JSON)
│   ├── links.json             # Lista de números cadastrados
│   ├── settings.json          # Configurações gerais e Pixels
│   └── metrics.json           # Contadores e logs de acessos
├── public/                    # Frontend Público de Redirecionamento
│   ├── index.html
│   ├── css/redirect.css
│   └── js/redirect.js
├── public/admin/              # Painel de Controle SPA
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
├── server.js                  # Servidor Express & API REST
├── package.json
└── README.md
```

---

## 🌐 Publicação em Produção (Deploy)

Você pode publicar esta aplicação facilmente em plataformas como:
- **VPS / DigitalOcean / Linode / AWS EC2**: Usando `PM2` (`pm2 start server.js --name whatsapp-rotator`).
- **Render / Railway**: Conecte seu repositório GitHub e use `npm start`.
- **cPanel / Plesk**: Crie uma aplicação Node.js apontando para `server.js`.
