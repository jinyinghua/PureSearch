/* ============================================
   PureSearch · Background Service Worker
   ============================================ */

chrome.runtime.onInstalled.addListener(async (details) => {
  // 初始化统计和设置
  if (details.reason === 'install') {
    chrome.storage.local.set({
      stats: { totalMarked: 0, totalOfficialFound: 0, totalReports: 0, installDate: new Date().toISOString() },
      reports: [],
      settings: { enableBing: true, enableBaidu: true, enableGoogle: true }
    });
  }
  
  // 加载内置数据库到存储中
  await loadBuiltInDatabase();
  console.log('[PureSearch] 内置数据库已同步至存储');

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'ps-report-page',
    title: '🚩 PureSearch · 举报此网站为假冒官网',
    contexts: ['page', 'link']
  });
});

// 监听启动，确保规则是最新的
chrome.runtime.onStartup.addListener(() => {
  loadBuiltInDatabase();
});

async function loadBuiltInDatabase() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/software-db.json'));
    const db = await response.json();
    await chrome.storage.local.set({ 'software_db': db.software_list, 'global_fake_patterns': db.global_fake_patterns });
  } catch (err) {
    console.error('[PureSearch] 加载数据库失败:', err);
  }
}

// 消息处理逻辑保持不变
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'update_stats':
      updateStats(message.data);
      sendResponse({ success: true });
      break;
    case 'submit_report':
      saveReport(message.data);
      sendResponse({ success: true });
      break;
    case 'get_stats':
      chrome.storage.local.get(['stats'], (r) => sendResponse(r.stats || {}));
      return true;
    case 'get_settings':
      chrome.storage.local.get(['settings'], (r) => sendResponse(r.settings || {}));
      return true;
    case 'save_settings':
      chrome.storage.local.set({ settings: message.data });
      sendResponse({ success: true });
      break;
  }
});

function updateStats(data) {
  chrome.storage.local.get(['stats'], (result) => {
    const stats = result.stats || { totalMarked: 0, totalOfficialFound: 0, totalReports: 0 };
    if (data.fake) stats.totalMarked += data.fake;
    if (data.official) stats.totalOfficialFound += data.official;
    chrome.storage.local.set({ stats });
  });
}

function saveReport(data) {
  chrome.storage.local.get(['stats', 'reports'], (result) => {
    const reports = result.reports || [];
    const stats = result.stats || { totalReports: 0 };
    reports.unshift({ id: Date.now(), ...data, status: 'pending' });
    if (reports.length > 100) reports.pop();
    stats.totalReports += 1;
    chrome.storage.local.set({ stats, reports });
  });
}
