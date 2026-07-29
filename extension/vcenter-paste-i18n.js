(globalThis.VCenterPasteStorage ? globalThis.VCenterPasteStorage.ready : Promise.resolve()).then(function () {
(function (global) {
  'use strict';

  const LANGUAGE_KEY = 'vcpa_language';
  const DEFAULT_LANGUAGE = 'zh-CN';
  const dictionaries = {
    'zh-CN': {
      'Sent {name} to the VM.': '已将 {name} 发送到虚拟机。',
      'Pasted {count} characters.': '已粘贴 {count} 个字符。',
      'Imported {count} snippet(s). Total: {total}.': '已导入 {count} 个片段，共 {total} 个。',
      'Pasting…': '正在粘贴…',
      "Paste into VM": "粘贴到虚拟机",
      "Paste clipboard into VM": "将剪贴板粘贴到虚拟机",
      "Drag to reorder": "拖动排序",
      "Pasted {count} characters": "已粘贴 {count} 个字符",
      "Pasting {count} characters…": "正在粘贴 {count} 个字符…",
      "Paste cancelled": "已取消粘贴",
      "Clipboard is empty": "剪贴板为空",
      "Clipboard blocked — open panel and paste into the text box": "剪贴板访问被阻止，请打开面板并将内容粘贴到文本框",
      "Nothing to save": "没有可保存的内容",
      "Could not save": "保存失败",
      "Snippet saved": "片段已保存",
      "Nothing to paste": "没有可粘贴的内容",
      "Name required": "请输入名称",
      "Content required": "请输入内容",
      "Snippet updated": "片段已更新",
      "Snippet added": "片段已添加",
      "Snippet deleted": "片段已删除",
      "Reading file…": "正在读取文件…",
      "Import failed: invalid JSON.": "导入失败：JSON 格式无效。",
      "Import failed: no snippets in file.": "导入失败：文件中没有片段。",
      "Import failed: no valid snippets.": "导入失败：没有有效片段。",
      "Import failed: could not read file.": "导入失败：无法读取文件。",
      "Type or paste text above first, then click Save as snippet.": "请先在上方输入或粘贴文本，再点击“保存为片段”。",
      "Name the snippet and click Save.": "请输入片段名称，然后点击“保存”。",
      "Enter or paste text above, then click Send.": "请先在上方输入或粘贴文本，再点击“发送”。",
      "Could not send.": "发送失败。",
      "Not supported": "当前页面不支持。",
      "No tab": "未找到活动标签页。",
      "No response": "控制台未响应。",
      "Settings – vCenter Paste Assistant": "设置 – vCenter 粘贴工具",
      "General": "常规",
      "Appearance": "外观",
      "Operations": "操作",
      "Milliseconds": "毫秒",
      "Import complete": "导入完成",
      "Export complete": "导出完成",
      "Saved automatically": "已自动保存",
      "Open settings": "打开设置",
      "Search": "搜索",
      'vCenter Paste Assistant': 'vCenter 粘贴工具',
      'Settings': '设置', 'Paste': '粘贴', 'Snippets': '片段', 'Send': '发送', 'Clear': '清空',
      'Save as snippet': '保存为片段', 'Save as Snippet': '保存为片段', 'Save': '保存', 'Cancel': '取消',
      'Name': '名称', 'Content': '内容', 'Edit': '编辑', 'Delete': '删除', 'Search snippets...': '搜索片段…',
      'Snippet name': '片段名称', 'Paste or type content…': '粘贴或输入内容…',
      'Type or paste text, then click Send…': '输入或粘贴文本，然后点击“发送”…',
      'Drag to reorder snippets': '拖动可重新排序片段', '+ New snippet': '+ 新建片段',
      'Privacy': '隐私', 'Paste & panel': '粘贴与面板', 'Backup': '备份',
      'Settings · Paste & panel, backup, snippets': '设置 · 粘贴与面板、备份、片段',
      'Reload your vCenter/ESXi WebMKS console page for changes to take effect.': '更改后请刷新 vCenter/ESXi WebMKS 控制台页面以生效。',
      'Paste behavior': '粘贴行为', 'Timing': '时序', 'Auto-hit Enter after paste': '粘贴后自动按 Enter',
      'Keystroke': '字符间隔', 'First character': '首字符等待', 'After Enter': 'Enter 后等待',
      'Popup': '弹出窗口', 'Default tab': '默认标签页', 'WebMKS floating panel': 'WebMKS 浮动面板',
      'Enable Ctrl+V / ⌘V': '启用 Ctrl+V / ⌘V', 'Open panel by default': '默认展开面板',
      'Position': '位置', 'Bottom right': '右下', 'Bottom left': '左下', 'Top right': '右上', 'Top left': '左上',
      'Compatibility': '兼容性', 'Compatibility mode (for pastes > 500 chars)': '兼容模式（粘贴超过 500 字符）',
      'Import from file': '从文件导入', 'Drop a .json file or click to browse': '拖入 .json 文件或点击浏览',
      'Export all': '全部导出', 'Total': '总数', 'Last updated': '最后更新', 'Storage': '存储空间',
      'Your saved snippets': '你保存的片段', 'No snippets yet. Import a backup or add snippets from the popup.': '暂无片段。请导入备份或在弹出窗口中添加。',
      'No snippets yet — import a backup or add snippets from the extension popup.': '暂无片段——请导入备份，或从扩展弹出窗口添加片段。',
      'Text': '文本', 'Snippet': '片段', 'now': '刚刚', 'd': '天', 'h': '小时', 'm': '分钟',
      'Data stays on this device': '数据仅保存在此设备', 'No snippets match.': '没有匹配的片段。',
      'No snippets yet. Add one below or open Settings to import.': '暂无片段。请在下方添加，或打开“设置”导入。',
      '(unnamed)': '（未命名）', 'Unnamed': '未命名', 'Imported': '已导入', 'Pasting… ': '正在粘贴… ',
      'No text to paste.': '没有可粘贴的文本。',
      'Clipboard access denied or empty.': '剪贴板访问被拒绝或内容为空。',
      'No target to paste into. Focus a WebMKS console or a text field in the tab.': '没有可粘贴的目标。请聚焦 WebMKS 控制台或当前标签页中的文本框。',
      'Console closed — paste cancelled': '控制台已关闭，粘贴已取消',
      'Paste started.': '已开始粘贴。',
      'Stop paste': '停止粘贴', 'Collapse': '收起', 'Paste or type text here…': '在此粘贴或输入文本…',
      'Paste into VM ': '粘贴到虚拟机 ', 'Name this snippet…': '为此片段命名…', 'Save changes': '保存更改',
      'Edit Snippet': '编辑片段', 'New Snippet': '新建片段',
      'No snippets yet. Click “+ New snippet” below or use the Paste tab to save from clipboard.': '暂无片段。点击下方“+ 新建片段”，或在“粘贴”标签页中从剪贴板保存。',
      'Open paste panel': '打开粘贴面板', 'Language': '语言', '中文': '中文', 'English': 'English',
      'Press Enter in the VM after pasting text.': '文本粘贴完成后，在虚拟机中按下 Enter。',
      'Delay between each character when pasting (0–500 ms). Higher values are slower but more reliable on slow VMs.': '粘贴时每个字符之间的延迟（0–500 毫秒）。数值越大速度越慢，但在较慢的虚拟机上更可靠。',
      'Delay before the first character is sent (0–1000 ms). Gives the VM time to be ready.': '发送首个字符前的延迟（0–1000 毫秒），让虚拟机有时间准备。',
      'Extra delay after each newline when pasting (0–300 ms). Use if the VM is slow to process Enter.': '粘贴时每次换行后的额外延迟（0–300 毫秒），适用于处理 Enter 较慢的虚拟机。',
      'Which tab opens when you click the extension icon: Paste or Snippets.': '点击扩展图标时默认打开“粘贴”或“片段”标签页。',
      'When enabled, pressing Ctrl+V (or ⌘V on Mac) on the WebMKS canvas pastes from the clipboard. Disable to use the browser’s default paste or avoid accidental pastes.': '启用后，在 WebMKS 画布上按 Ctrl+V（Mac 为 ⌘V）即可粘贴剪贴板文本。可关闭以使用浏览器默认行为或避免误粘贴。',
      'When enabled, the floating paste panel opens automatically on WebMKS console pages. When disabled, only the small pill is shown until you expand it.': '启用后，浮动粘贴面板会在 WebMKS 页面自动展开；关闭后仅显示折叠按钮。',
      'Which corner of the WebMKS console view the floating paste panel and pill appear in.': '选择浮动粘贴面板及折叠按钮在 WebMKS 视图中的位置。',
      'When enabled, pastes longer than 500 characters use slower timing and short pauses every 400 chars. Reduces mistyping or dropped characters on slow or busy VMs.': '启用后，超过 500 字符的内容会降低输入速度，并每 400 字符短暂停顿，以减少较慢或繁忙虚拟机中的错字和漏字。',
      'Interface language': '界面语言',
      'Choose the language used by the extension in vCenter/ESXi.': '选择插件在 vCenter/ESXi 中显示的语言。',
      'Language changes are saved locally and take effect after the console page is refreshed.': '语言设置保存在本机，刷新控制台页面后生效。',
      'Help': '帮助'
    }
  };

  let currentLanguage = DEFAULT_LANGUAGE;
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();

  function storageGet(key) {
    return new Promise(function (resolve) {
      try {
        const area = global.chrome && chrome.storage && chrome.storage.local ? chrome.storage.local : null;
        if (area) return area.get([key], function (r) { resolve(r[key]); });
      } catch (_) {}
      resolve(undefined);
    });
  }
  function storageSet(key, value) {
    try { if (global.chrome && chrome.storage && chrome.storage.local) chrome.storage.local.set({ [key]: value }); } catch (_) {}
  }
  function t(text) {
    const dict = dictionaries[currentLanguage] || {};
    return Object.prototype.hasOwnProperty.call(dict, text) ? dict[text] : text;
  }
  function translateNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = originalText.has(node) ? originalText.get(node) : node.nodeValue;
      if (!originalText.has(node)) originalText.set(node, raw);
      const leading = raw.match(/^\s*/)[0], trailing = raw.match(/\s*$/)[0], core = raw.trim();
      if (core) node.nodeValue = leading + t(core) + trailing;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches && node.matches('script,style,code,pre')) return;
    ['placeholder', 'title', 'aria-label'].forEach(function (attr) {
      if (!node.hasAttribute(attr)) return;
      let map = originalAttrs.get(node);
      if (!map) { map = {}; originalAttrs.set(node, map); }
      if (!(attr in map)) map[attr] = node.getAttribute(attr);
      node.setAttribute(attr, t(map[attr]));
    });
    Array.from(node.childNodes).forEach(translateNode);
  }
  function translateDocument() {
    document.documentElement.lang = currentLanguage;
    translateNode(document.body);
    const selector = document.getElementById('vcs-language-select');
    if (selector) { selector.value = currentLanguage; selector.title = t('Language'); selector.setAttribute('aria-label', t('Language')); }
  }
  const readyCallbacks = [];
  let isReady = false;
  function notifyReady() { isReady = true; readyCallbacks.splice(0).forEach(function (fn) { try { fn(); } catch (_) {} }); }
  function init() {
    storageGet(LANGUAGE_KEY).then(function (value) {
      currentLanguage = value === 'en' ? 'en' : DEFAULT_LANGUAGE;
      const isExtensionPage = location.protocol === 'chrome-extension:' || location.protocol === 'moz-extension:' || location.protocol === 'edge-extension:';
      if (isExtensionPage) {
        translateDocument();
        new MutationObserver(function (mutations) {
          mutations.forEach(function (m) { m.addedNodes.forEach(translateNode); });
        }).observe(document.body, { childList: true, subtree: true });
      }
      notifyReady();
    });
  }
  global.VCenterPasteI18n = {
    t: t,
    getLanguage: function(){return currentLanguage;},
    setLanguage: function(v){currentLanguage=v==='en'?'en':DEFAULT_LANGUAGE;storageSet(LANGUAGE_KEY,currentLanguage);translateDocument();},
    translateElement: translateNode,
    onReady: function(fn){ if (isReady) fn(); else readyCallbacks.push(fn); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : this);

});
