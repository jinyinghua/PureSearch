# 🛡️ PureSearch · 净网路标

> 搜索引擎防污染浏览器扩展 — 官网置顶高亮 · 假冒网站标注 · 一键举报

![Chrome MV3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🎯 解决什么问题？

在 Bing、百度等搜索引擎搜索软件时，排在前面的往往不是真正的官网，而是：
- 🚫 假冒官网（如 `obs-cn.com` 假冒 OBS Studio）
- 🚫 捆绑下载站（华军、太平洋、多特等）
- 🚫 SEO 投毒网站（通过竞价排名霸占搜索结果）

这些网站提供的安装包通常捆绑了流氓软件、广告弹窗甚至木马病毒。

**PureSearch 净网路标** 在搜索引擎层面提供防污染标注，让你每次搜索和下载都安全。秉承“不侵入、不作恶”的原则，本扩展**仅在搜索引擎页面进行 DOM 标注**，不会静默重定向或劫持用户的正常网络访问。

---

## ✨ 核心功能

### 1. 🔍 搜索结果净化
- ✅ **官网置顶**：自动识别真正的软件官网，提升到搜索结果第一位
- ✅ **官网高亮**：绿色边框 + "官方正版"认证
- 🚫 **假冒屏蔽**：自动识别并折叠覆盖假冒官网的搜索结果，附带正版链接
- ⚠️ **下载站标记**：标记第三方下载站，提示用户谨慎下载
- 📊 **顶部摘要栏**：一目了然显示本次搜索的安全状况

### 2. 🚩 举报系统
- 搜索结果中每条记录附带「疑似假冒」小按钮
- 右键菜单快捷举报当前页面或可疑链接
- 完整的分步举报表单（支持截图上传）

### 3. 📦 内置软件官网数据库
当前收录 **35 款** 常用软件的官网信息，包含**各大安全厂商**防投毒：

| 类别 | 软件 |
|------|------|
| **安全** | 火绒安全, 360安全卫士, 金山毒霸, 腾讯电脑管家, 卡巴斯基, Wireshark, KeePass |
| 开发 | Python, Node.js, VS Code, Git, Notepad++ |
| 多媒体 | OBS Studio, VLC, Audacity, PotPlayer, HandBrake |
| 设计 | GIMP, Blender, Inkscape, Krita |
| 工具 | 7-Zip, Rufus, Ventoy, Everything, qBittorrent, ShareX, PuTTY, FileZilla |
| 浏览器 | Chrome, Firefox |
| 社交 | Telegram |
| 游戏 | Steam |
| 办公 | WPS, Thunderbird |

---

## 🚀 安装方法

### 开发者模式加载（推荐）
1. 打开 Chrome/Edge 浏览器
2. 进入 `chrome://extensions/`
3. 开启右上角 **「开发者模式」**
4. 点击 **「加载已解压的扩展程序」**
5. 选择 `PureSearch` 文件夹
6. 完成！图标出现在浏览器工具栏

---

## 📁 项目结构

```
PureSearch/
├── manifest.json              # MV3 清单配置
├── background/
│   └── service-worker.js      # 后台服务 (统计/消息/定时)
├── content/
│   ├── bing-inject.js         # Bing 搜索结果注入
│   ├── bing-style.css         # Bing 注入样式
│   ├── baidu-inject.js        # 百度搜索结果注入
│   └── baidu-style.css        # 百度注入样式
├── popup/
│   ├── popup.html             # 弹出窗口仪表盘
│   ├── popup.css
│   └── popup.js
├── report/
│   ├── report.html            # 举报表单页
│   ├── report.css
│   └── report.js
├── data/
│   └── software-db.json       # 软件官网数据库
└── icons/
```

---

## 📄 License

MIT License · 开源免费 · 欢迎贡献

---

**让每一次搜索都安全 🛡️**
