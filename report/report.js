/* ============================================
   PureSearch · 举报页逻辑
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ========== 从 URL 参数预填数据 ==========
  const params = new URLSearchParams(window.location.search);
  const preUrl = params.get('url');
  const preTitle = params.get('title');

  if (preUrl) {
    document.getElementById('reportUrl').value = decodeURIComponent(preUrl);
  }

  // ========== 步骤控制 ==========
  let currentStep = 1;

  function showStep(step) {
    for (let i = 1; i <= 3; i++) {
      const section = document.getElementById('step' + i);
      const stepEl = document.querySelector(`.report-step[data-step="${i}"]`);

      if (i === step) {
        section.style.display = 'block';
        stepEl.classList.add('active');
        stepEl.classList.remove('done');
      } else if (i < step) {
        section.style.display = 'none';
        stepEl.classList.remove('active');
        stepEl.classList.add('done');
      } else {
        section.style.display = 'none';
        stepEl.classList.remove('active', 'done');
      }
    }
    currentStep = step;
  }

  // "其他软件"选项显示/隐藏
  document.getElementById('reportSoftware').addEventListener('change', (e) => {
    const otherGroup = document.getElementById('otherSoftwareGroup');
    otherGroup.style.display = e.target.value === 'other' ? 'block' : 'none';
  });

  // 下一步按钮 (步骤1 -> 步骤2)
  document.getElementById('btnNext1').addEventListener('click', () => {
    const url = document.getElementById('reportUrl').value.trim();
    const software = document.getElementById('reportSoftware').value;
    const threats = document.querySelectorAll('input[name="threat"]:checked');

    if (!url) { shakeElement(document.getElementById('reportUrl')); return; }
    if (!software) { shakeElement(document.getElementById('reportSoftware')); return; }
    if (threats.length === 0) { alert('请至少选择一种威胁类型'); return; }

    showStep(2);
  });

  document.getElementById('btnPrev2').addEventListener('click', () => {
    showStep(1);
  });

  // ========== 文件上传 & Base64 转换 ==========
  const fileArea = document.getElementById('fileArea');
  const fileInput = document.getElementById('reportScreenshot');
  const filePreview = document.getElementById('filePreview');
  const uploadedBase64 = [];

  fileArea.addEventListener('click', () => fileInput.click());

  fileArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileArea.style.borderColor = '#2563eb';
  });

  fileArea.addEventListener('dragleave', () => {
    fileArea.style.borderColor = '#d1d5db';
  });

  fileArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileArea.style.borderColor = '#d1d5db';
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files);
  });

  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 2 * 1024 * 1024) {
        alert('单张截图不能超过 2MB');
        return;
      }
      if (uploadedBase64.length >= 3) {
        alert('最多上传 3 张截图');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Data = e.target.result;
        uploadedBase64.push(base64Data);

        const img = document.createElement('img');
        img.src = base64Data;
        filePreview.appendChild(img);

        fileArea.querySelector('.file-placeholder').innerHTML =
          `<span class="file-icon">📎</span><span>已上传 ${uploadedBase64.length}/3 张截图</span>`;
      };
      reader.readAsDataURL(file);
    });
  }

  // ========== 提交举报 ==========
  document.getElementById('btnSubmit').addEventListener('click', async () => {
    const url = document.getElementById('reportUrl').value.trim();
    const software = document.getElementById('reportSoftware').value === 'other'
      ? document.getElementById('otherSoftware').value
      : document.getElementById('reportSoftware').value;

    const threats = Array.from(document.querySelectorAll('input[name="threat"]:checked'))
      .map(cb => cb.value);

    const description = document.getElementById('reportDesc').value.trim();
    const source = document.getElementById('reportSource').value;

    const reportData = {
      url,
      title: preTitle || '',
      software,
      threats,
      description,
      source,
      screenshots: uploadedBase64,
      timestamp: new Date().toISOString()
    };

    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = '⏳ 提交中...';

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'submit_report',
        data: reportData
      }, (response) => {
        btn.disabled = false;
        btn.textContent = '🚩 提交举报';

        if (!response) {
          alert('提交失败：无响应，请重试');
          return;
        }

        if (response.success) {
          showStep(3);

          // 显示举报编号
          document.getElementById('reportId').textContent = response.reportId || '-';

          // 显示举报人数和进度
          const countEl = document.getElementById('reportCount');
          const progressEl = document.getElementById('reportProgress');
          const progressFill = document.getElementById('reportProgressFill');
          const blockedEl = document.getElementById('reportBlocked');

          if (response.currentCount > 0) {
            // 有云端数据
            if (countEl) countEl.textContent = `已有 ${response.currentCount} 人举报该网站`;

            if (progressEl && progressFill && response.threshold) {
              progressEl.style.display = 'block';
              const pct = Math.min(100, Math.round((response.currentCount / response.threshold) * 100));
              progressFill.style.width = pct + '%';
              progressFill.textContent = `${response.currentCount}/${response.threshold}`;
            }

            if (response.autoBlocked && blockedEl) {
              blockedEl.style.display = 'block';
            }
          } else if (response.currentCount === -1) {
            // 离线模式
            if (countEl) countEl.textContent = '已保存至本地（网络不可用，待联网后同步）';
          }

        } else if (response.error === 'already_reported') {
          alert('您已举报过该网站，无需重复提交。');
        } else {
          alert(response.message || '提交失败，请重试');
        }
      });
    } else {
      // 脱离扩展环境（调试用）
      console.log('Debug Report:', reportData);
      btn.disabled = false;
      btn.textContent = '🚩 提交举报';
      showStep(3);
      document.getElementById('reportId').textContent = 'DEBUG-' + Date.now().toString(36).toUpperCase();
    }
  });

  // 关闭窗口
  document.getElementById('btnClose').addEventListener('click', () => {
    window.close();
  });

  // ========== 工具函数 ==========
  function shakeElement(el) {
    el.style.borderColor = '#dc2626';
    el.style.animation = 'shake 0.4s ease';
    el.addEventListener('animationend', () => {
      el.style.animation = '';
    }, { once: true });
    el.focus();
  }

  // 注入抖动动画
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(style);
});
