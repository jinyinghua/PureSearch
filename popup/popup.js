/* ============================================
   PureSearch · Popup 仪表盘逻辑
   云端数据库版
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ========== 加载统计数据 ==========
  chrome.runtime.sendMessage({ action: 'get_stats' }, (stats) => {
    if (stats) {
      animateNumber('statOfficial', stats.totalOfficialFound || 0);
      animateNumber('statMarked', stats.totalMarked || 0);
      animateNumber('statReports', stats.totalReports || 0);
    }
  });

  // ========== 加载同步状态 ==========
  chrome.runtime.sendMessage({ action: 'get_sync_status' }, (sync) => {
    updateSyncUI(sync);
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
  const toggleIds = { 'toggleBing': 'enableBing', 'toggleBaidu': 'enableBaidu' };
  Object.keys(toggleIds).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', saveSettings);
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

  // ========== 同步按钮 ==========
  document.getElementById('btnSync').addEventListener('click', () => {
    const btn = document.getElementById('btnSync');
    const icon = btn.querySelector('.ps-action-icon');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    icon.style.animation = 'ps-spin 1s linear infinite';

    chrome.runtime.sendMessage({ action: 'force_sync' }, () => {
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: 'get_sync_status' }, (sync) => {
          updateSyncUI(sync);
          btn.disabled = false;
          btn.style.opacity = '1';
          icon.style.animation = '';
          if (sync && sync.status === 'ok') {
            showToast('✅ 数据库同步成功');
          } else {
            showToast('⚠️ 同步失败，使用本地缓存');
          }
        });
      }, 500);
    });
  });

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
      let msg = '最近举报：\n';
      reports.slice(0, 5).forEach((r, i) => {
        const date = new Date(r.timestamp).toLocaleDateString('zh-CN');
        const status = r.status === 'local_only' ? '⚡本地' : (r.autoBlocked ? '🚫已封禁' : '⏳待审');
        const domain = r.domain || r.url?.substring(0, 35);
        msg += `${i + 1}. ${domain} [${status}] (${date})\n`;
      });
      alert(msg);
    });
  });

  // ========== 同步状态 UI 更新 ==========
  function updateSyncUI(sync) {
    const dbVersionEl = document.getElementById('dbVersion');
    const dbCountEl = document.getElementById('dbCount');
    const communityCountEl = document.getElementById('communityCount');
    const syncDotEl = document.getElementById('syncDot');
    const syncTextEl = document.getElementById('syncText');
    const lastSyncEl = document.getElementById('lastSyncTime');

    if (!sync) {
      if (syncTextEl) syncTextEl.textContent = '尚未同步';
      return;
    }

    if (dbVersionEl) dbVersionEl.textContent = sync.dbVersion || '未知';
    if (dbCountEl) dbCountEl.textContent = sync.entryCount || '0';
    if (communityCountEl) communityCountEl.textContent = sync.communityCount || '0';

    if (sync.status === 'ok') {
      if (syncDotEl) syncDotEl.className = 'ps-sync-dot ps-sync-ok';
      if (syncTextEl) syncTextEl.textContent = '云端已同步';
    } else if (sync.status === 'error') {
      if (syncDotEl) syncDotEl.className = 'ps-sync-dot ps-sync-error';
      if (syncTextEl) syncTextEl.textContent = '同步失败（使用缓存）';
    } else {
      if (syncDotEl) syncDotEl.className = 'ps-sync-dot ps-sync-pending';
      if (syncTextEl) syncTextEl.textContent = '等待同步...';
    }

    if (lastSyncEl && sync.lastSync) {
      lastSyncEl.textContent = formatTimeAgo(sync.lastSync);
    }
  }

  function formatTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  }

  // ========== 数字递增动画 ==========
  function animateNumber(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (target === 0) { el.textContent = '0'; return; }
    let current = 0;
    const step = Math.max(1, Math.floor(target / 20));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(interval); }
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
