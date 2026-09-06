const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Caminhos dos arquivos de dados
const DATA_DIR = path.join(__dirname, 'data');
const LINKS_FILE = path.join(DATA_DIR, 'links.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const METRICS_FILE = path.join(DATA_DIR, 'metrics.json');

// Garantir que o diretório data exista
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Funções utilitárias de leitura e escrita seguras
function readJSON(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJSON(filePath, fallback);
      return fallback;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Erro ao ler arquivo ${filePath}:`, err.message);
    return fallback;
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`Erro ao gravar arquivo ${filePath}:`, err.message);
    return false;
  }
}

// Função para formatar número e criar URL do WhatsApp
function buildWhatsAppUrl(phone, message) {
  if (!phone) return '';
  // Remove caracteres não numéricos
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Se o usuário digitou sem DDI (ex: 11988887777), adiciona DDI do Brasil (55)
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    cleanPhone = '55' + cleanPhone;
  }
  
  const encodedMsg = message ? encodeURIComponent(message) : '';
  return encodedMsg ? `https://wa.me/${cleanPhone}?text=${encodedMsg}` : `https://wa.me/${cleanPhone}`;
}

// Verifica e reinicia contadores diários
function checkDailyReset() {
  const today = new Date().toISOString().slice(0, 10);
  const metrics = readJSON(METRICS_FILE, { totalRedirects: 0, todayRedirects: 0, lastResetDate: today, roundRobinIndex: 0, logs: [] });
  const links = readJSON(LINKS_FILE, []);

  let changed = false;
  if (metrics.lastResetDate !== today) {
    metrics.todayRedirects = 0;
    metrics.lastResetDate = today;
    writeJSON(METRICS_FILE, metrics);

    links.forEach(link => {
      link.todayClicks = 0;
      link.lastResetDate = today;
    });
    writeJSON(LINKS_FILE, links);
  }
}

// ==========================================
// ROTAS DA API
// ==========================================

// Função para mesclar parâmetros UTM/query na URL de destino
function mergeUrlWithQueryParams(originalUrl, queryParams) {
  if (!originalUrl || !queryParams || Object.keys(queryParams).length === 0) {
    return originalUrl;
  }
  try {
    const urlObj = new URL(originalUrl);
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        urlObj.searchParams.set(key, value);
      }
    }
    return urlObj.toString();
  } catch (e) {
    const separator = originalUrl.includes('?') ? '&' : '?';
    const qs = new URLSearchParams(queryParams).toString();
    return qs ? `${originalUrl}${separator}${qs}` : originalUrl;
  }
}

