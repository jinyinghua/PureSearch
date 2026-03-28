/* ============================================
   PureSearch · 百度搜索结果注入脚本 (动态规则版)
   ============================================ */

(function () {
  'use strict';

  let SOFTWARE_DB = [];
  let GLOBAL_FAKE_DOMAINS = [];

  function extractDomain(url) { 
    try { 
      return new URL(url).hostname.replace(/^www\./, ''); 
    } catch { 
      return ''; 
    } 
  }
  
  function domainMatches(hostname, list) { 
    if (!list || !Array.isArray(list) || !hostname) return false;
    // 移除了危险的 d.includes(hostname)，只保留精确匹配和子域名匹配
    return list.some(d => hostname === d || hostname.endsWith('.' + d)); 
  }

  function classifyUrl(url) {
    const hostname = extractDomain(url);
    if (!hostname) return null;
    
    if (hostname.includes('baidu.com')) return null;

    if (domainMatches(hostname, GLOBAL_FAKE_DOMAINS)) return { type: 'global_fake', software: null, domain: hostname };
    
    for (const sw of SOFTWARE_DB) {
      if (domainMatches(hostname, sw.official_domains || [])) return { type: 'official', software: sw, domain: hostname };
      if (domainMatches(hostname, sw.known_fakes || [])) return { type: 'fake', software: sw, domain: hostname };
    }
    return null;
  }

  function getRealUrl(item) {
    const mu = item.getAttribute('mu'); 
    if (mu) return mu;
    
    const dataLog = item.getAttribute('data-log'); 
    if (dataLog) { 
      try { 
        const log = JSON.parse(dataLog); 
        if (log.mu) return log.mu; 
      } catch {} 
    }
    
    const cite = item.querySelector('.c-showurl, .c-color-gray, span.g');
    if (cite) { 
      let d = cite.textContent.trim().replace(/\s/g, ''); 
      d = d.replace(/>.*$/, '').replace(/\|.*$/, '');
      if (d.includes('.')) {
        if (!d.startsWith('http')) d = 'http://' + d; 
        return d; 
      }
    }
    
    const link = item.querySelector('h3.t a, h3.c-title a'); 
    return link ? link.href : '';
  }

  function createBadge(type, sw) {
    const el = document.createElement('div');
    if (type === 'official') {
      el.className = 'ps-badge ps-badge-official';
      el.innerHTML = `<span>✅</span> <strong>官方正版</strong> · ${sw.name} 官方网站 <small>PureSearch 验证</small>`;
    } else if (type === 'fake') {
      el.className = 'ps-overlay ps-overlay-fake';
      const safe = sw.official_domains && sw.official_domains.length > 0 ? 'https://' + sw.official_domains[0] : '#';
      el.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div><span>🚫</span> <strong>假冒标记</strong> · 疑似假冒 <em>${sw.name}</em> 的盗版网站 <a href="${safe}" target="_blank" class="ps-overlay-link">前往官网 →</a></div>
          <button class="ps-expand-btn" style="background:none; border:none; color:#999; cursor:pointer; font-size:12px; text-decoration:underline;">继续访问原网页</button>
        </div>
      `;
    } else if (type === 'gray') {
      el.className = 'ps-overlay ps-overlay-gray';
      el.innerHTML = `<span>⚠️</span> <strong>第三方下载站</strong> · 可能捆绑软件，建议从官网下载`;
    }
    return el;
  }

  function processBaiduResults() {
    const container = document.getElementById('content_left');
    if (!container) return;
    const items = container.querySelectorAll('.result, .c-container');
    const officialItems = [];
    let stats = { official: 0, fake: 0 };

    items.forEach(item => {
      if (item.dataset.psProcessed) return;
      item.dataset.psProcessed = 'true';
      const url = getRealUrl(item);
      if (!url) return;
      
      const cls = classifyUrl(url);
      if (!cls) return;

      switch (cls.type) {
        case 'official':
          item.classList.add('ps-result-official');
          item.prepend(createBadge('official', cls.software));
          officialItems.push(item);
          stats.official++;
          break;
        case 'fake':
          item.classList.add('ps-result-fake');
          const badge = createBadge('fake', cls.software);
          
          // 隐藏除 badge 外的其他内容
          const originalChildren = Array.from(item.children);
          originalChildren.forEach(c => { c.style.display = 'none'; });
          
          // 绑定“展开/继续访问”按钮逻辑
          const expandBtn = badge.querySelector('.ps-expand-btn');
          expandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            originalChildren.forEach(c => { c.style.display = ''; });
            expandBtn.style.display = 'none'; // 隐藏按钮本身
          });

          item.prepend(badge);
          stats.fake++;
          break;
        case 'global_fake':
          item.classList.add('ps-result-gray');
          item.prepend(createBadge('gray', null));
          break;
      }
    });

    const firstResult = container.querySelector('.result, .c-container');
    officialItems.forEach(item => { if (firstResult) container.insertBefore(item, firstResult); });
    
    if (stats.official + stats.fake > 0) {
      chrome.runtime.sendMessage({ action: 'update_stats', data: stats });
    }
  }

  function init() {
    chrome.storage.local.get(['software_db', 'global_fake_patterns', 'settings'], (r) => {
      if (r.settings && r.settings.enableBaidu === false) return;
      SOFTWARE_DB = r.software_db || [];
      GLOBAL_FAKE_DOMAINS = r.global_fake_patterns || [];
      processBaiduResults();
      const target = document.getElementById('content_left');
      if (target) new MutationObserver(() => processBaiduResults()).observe(target, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
