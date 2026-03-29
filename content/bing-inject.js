/* ============================================
   PureSearch · Bing 搜索结果注入脚本 (动态规则版)
   ============================================ */

(function () {
  'use strict';

  let SOFTWARE_DB = [];
  let GLOBAL_FAKE_DOMAINS = [];
  let COMMUNITY_FAKE_SITES = [];

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
    return domainList.some(d => hostname === d || hostname.endsWith('.' + d)); 
  }

  function matchCommunityFake(hostname) {
    if (!COMMUNITY_FAKE_SITES || COMMUNITY_FAKE_SITES.length === 0) return null;
    for (const entry of COMMUNITY_FAKE_SITES) {
      const domain = typeof entry === 'string' ? entry : entry.domain;
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return typeof entry === 'string' ? { domain: entry, software: '未知' } : entry;
      }
    }
    return null;
  }

  // ===== 多级 fallback 获取搜索结果的真实 URL =====
  function getRealUrl(item) {
    // 优先级1：<h2><a> 的 href（Bing 大部分结果直接就是真实 URL）
    const link = item.querySelector('h2 a');
    if (link) {
      const href = link.href;
      // 如果不是 Bing 内部跳转链接，直接用
      if (href && !href.includes('bing.com/ck/') && !href.includes('bingj.com')) {
        return href;
      }
    }

    // 优先级2：底部显示的域名文字（cite 区域）
    // Bing 搜索结果底部会显示类似 "huorong.cn" 或 "https://huorong.cn/..." 的文字
    const cite = item.querySelector('cite, .b_attribution cite, .b_attribution .b_adurl, .tptt');
    if (cite) {
      let d = cite.textContent.trim().replace(/\s/g, '');
      // 清除 Bing 可能附带的 "› 子路径" 格式
      d = d.replace(/›.*$/, '').replace(/\u203A.*$/, '').trim();
      if (d.includes('.')) {
        if (!d.startsWith('http')) d = 'https://' + d;
        try {
          new URL(d); // 验证是否为合法 URL
          return d;
        } catch {}
      }
    }

    // 优先级3：data 属性中可能藏有真实 URL
    // Bing 有时在 <a> 标签上放 data-href 或在 item 上放 data-url
    if (link) {
      const dataHref = link.getAttribute('data-href') || link.getAttribute('data-u');
      if (dataHref && dataHref.startsWith('http')) return dataHref;
    }
    const dataUrl = item.getAttribute('data-url') || item.getAttribute('url');
    if (dataUrl && dataUrl.startsWith('http')) return dataUrl;

    // 最终 fallback：直接用 <a> 的 href（可能是 bing.com/ck/ 跳转链接）
    return link ? link.href : '';
  }

  function classifyUrl(url) {
    const hostname = extractDomain(url);
    if (!hostname) return null;
    
    if (hostname.includes('bing.com') || hostname.includes('bingj.com')) return null;

    if (domainMatches(hostname, GLOBAL_FAKE_DOMAINS)) return { type: 'global_fake', software: null, domain: hostname };
    
    for (const sw of SOFTWARE_DB) {
      if (domainMatches(hostname, sw.official_domains || [])) return { type: 'official', software: sw, domain: hostname };
      if (domainMatches(hostname, sw.known_fakes || [])) return { type: 'fake', software: sw, domain: hostname };
    }

    const communityHit = matchCommunityFake(hostname);
    if (communityHit) {
      return { 
        type: 'fake', 
        software: { name: communityHit.software || '未知', official_domains: [] },
        domain: hostname,
        source: 'community'
      };
    }

    return null;
  }

  function createOfficialBadge(softwareName) {
    const badge = document.createElement('div');
    badge.className = 'ps-badge ps-badge-official';
    badge.innerHTML = `<span class="ps-badge-icon">✅</span><span class="ps-badge-text"><strong>官方正版</strong> · ${softwareName} 官方网站</span>`;
    return badge;
  }

  function createFakeOverlay(softwareName, officialDomains, isCommunity) {
    const overlay = document.createElement('div');
    overlay.className = 'ps-overlay ps-overlay-fake';
    const safeUrl = officialDomains && officialDomains.length > 0 ? 'https://' + officialDomains[0] : '';
    const sourceTag = isCommunity ? ' <small style="opacity:0.7;">(社区举报)</small>' : '';
    const officialLink = safeUrl ? `<a href="${safeUrl}" class="ps-overlay-link" target="_blank">前往正版官网 →</a>` : '';
    
    overlay.innerHTML = `
      <div class="ps-overlay-content" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="ps-overlay-icon">🚫</span>
          <span class="ps-overlay-text"><strong>假冒标记</strong> · 疑似假冒 <em>${softwareName}</em> 的盗版网站${sourceTag}</span>
          ${officialLink}
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
      
      // 使用多级 fallback 获取真实 URL
      const url = getRealUrl(item);
      if (!url) return;
      
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
          const isCommunity = cls.source === 'community';
          const overlay = createFakeOverlay(cls.software.name, cls.software.official_domains, isCommunity);
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
    chrome.storage.local.get(['software_db', 'global_fake_patterns', 'community_fake_sites', 'settings'], (r) => {
      if (r.settings && r.settings.enableBing === false) return;
      SOFTWARE_DB = r.software_db || [];
      GLOBAL_FAKE_DOMAINS = r.global_fake_patterns || [];
      COMMUNITY_FAKE_SITES = r.community_fake_sites || [];
      processSearchResults();
      const target = document.getElementById('b_results');
      if (target) new MutationObserver(() => processSearchResults()).observe(target, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
