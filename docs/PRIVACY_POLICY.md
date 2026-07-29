# vCenter 粘贴工具隐私政策

[English](#english)

- **扩展名称：** vCenter 粘贴工具（vCenter Paste Assistant）
- **官方仓库：** <https://github.com/hkrt69iruk/vCenter-Paste-Assistant>
- **问题反馈：** <https://github.com/hkrt69iruk/vCenter-Paste-Assistant/issues>
- **最后更新：** 2026-07-29

## 中文

本隐私政策说明 **vCenter 粘贴工具（vCenter Paste Assistant）** 浏览器扩展如何处理用户数据。本扩展完全在浏览器本地运行，不设置开发者服务器，也不会将剪贴板文本、片段、设置或虚拟机控制台内容上传到外部服务。

### 数据处理原则

- **本地处理：** 扩展功能在用户浏览器及当前 VMware WebMKS 控制台页面中运行。
- **用户主动触发：** 仅在用户点击粘贴按钮、使用扩展面板，或在控制台聚焦时按下 `Ctrl+V` / `Command+V` 后读取剪贴板纯文本。
- **不收集、不上传：** 不会收集、出售、共享或上传用户数据。
- **无分析和跟踪：** 不使用统计分析、跟踪像素、广告 SDK、远程日志或跟踪 Cookie。

### 剪贴板内容

扩展在用户主动执行粘贴操作时读取剪贴板中的纯文本，并将文本转换为键盘事件，逐字符输入 VMware vCenter/ESXi WebMKS 虚拟机控制台。

- 剪贴板文本只在完成当前操作所需的时间内保留在内存中。
- 剪贴板文本不会保存到扩展存储。
- 剪贴板文本不会发送到开发者或任何第三方服务器。

### 片段和设置

用户创建的片段以及语言、输入延迟、自动回车、浮动窗口位置等设置保存在浏览器提供的 `chrome.storage.local` 中。

- 数据仅保存在当前浏览器配置文件及当前扩展实例中。
- 扩展不会主动将数据同步到云端。
- 用户可以通过浏览器扩展管理功能清除这些数据，也可以卸载扩展来删除本地数据。

### 权限说明

| 权限 | 用途 |
|---|---|
| `clipboardRead` | 在用户主动粘贴时读取剪贴板纯文本。 |
| `storage` | 在浏览器本地保存片段、设置和语言偏好。 |
| `tabs` | 将用户请求发送的文本交给当前活动标签页中的 WebMKS 控制台脚本处理。 |
| HTTP/HTTPS 主机访问权限 | 私有 vCenter/ESXi 可能使用任意域名或 IP 地址；扩展需要在相应页面检测 WebMKS 控制台并显示操作界面。 |

### 数据共享与远程通信

本扩展不会：

- 将剪贴板、片段、设置或控制台内容发送给开发者或第三方；
- 使用远程代码、远程配置或远程日志；
- 出售、出租或共享用户数据；
- 将用户数据用于广告、画像或信用评估。

只有在用户主动点击扩展中的 GitHub 或隐私政策链接时，浏览器才会打开本项目的 GitHub 页面；该访问受 GitHub 自身隐私政策约束。

### 联系方式

如有隐私或功能问题，请在官方仓库的 [Issues 页面](https://github.com/hkrt69iruk/vCenter-Paste-Assistant/issues)提交。

---

<a id="english"></a>

# vCenter Paste Assistant Privacy Policy

- **Extension:** vCenter Paste Assistant
- **Official repository:** <https://github.com/hkrt69iruk/vCenter-Paste-Assistant>
- **Issue tracker:** <https://github.com/hkrt69iruk/vCenter-Paste-Assistant/issues>
- **Last updated:** July 29, 2026

This policy explains how the **vCenter Paste Assistant** browser extension handles user data. The extension runs entirely in the browser, uses no developer-operated server, and does not upload clipboard text, snippets, settings, or virtual-machine console content to external services.

### Data processing principles

- **Local processing:** Extension features run in the user's browser and the active VMware WebMKS console page.
- **Explicit user action:** Plain-text clipboard content is read only after the user clicks a paste control, uses the extension panel, or presses `Ctrl+V` / `Command+V` while the console is focused.
- **No collection or upload:** User data is not collected, sold, shared, or uploaded.
- **No analytics or tracking:** The extension uses no analytics, tracking pixels, advertising SDKs, remote logging, or tracking cookies.

### Clipboard contents

After an explicit paste action, the extension reads plain text from the clipboard, converts it to keyboard events, and types it into a VMware vCenter/ESXi WebMKS virtual-machine console one character at a time.

- Clipboard text remains in memory only for the time required to complete the current operation.
- Clipboard text is not saved to extension storage.
- Clipboard text is not sent to the developer or any third-party server.

### Snippets and settings

User-created snippets and preferences—including language, typing delays, automatic Enter, and floating-panel position—are stored in the browser-provided `chrome.storage.local` storage area.

- Data remains within the current browser profile and extension installation.
- The extension does not automatically synchronize this data to the cloud.
- Users can remove the data through browser extension controls or by uninstalling the extension.

### Permissions

| Permission | Purpose |
|---|---|
| `clipboardRead` | Read plain-text clipboard content after an explicit user paste action. |
| `storage` | Store snippets, settings, and language preferences locally in the browser. |
| `tabs` | Deliver user-requested text to the WebMKS console script in the active tab. |
| HTTP/HTTPS host access | Private vCenter/ESXi systems may use arbitrary hostnames or IP addresses; access is required to detect WebMKS consoles and display the extension interface. |

### Data sharing and remote communication

The extension does not:

- send clipboard text, snippets, settings, or console content to the developer or third parties;
- use remote code, remote configuration, or remote logging;
- sell, rent, or share user data;
- use user data for advertising, profiling, or credit assessment.

Only when the user explicitly clicks a GitHub or Privacy Policy link does the browser open this project's GitHub page. That visit is governed by GitHub's own privacy policy.

### Contact

For privacy or functionality questions, open an issue on the official [Issues page](https://github.com/hkrt69iruk/vCenter-Paste-Assistant/issues).
