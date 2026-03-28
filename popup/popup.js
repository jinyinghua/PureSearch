/* ============================================
   PureSearch · Popup 仪表盘逻辑
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ========== 加载统计数据 ==========
  chrome.runtime.sendMessage({ action: 'get_stats' }, (stats) => {
    if (stats) {
      animateNumber('statOfficial', stats.totalOfficialFound || 0);
      animateNumber('statMarked', stats.totalMarked || 0); // 更改为 totalMarked
      animateNumber('statReports', stats.totalReports || 0);
    }
  });

  // ========== 加载设置 ==========
  chrome.runtime.sendMessage({ action: 'get_settings' }, (settings) => {
    if (settings) {
      const tb = document.getElementById('toggleBing');
      const tbd = document.getElementById('toggleBaidu');
      if (tb) tb.checked = settings.enableBing !== false;
      if (tbd) tbd.checked = settings.enableBaidu !== false;
    }
  });

  // ========== 设置变更监听 ==========
  const toggleIds = {
    'toggleBing': 'enableBing',
    'toggleBaidu': 'enableBaidu'
  };

  Object.keys(toggleIds).forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        saveSettings();
      });
    }
  });

  function saveSettings() {
    const tb = document.getElementById('toggleBing');
    const tbd = document.getElementById('toggleBaidu');
    const settings = {
      enableBing: tb ? tb.checked : true,
      enableBaidu: tbd ? tbd.checked : true
    };
    chrome.runtime.sendMessage({ action: 'save_settings', data: settings });
  }

  // ========== 快捷操作按钮 ==========
  document.getElementById('btnReportCurrent').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const reportUrl = chrome.runtime.getURL('report/report.html') +
          '?url=' + encodeURIComponent(tabs[0].url) +
          '&title=' + encodeURIComponent(tabs[0].title);
        chrome.tabs.create({ url: reportUrl });
        window.close();
      }
    });
  });

  document.getElementById('btnViewReports').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'get_reports' }, (reports) => {
      if (!reports || reports.length === 0) {
        showToast('暂无举报记录');
        return;
      }
      let msg = '最近举报:\n';
      reports.slice(0, 5).forEach((r, i) => {
        const date = new Date(r.timestamp).toLocaleDateString('zh-CN');
        msg += `${i + 1}. ${r.url.substring(0, 40)}... (${date})\n`;
      });
      alert(msg);
    });
  });

  document.getElementById('btnDatabase').addEventListener('click', () => {
    showToast('当前收录 35 款常用软件的官网信息');
  });

  // ========== 数字递增动画 ==========
  function animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (target === 0) { el.textContent = '0'; return; }

    let current = 0;
    const step = Math.max(1, Math.floor(target / 20));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      el.textContent = current.toLocaleString();
    }, 30);
  }

  // ========== Toast 提示 ==========
  function showToast(text) {
    let toast = document.getElementById('ps-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ps-toast';
      toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: #1e293b; color: #fff; padding: 8px 18px; border-radius: 8px;
        font-size: 12.5px; z-index: 9999; opacity: 0; transition: opacity 0.3s;
        white-space: nowrap; font-family: inherit;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }
});