// 1. Obter próximo link para redirecionamento
app.get('/api/redirect/next', (req, res) => {
  checkDailyReset();

  const settings = readJSON(SETTINGS_FILE, {
    redirectDelay: 2000,
    rotationStrategy: 'round-robin',
    fallbackUrl: 'https://wa.me/5511999999999',
    title: 'Por favor, aguarde alguns segundos.',
    subtitle: 'Estamos direcionando você para o WhatsApp.',
    buttonText: 'Clique aqui se não for redirecionado',
    metaPixelId: '',
    googleAnalyticsId: '',
    customHeadScripts: '',
    forwardUtms: true
  });

  const links = readJSON(LINKS_FILE, []);
  const metrics = readJSON(METRICS_FILE, { totalRedirects: 0, todayRedirects: 0, roundRobinIndex: 0, logs: [] });

  // Filtrar links ativos e que não ultrapassaram limite diário (se houver limite)
  const availableLinks = links.filter(link => {
    if (!link.active) return false;
    if (link.dailyLimit && link.dailyLimit > 0 && (link.todayClicks || 0) >= link.dailyLimit) {
      return false;
    }
    return true;
  });

  let selectedLink = null;

  if (availableLinks.length > 0) {
    const strategy = settings.rotationStrategy || 'round-robin';

    if (strategy === 'random') {
      // Sorteio com peso
      const totalWeight = availableLinks.reduce((sum, l) => sum + (Number(l.weight) || 1), 0);
      let randomVal = Math.random() * totalWeight;
      for (const l of availableLinks) {
        randomVal -= (Number(l.weight) || 1);
        if (randomVal <= 0) {
          selectedLink = l;
          break;
        }
      }
      if (!selectedLink) selectedLink = availableLinks[0];
    } else if (strategy === 'priority') {
      // Prioridade: primeiro da lista
      selectedLink = availableLinks[0];
    } else {
      // Round-Robin (Padrão)
      const index = (metrics.roundRobinIndex || 0) % availableLinks.length;
      selectedLink = availableLinks[index];
      metrics.roundRobinIndex = (metrics.roundRobinIndex || 0) + 1;
    }
  }

  // Extrair parâmetros UTM e query params da requisição
  const queryParams = req.query || {};
  const utms = {
    source: queryParams.utm_source || queryParams.src || '',
    medium: queryParams.utm_medium || '',
    campaign: queryParams.utm_campaign || '',
    content: queryParams.utm_content || '',
    term: queryParams.utm_term || '',
    all: queryParams
  };

  // Se nenhum link ativo disponível, usar fallback
  let rawTargetUrl = '';
  let linkId = null;
  let linkName = 'Link de Contingência';

  if (selectedLink) {
    rawTargetUrl = selectedLink.url || buildWhatsAppUrl(selectedLink.phone, selectedLink.message);
    linkId = selectedLink.id;
    linkName = selectedLink.name;

    // Atualizar métricas do link selecionado
    selectedLink.totalClicks = (selectedLink.totalClicks || 0) + 1;
    selectedLink.todayClicks = (selectedLink.todayClicks || 0) + 1;
    writeJSON(LINKS_FILE, links);
  } else {
    rawTargetUrl = settings.fallbackUrl || 'https://web.whatsapp.com';
  }

  // Encaminhar parâmetros UTM na URL final para manter o tracking da plataforma
  const finalTargetUrl = (settings.forwardUtms !== false) 
    ? mergeUrlWithQueryParams(rawTargetUrl, queryParams) 
    : rawTargetUrl;

  // Atualizar métricas globais
  metrics.totalRedirects = (metrics.totalRedirects || 0) + 1;
  metrics.todayRedirects = (metrics.todayRedirects || 0) + 1;

  // Registrar log de acesso (guardando até os últimos 500 acessos)
  const logEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    linkId: linkId,
    linkName: linkName,
    targetUrl: finalTargetUrl,
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
    userAgent: req.headers['user-agent'] || '',
    referer: req.headers['referer'] || '',
    utms: utms
  };

  metrics.logs = [logEntry, ...(metrics.logs || [])].slice(0, 500);
  writeJSON(METRICS_FILE, metrics);

  res.json({
    success: true,
    targetUrl: finalTargetUrl,
    linkName,
    delay: Number(settings.redirectDelay) || 2000,
    title: settings.title || 'Por favor, aguarde alguns segundos.',
    subtitle: settings.subtitle || 'Estamos direcionando você para o WhatsApp.',
    buttonText: settings.buttonText || 'Clique aqui se não for redirecionado',
    metaPixelId: settings.metaPixelId || '',
    googleAnalyticsId: settings.googleAnalyticsId || '',
    customHeadScripts: settings.customHeadScripts || ''
  });
});

// 2. Painel Admin: Listar todos os links
app.get('/api/admin/links', (req, res) => {
  checkDailyReset();
  const links = readJSON(LINKS_FILE, []);
  res.json({ success: true, links });
});

