/* ============================================
   PureSearch · Background Service Worker
   云端数据库版 (Cloudflare Workers + KV)
   ============================================ */

// ===== 配置 =====
const CLOUD_API = 'https://pure.oryxion.dpdns.org';
const SYNC_INTERVAL_MINUTES = 720;

// ===== 安装 & 启动 =====
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const deviceId = crypto.randomUUID();
    chrome.storage.local.set({
      deviceId,
      stats: { totalMarked: 0, totalOfficialFound: 0, totalReports: 0, installDate: new Date().toISOString() },
      reports: [],
      settings: { enableBing: true, enableBaidu: true },
      syncStatus: { lastSync: null, dbVersion: null, entryCount: 0, communityCount: 0, status: 'pending' }
    });
    console.log('[PureSearch] 设备凭证已生成:', deviceId);
  }

  await syncCloudDatabase();
  chrome.alarms.create('cloudSync', { periodInMinutes: SYNC_INTERVAL_MINUTES });

  // 创建右键菜单（先移除旧的防止重复）
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ps-report-page',
      title: '🚩 PureSearch · 举报此网站为假冒官网',
      contexts: ['page', 'link']
    });
  });

  console.log('[PureSearch] 初始化完成');
});

// 右键菜单点击 → 打开举报页
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ps-report-page') {
    const targetUrl = info.linkUrl || info.pageUrl;
    const title = tab?.title || '';
    const reportPageUrl = chrome.runtime.getURL(
      `report/report.html?url=${encodeURIComponent(targetUrl)}&title=${encodeURIComponent(title)}`
    );
    chrome.tabs.create({ url: reportPageUrl });
  }
});

chrome.runtime.onStartup.addListener(() => {
  syncCloudDatabase();
});

// ===== 定时同步 =====
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cloudSync') syncCloudDatabase();
});

// ===== 云端数据库同步 =====
async function syncCloudDatabase() {
  console.log('[PureSearch] 开始同步云端数据库...');
  try {
    const localSync = await getStorage('syncStatus');
    const localVersion = localSync?.dbVersion || null;

    const versionRes = await fetch(`${CLOUD_API}/version`, { cache: 'no-store' });
    if (!versionRes.ok) throw new Error(`版本检查失败: ${versionRes.status}`);
    const versionData = await versionRes.json();

    if (localVersion && localVersion === versionData.version) {
      console.log('[PureSearch] 数据库已是最新版本:', localVersion);
      await chrome.storage.local.set({
        syncStatus: { ...localSync, lastSync: Date.now(), status: 'ok' }
      });
      return;
    }

    const dbRes = await fetch(`${CLOUD_API}/get-db`, { cache: 'no-store' });
    if (!dbRes.ok) throw new Error(`数据库下载失败: ${dbRes.status}`);
    const db = await dbRes.json();

    await chrome.storage.local.set({
      'software_db': db.software_list,
      'global_fake_patterns': db.global_fake_patterns,
      'community_fake_sites': db.community_fake_sites || [],
      syncStatus: {
        lastSync: Date.now(),
        dbVersion: db.version || versionData.version,
        entryCount: db.software_list?.length || 0,
        communityCount: db.community_fake_sites?.length || 0,
        status: 'ok'
      }
    });

    console.log(`[PureSearch] 同步成功！版本: ${db.version}, 软件: ${db.software_list?.length}, 社区黑名单: ${db.community_fake_sites?.length || 0}`);

  } catch (error) {
    console.error('[PureSearch] 云端同步失败:', error);
    const localSync = await getStorage('syncStatus');
    await chrome.storage.local.set({
      syncStatus: { ...(localSync || {}), lastSync: Date.now(), status: 'error', error: error.message }
    });
    const existing = await getStorage('software_db');
    if (!existing) await loadFallbackDatabase();
  }
}

async function loadFallbackDatabase() {
  try {
    const response = await fetch(chrome.runtime.getURL('data/software-db.json'));
    const db = await response.json();
    await chrome.storage.local.set({
      'software_db': db.software_list,
      'global_fake_patterns': db.global_fake_patterns,
      'community_fake_sites': []
    });
    console.log('[PureSearch] 已加载内置备份数据库');
  } catch (err) {
    console.error('[PureSearch] 备份数据库也加载失败:', err);
  }
}

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
      submitReport(message.data).then(res => sendResponse(res));
      return true; // 异步

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

// ===== 核心：提交举报（本地防重 + 云端上报） =====
async function submitReport(data) {
  const deviceId = await getStorage('deviceId');
  if (!deviceId) {
    return { success: false, error: 'no_device_id', message: '设备凭证丢失，请重新安装插件' };
  }

  // --- 本地防重（按域名） ---
  const reports = (await getStorage('reports')) || [];
  let targetDomain;
  try {
    targetDomain = new URL(data.url).hostname.replace(/^www\./, '');
  } catch {
    return { success: false, error: 'invalid_url', message: '无效的网址' };
  }

  if (reports.some(r => {
    try { return new URL(r.url).hostname.replace(/^www\./, '') === targetDomain; } catch { return false; }
  })) {
    return { success: false, error: 'already_reported', message: '您已举报过该网站' };
  }

  // --- 上报云端 ---
  let cloudResult = null;
  try {
    const payload = {
      deviceId,
      url: data.url,
      software: data.software,
      threats: data.threats,
      description: data.description,
      source: data.source,
      screenshots: data.screenshots || [],
      timestamp: data.timestamp || new Date().toISOString()
    };

    const res = await fetch(`${CLOUD_API}/submit-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    cloudResult = await res.json();

    if (!res.ok) {
      // 云端说已举报
      if (cloudResult.error === 'already_reported') {
        return { success: false, error: 'already_reported', message: cloudResult.message };
      }
      // 其他云端错误
      console.warn('[PureSearch] 云端拒绝:', cloudResult);
      return { success: false, error: 'cloud_rejected', message: cloudResult.message || '服务器拒绝了请求' };
    }

    console.log('[PureSearch] 云端上报成功:', cloudResult);

  } catch (err) {
    // 网络错误：降级为仅本地保存
    console.warn('[PureSearch] 云端不可达，降级为本地保存:', err.message);
    cloudResult = { reportId: 'LOCAL-' + Date.now().toString(36).toUpperCase(), currentCount: -1, autoBlocked: false };
  }

  // --- 本地持久化 ---
  const stats = (await getStorage('stats')) || { totalReports: 0 };
  const reportRecord = {
    id: cloudResult.reportId || ('PS-' + Date.now().toString(36).toUpperCase()),
    url: data.url,
    domain: targetDomain,
    software: data.software,
    threats: data.threats,
    description: data.description,
    source: data.source,
    timestamp: data.timestamp || new Date().toISOString(),
    cloudCount: cloudResult.currentCount,
    autoBlocked: cloudResult.autoBlocked,
    status: cloudResult.currentCount === -1 ? 'local_only' : 'submitted'
  };

  reports.unshift(reportRecord);
  if (reports.length > 100) reports.pop();
  stats.totalReports = (stats.totalReports || 0) + 1;

  await chrome.storage.local.set({ stats, reports });

  // 如果触发了自动封禁，立刻同步一次拿最新数据库
  if (cloudResult.autoBlocked) {
    console.log('[PureSearch] 该域名已被自动封禁，触发数据库同步...');
    syncCloudDatabase(); // 不 await，后台执行
  }

  return {
    success: true,
    reportId: reportRecord.id,
    domain: targetDomain,
    currentCount: cloudResult.currentCount,
    threshold: cloudResult.threshold,
    autoBlocked: cloudResult.autoBlocked
  };
}
