(async function() {
  const currentParams = window.location.search;
  const progressBar = document.getElementById('progressBar');
  const redirectTitle = document.getElementById('redirectTitle');
  const redirectSubtitle = document.getElementById('redirectSubtitle');
  const actionFallback = document.getElementById('actionFallback');
  const manualRedirectBtn = document.getElementById('manualRedirectBtn');
  const btnText = document.getElementById('btnText');

  let targetUrl = '';
  let delay = 2000;

  try {
    // 1. Chamar a API backend para obter o próximo link da rotação
    const response = await fetch(`/api/redirect/next${currentParams}`);
    const data = await response.json();

    if (data.success) {
      targetUrl = data.targetUrl;
      delay = data.delay !== undefined ? data.delay : 2000;

      if (data.title) redirectTitle.textContent = data.title;
      if (data.subtitle) redirectSubtitle.textContent = data.subtitle;
      if (data.buttonText) btnText.textContent = data.buttonText;

      // Configurar botão manual
      manualRedirectBtn.href = targetUrl;

      // 2. Injeção de Meta Pixel se configurado
      if (data.metaPixelId) {
        injectMetaPixel(data.metaPixelId);
      }

      // 3. Injeção de Google Tag / Analytics se configurado
      if (data.googleAnalyticsId) {
        injectGoogleAnalytics(data.googleAnalyticsId);
      }

      // 4. Injeção de scripts customizados no head se houver
      if (data.customHeadScripts) {
        try {
          const div = document.createElement('div');
          div.innerHTML = data.customHeadScripts;
          Array.from(div.children).forEach(el => document.head.appendChild(el));
        } catch(e) {
          console.warn('Erro ao injetar script customizado:', e);
        }
      }
    }
  } catch (err) {
    console.error('Erro ao conectar com API de redirecionamento:', err);
    targetUrl = 'https://web.whatsapp.com';
    manualRedirectBtn.href = targetUrl;
  }

  // 5. Animação da barra de progresso
  const startTime = Date.now();
  const progressInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const percentage = Math.min(100, Math.round((elapsed / delay) * 100));
    progressBar.style.width = percentage + '%';

    if (percentage >= 100) {
      clearInterval(progressInterval);
    }
  }, 30);

  // 6. Exibir botão de contingência caso o redirecionamento demore ou seja bloqueado
  setTimeout(() => {
    actionFallback.style.display = 'block';
  }, Math.min(delay + 800, 3000));

  // 7. Executar redirecionamento ao final do delay
  setTimeout(() => {
    if (targetUrl) {
      // Tentar redirecionamento direto
      window.location.href = targetUrl;
    }
  }, delay);

  // Funções de injeção de Pixels
  function injectMetaPixel(pixelId) {
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', pixelId);
    fbq('track', 'PageView');
    fbq('track', 'Lead');
  }

  function injectGoogleAnalytics(gaId) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', gaId);
    gtag('event', 'generate_lead');
  }
})();