// 3. Painel Admin: Adicionar novo link
app.post('/api/admin/links', (req, res) => {
  const { name, phone, message, active, dailyLimit, weight, url, directUrl } = req.body;
  const targetUrl = (url || directUrl || '').trim();

  if (!name || (!phone && !targetUrl)) {
    return res.status(400).json({ success: false, message: 'Nome e Link/WhatsApp são obrigatórios.' });
  }

  const links = readJSON(LINKS_FILE, []);
  const finalUrl = targetUrl.startsWith('http://') || targetUrl.startsWith('https://') 
    ? targetUrl 
    : buildWhatsAppUrl(phone || targetUrl, message);

  const newLink = {
    id: 'link_' + Date.now(),
    name: name.trim(),
    phone: phone ? phone.trim() : '',
    message: message ? message.trim() : '',
    url: finalUrl,
    active: active !== undefined ? Boolean(active) : true,
    dailyLimit: Number(dailyLimit) || 0,
    weight: Number(weight) || 1,
    totalClicks: 0,
    todayClicks: 0,
    lastResetDate: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  };

  links.push(newLink);
  writeJSON(LINKS_FILE, links);

  res.json({ success: true, link: newLink, message: 'Link cadastrado com sucesso!' });
});

// 4. Painel Admin: Atualizar link
app.put('/api/admin/links/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, message, active, dailyLimit, weight, url, directUrl } = req.body;

  const links = readJSON(LINKS_FILE, []);
  const index = links.findIndex(l => l.id === id);

  if (index === -1) {
    return res.status(400).json({ success: false, message: 'Link não encontrado.' });
  }

  const targetUrl = (url !== undefined ? url : directUrl);
  let finalUrl = links[index].url;
  
  if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
    finalUrl = targetUrl.trim();
  } else if (phone || message !== undefined) {
    finalUrl = buildWhatsAppUrl(phone || links[index].phone, message !== undefined ? message : links[index].message);
  }

  links[index] = {
    ...links[index],
    name: name ? name.trim() : links[index].name,
    phone: phone !== undefined ? phone.trim() : links[index].phone,
    message: message !== undefined ? message.trim() : links[index].message,
    url: finalUrl,
    active: active !== undefined ? Boolean(active) : links[index].active,
    dailyLimit: dailyLimit !== undefined ? Number(dailyLimit) : links[index].dailyLimit,
    weight: weight !== undefined ? Number(weight) : links[index].weight,
    updatedAt: new Date().toISOString()
  };

  writeJSON(LINKS_FILE, links);
  res.json({ success: true, link: links[index], message: 'Link atualizado com sucesso!' });
});

// 5. Painel Admin: Alternar status Ativo/Desativado
app.patch('/api/admin/links/:id/toggle', (req, res) => {
  const { id } = req.params;
  const links = readJSON(LINKS_FILE, []);
  const link = links.find(l => l.id === id);

  if (!link) {
    return res.status(404).json({ success: false, message: 'Link não encontrado.' });
  }

  link.active = !link.active;
  writeJSON(LINKS_FILE, links);

  res.json({ success: true, active: link.active, link, message: `Link ${link.active ? 'ativado' : 'desativado'} com sucesso!` });
});

// 6. Painel Admin: Deletar link
app.delete('/api/admin/links/:id', (req, res) => {
  const { id } = req.params;
  let links = readJSON(LINKS_FILE, []);
  const initialLength = links.length;
  links = links.filter(l => l.id !== id);

  if (links.length === initialLength) {
    return res.status(404).json({ success: false, message: 'Link não encontrado.' });
  }

  writeJSON(LINKS_FILE, links);
  res.json({ success: true, message: 'Link removido com sucesso!' });
});

