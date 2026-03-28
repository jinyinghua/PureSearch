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

    // 验证
    if (!url) {
      shakeElement(document.getElementById('reportUrl'));
      return;
    }
    if (!software) {
      shakeElement(document.getElementById('reportSoftware'));
      return;
    }
    if (threats.length === 0) {
      alert('请至少选择一种威胁类型');
      return;
    }

    showStep(2);
  });

  // 上一步按钮
  document.getElementById('btnPrev2').addEventListener('click', () => {
    showStep(1);
  });

  // ========== 文件上传 ==========
  const fileArea = document.getElementById('fileArea');
  const fileInput = document.getElementById('reportScreenshot');
  const filePreview = document.getElementById('filePreview');

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

  const uploadedFiles = [];

  function handleFiles(files) {
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('文件大小不能超过 5MB');
        return;
      }

      uploadedFiles.push(file);

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        filePreview.appendChild(img);
      };
      reader.readAsDataURL(file);
    });

    if (uploadedFiles.length > 0) {
      fileArea.querySelector('.file-placeholder').innerHTML =
        `<span class="file-icon">📎</span><span>已选择 ${uploadedFiles.length} 张截图</span>`;
    }
  }

  // ========== 提交举报 ==========
  document.getElementById('btnSubmit').addEventListener('click', () => {
    const url = document.getElementById('reportUrl').value.trim();
    const software = document.getElementById('reportSoftware').value === 'other'
      ? document.getElementById('otherSoftware').value
      : document.getElementById('reportSoftware').value;

    const threats = Array.from(document.querySelectorAll('input[name="threat"]:checked'))
      .map(cb => cb.value);

    const description = document.getElementById('reportDesc').value.trim();
    const source = document.getElementById('reportSource').value;
    const keyword = document.getElementById('reportKeyword').value.trim();

    const reportData = {
      url,
      title: preTitle || '',
      software,
      threats,
      category: threats.join(','),
      description: [
        description,
        source ? `来源: ${source}` : '',
        keyword ? `关键词: ${keyword}` : '',
        uploadedFiles.length > 0 ? `附带 ${uploadedFiles.length} 张截图` : ''
      ].filter(Boolean).join('\n'),
      timestamp: new Date().toISOString()
    };

    // 发送给 background service worker
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: 'submit_report',
        data: reportData
      }, (response) => {
        if (response && response.success) {
          showStep(3);
          document.getElementById('reportId').textContent = 'PS-' + Date.now().toString(36).toUpperCase();
        }
      });
    } else {
      // 脱离扩展环境 (调试用)
      console.log('Report data:', reportData);
      showStep(3);
      document.getElementById('reportId').textContent = 'PS-' + Date.now().toString(36).toUpperCase();
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

  // 添加抖动动画
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
