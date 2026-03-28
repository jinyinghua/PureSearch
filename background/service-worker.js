/* ============================================
   PureSearch · Background Service Worker
   云端数据库版 (Cloudflare Workers + KV)
   ============================================ */

// ===== 配置 =====
// 部署后将此 URL 替换为你的 Cloudflare Worker 地址
const CLOUD_API = 'https://pure.oryxion.dpdns.org';
const SYNC_INTERVAL_MINUTES = 720; // 每 12 小时同步一次

// ===== 安装 & 启动 =====
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      stats: { totalMarked: 0, totalOfficialFound: 0, totalReports: 0, installDate: new Date().toISOString() },
      reports: [],
      settings: { enableBing: true, enableBaidu: true, enableGoogle: true },
      syncStatus: { lastSync: null, dbVersion: null, entryCount: 0, status: 'pending' }
    });
  }

  // 安装/更新时立即同步云端数据库
  await syncCloudDatabase();

  // 注册定时同步闹钟
  chrome.alarms.create('cloudSync', { periodInMinutes: SYNC_INTERVAL_MINUTES });

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'ps-report-page',
    title: '🚩 PureSearch · 举报此网站为假冒官网',
    contexts: ['page', 'link']
  });

  console.log('[PureSearch] 初始化完成，云端同步已启动');
});

chrome.runtime.onStartup.addListener(() => {
  syncCloudDatabase();
});

// ===== 定时同步 =====
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cloudSync') {
    syncCloudDatabase();
  }
});

// ===== 核心：云端数据库同步 =====
async function syncCloudDatabase() {
  console.log('[PureSearch] 开始同步云端数据库...');

  try {
    // 第一步：检查版本号（轻量请求）
    const localSync = await getStorage('syncStatus');
    const localVersion = localSync?.dbVersion || null;

    const versionRes = await fetch(`${CLOUD_API}/version`, { cache: 'no-store' });
    if (!versionRes.ok) throw new Error(`版本检查失败: ${versionRes.status}`);
    const versionData = await versionRes.json();

    // 如果版本相同，跳过完整下载
    if (localVersion && localVersion === versionData.version) {
      console.log('[PureSearch] 数据库已是最新版本:', localVersion);
      await chrome.storage.local.set({
        syncStatus: { ...localSync, lastSync: Date.now(), status: 'ok' }
      });
      return;
    }

    // 第二步：版本不同，下载完整数据库
    const dbRes = await fetch(`${CLOUD_API}/get-db`, { cache: 'no-store' });
    if (!dbRes.ok) throw new Error(`数据库下载失败: ${dbRes.status}`);
    const db = await dbRes.json();

    // 存入本地
    await chrome.storage.local.set({
      'software_db': db.software_list,
      'global_fake_patterns': db.global_fake_patterns,
      syncStatus: {
        lastSync: Date.now(),
        dbVersion: db.version || versionData.version,
        entryCount: db.software_list?.length || 0,
        status: 'ok'
      }
    });

    console.log(`[PureSearch] 同步成功！版本: ${db.version}, 条目: ${db.software_list?.length}`);

  } catch (error) {
    console.error('[PureSearch] 云端同步失败:', error);

    // 同步失败时保留旧数据，只更新状态
    const localSync = await getStorage('syncStatus');
    await chrome.storage.local.set({
      syncStatus: { ...(localSync || {}), lastSync: Date.now(), status: 'error', error: error.message }
    });

    // 如果本地完全没有数据（首次安装且网络失败），尝试加载内置备份
    const existing = await getStorage('software_db');
    if (!existing || existing.length === 0) {
      console.log('[PureSearch] 网络不可用，尝试加载内置备份数据库...');
      await loadFallbackDatabase();
    }
  }
}

// ===== 内置备份数据库（离线降级） =====
async function loadFallbackDatabase() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/software-db.json'));
    const db = await response.json();
    await chrome.storage.local.set({
      'software_db': db.software_list,
      'global_fake_patterns': db.global_fake_patterns
    });
    console.log('[PureSearch] 已加载内置备份数据库');
  } catch (err) {
    console.error('[PureSearch] 内置备份也加载失败:', err);
  }
}

// ===== 辅助函数 =====
function getStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (r) => resolve(r[key]));
  });
}

// ===== 消息处理 =====
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
    case 'get_sync_status':
      chrome.storage.local.get(['syncStatus'], (r) => sendResponse(r.syncStatus || {}));
      return true;
    case 'force_sync':
      syncCloudDatabase().then(() => sendResponse({ success: true }));
      return true;
    case 'get_reports':
      chrome.storage.local.get(['reports'], (r) => sendResponse(r.reports || []));
      return true;
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
