/* ============================================
   PureSearch · Bing 搜索结果注入脚本 (动态规则版)
   ============================================ */

(function () {
  'use strict';

  let SOFTWARE_DB = [];
  let GLOBAL_FAKE_DOMAINS = [];

  function extractDomain(url) { 
    try { 
      const u = new URL(url); 
      return u.hostname.replace(/^www\./, ''); 
    } catch { 
      return ''; 
    } 
  }
  
  function domainMatches(hostname, domainList) { 
    if (!domainList || !Array.isArray(domainList) || !hostname) return false;
    // 移除了危险的 d.includes(hostname) 以防止误杀
    return domainList.some(d => hostname === d || hostname.endsWith('.' + d)); 
  }

  function classifyUrl(url) {
    const hostname = extractDomain(url);
    if (!hostname) return null;
    
    // Bing 的相关搜索、内部链接等不应被处理
    if (hostname.includes('bing.com') || hostname.includes('bingj.com')) return null;

    if (domainMatches(hostname, GLOBAL_FAKE_DOMAINS)) return { type: 'global_fake', software: null, domain: hostname };
    
    for (const sw of SOFTWARE_DB) {
      if (domainMatches(hostname, sw.official_domains || [])) return { type: 'official', software: sw, domain: hostname };
      if (domainMatches(hostname, sw.known_fakes || [])) return { type: 'fake', software: sw, domain: hostname };
    }
    return null;
  }

  function createOfficialBadge(softwareName) {
    const badge = document.createElement('div');
    badge.className = 'ps-badge ps-badge-official';
    badge.innerHTML = `<span class="ps-badge-icon">✅</span><span class="ps-badge-text"><strong>官方正版</strong> · ${softwareName} 官方网站</span>`;
    return badge;
  }

  function createFakeOverlay(softwareName, officialDomains) {
    const overlay = document.createElement('div');
    overlay.className = 'ps-overlay ps-overlay-fake';
    const safeUrl = officialDomains && officialDomains.length > 0 ? 'https://' + officialDomains[0] : '#';
    overlay.innerHTML = `
      <div class="ps-overlay-content" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="ps-overlay-icon">🚫</span>
          <span class="ps-overlay-text"><strong>假冒标记</strong> · 疑似假冒 <em>${softwareName}</em> 的盗版网站</span>
          <a href="${safeUrl}" class="ps-overlay-link" target="_blank">前往正版官网 →</a>
          <button class="ps-report-btn ps-report-inline" data-url="">🚩 举报</button>
        </div>
        <button class="ps-expand-btn" style="background:none; border:none; color:#999; cursor:pointer; font-size:12px; text-decoration:underline; margin-left: 10px;">继续访问原网页</button>
      </div>
    `;
    return overlay;
  }

  function createGrayWarning() {
    const bar = document.createElement('div');
    bar.className = 'ps-overlay ps-overlay-gray';
    bar.innerHTML = `<div class="ps-overlay-content"><span class="ps-overlay-icon">⚠️</span><span class="ps-overlay-text"><strong>第三方下载站</strong> · 可能捆绑不必要的软件，建议从官网下载</span></div>`;
    return bar;
  }

  function processSearchResults() {
    const resultsList = document.getElementById('b_results');
    if (!resultsList) return;
    const items = resultsList.querySelectorAll('li.b_algo');
    if (!items.length) return;

    let stats = { official: 0, fake: 0 };
    const officialItems = [];

    items.forEach(item => {
      if (item.dataset.psProcessed) return;
      item.dataset.psProcessed = 'true';
      
      const link = item.querySelector('h2 a');
      if (!link) return;
      const url = link.href;
      
      const cls = classifyUrl(url);
      if (!cls) return;

      switch (cls.type) {
        case 'official':
          item.classList.add('ps-result-official');
          item.prepend(createOfficialBadge(cls.software.name));
          officialItems.push(item);
          stats.official++;
          break;
        case 'fake':
          item.classList.add('ps-result-fake');
          const overlay = createFakeOverlay(cls.software.name, cls.software.official_domains);
          const rb = overlay.querySelector('.ps-report-inline');
          if (rb) rb.dataset.url = url;

          const originalChildren = Array.from(item.children);
          originalChildren.forEach(c => { c.style.display = 'none'; });

          const expandBtn = overlay.querySelector('.ps-expand-btn');
          expandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            originalChildren.forEach(c => { c.style.display = ''; });
            expandBtn.style.display = 'none';
          });

          item.prepend(overlay);
          stats.fake++;
          break;
        case 'global_fake':
          item.classList.add('ps-result-gray');
          item.prepend(createGrayWarning());
          break;
      }
    });

    const firstNonAd = resultsList.querySelector('li.b_algo');
    officialItems.forEach(item => { 
      if (firstNonAd) resultsList.insertBefore(item, firstNonAd); 
      else resultsList.prepend(item); 
    });

    if (stats.official + stats.fake > 0) {
      chrome.runtime.sendMessage({ action: 'update_stats', data: stats });
    }
  }

  function init() {
    chrome.storage.local.get(['software_db', 'global_fake_patterns', 'settings'], (r) => {
      if (r.settings && r.settings.enableBing === false) return;
      SOFTWARE_DB = r.software_db || [];
      GLOBAL_FAKE_DOMAINS = r.global_fake_patterns || [];
      processSearchResults();
      const target = document.getElementById('b_results');
      if (target) new MutationObserver(() => processSearchResults()).observe(target, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