// 7. Painel Admin: Estatísticas e Métricas detalhadas
app.get('/api/admin/stats', (req, res) => {
  checkDailyReset();

  const links = readJSON(LINKS_FILE, []);
  const metrics = readJSON(METRICS_FILE, { totalRedirects: 0, todayRedirects: 0, logs: [] });

  const activeLinks = links.filter(l => l.active).length;
  const inactiveLinks = links.length - activeLinks;

  // Agrupar UTMs mais frequentes
  const utmSources = {};
  const utmCampaigns = {};

  (metrics.logs || []).forEach(log => {
    if (log.utms) {
      const src = log.utms.source || 'Direto / Sem UTM';
      utmSources[src] = (utmSources[src] || 0) + 1;

      if (log.utms.campaign) {
        utmCampaigns[log.utms.campaign] = (utmCampaigns[log.utms.campaign] || 0) + 1;
      }
    }
  });

  res.json({
    success: true,
    totalRedirects: metrics.totalRedirects || 0,
    todayRedirects: metrics.todayRedirects || 0,
    totalLinks: links.length,
    activeLinks,
    inactiveLinks,
    links,
    utmSources,
    utmCampaigns,
    recentLogs: (metrics.logs || []).slice(0, 50)
  });
});

// 8. Painel Admin: Configurações Gerais
app.get('/api/admin/settings', (req, res) => {
  const settings = readJSON(SETTINGS_FILE, {});
  res.json({ success: true, settings });
});

app.post('/api/admin/settings', (req, res) => {
  const currentSettings = readJSON(SETTINGS_FILE, {});
  const updated = {
    ...currentSettings,
    ...req.body
  };
  writeJSON(SETTINGS_FILE, updated);
  res.json({ success: true, settings: updated, message: 'Configurações salvas com sucesso!' });
});

// 9. Painel Admin: Resetar Métricas
app.post('/api/admin/reset-stats', (req, res) => {
  const links = readJSON(LINKS_FILE, []);
  links.forEach(l => {
    l.totalClicks = 0;
    l.todayClicks = 0;
  });
  writeJSON(LINKS_FILE, links);

  const metrics = {
    totalRedirects: 0,
    todayRedirects: 0,
    lastResetDate: new Date().toISOString().slice(0, 10),
    roundRobinIndex: 0,
    logs: []
  };
  writeJSON(METRICS_FILE, metrics);

  res.json({ success: true, message: 'Estatísticas zeradas com sucesso!' });
});

// 10. Painel Admin: Exportar e Importar Backup
app.get('/api/admin/export', (req, res) => {
  const backup = {
    settings: readJSON(SETTINGS_FILE, {}),
    links: readJSON(LINKS_FILE, []),
    metrics: readJSON(METRICS_FILE, {}),
    exportedAt: new Date().toISOString()
  };
  res.setHeader('Content-disposition', 'attachment; filename=whatsapp-rotator-backup.json');
  res.setHeader('Content-type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

app.post('/api/admin/import', (req, res) => {
  const { settings, links, metrics } = req.body;
  if (settings) writeJSON(SETTINGS_FILE, settings);
  if (links && Array.isArray(links)) writeJSON(LINKS_FILE, links);
  if (metrics) writeJSON(METRICS_FILE, metrics);

  res.json({ success: true, message: 'Backup restaurado com sucesso!' });
});

// 11. Autenticação Simples (PIN / Senha)
app.post('/api/admin/auth', (req, res) => {
  const { pin } = req.body;
  const settings = readJSON(SETTINGS_FILE, { adminPin: 'admin123', requireAuth: false });

  if (!settings.requireAuth || pin === settings.adminPin) {
    return res.json({ success: true, message: 'Autenticado com sucesso!' });
  }

  res.status(401).json({ success: false, message: 'Senha ou PIN incorreto.' });
});

// Servir arquivos estáticos do Frontend
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));
app.use(express.static(path.join(__dirname, 'public')));

// Fallback SPA
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Servidor de Redirecionamento WhatsApp Ativo!`);
  console.log(`🔗 Tela Pública de Redirecionamento: http://localhost:${PORT}`);
  console.log(`⚙️  Painel Administrativo:            http://localhost:${PORT}/admin`);
  console.log(`====================================================`);
});
