# vCenter 粘贴工具

[English Documentation / 英文文档](README.en.md)
**vCenter Paste Assistant** 是一款适用于 Chrome、Edge 和 Firefox 的浏览器扩展，可将剪贴板文本及已保存的命令片段逐字符输入 VMware vCenter 或独立 ESXi 的 Web 控制台（WebMKS）。

> 当前版本：**1.0.0**。本扩展使用 DOM `KeyboardEvent` 模拟键盘输入，不依赖 VMware Tools。

## 主要功能

- 在检测到的 WebMKS 控制台中显示现代化浮动面板
- 控制台聚焦时支持 `Ctrl+V` / `Command+V`
- 在扩展弹窗中编辑文本并发送到虚拟机
- 保存、搜索、排序、编辑片段
- 支持片段 JSON 导入和导出
- 可设置首字符、字符间隔和换行延迟
- 支持自动 Enter、长文本进度显示及取消
- 默认简体中文，可在扩展程序选项中切换为 English
- 剪贴板、片段及设置仅在浏览器本地处理

## 界面预览

### WebMKS 浮动粘贴窗口

![WebMKS 浮动粘贴窗口](assets/screenshots/1.png)

### 文本粘贴

![文本粘贴界面](assets/screenshots/2.png)

### 常用片段

![常用片段界面](assets/screenshots/3.png)

### 扩展设置

![扩展设置](assets/screenshots/4.png)

![扩展设置](assets/screenshots/5.png)

## 已验证

### VMware 环境

- vSphere Client 8
- ESXi 8.0.0
- ESXi 7.0.3
- ESXi 6.7.0

### 输入场景

- Linux 登录 Shell
- Windows 登录界面
- 小写、大写和数字
- `@ : / \ |` 等常用符号
- 单行和多行文本
- vCenter/ESXi WebMKS 控制台

## 安装测试

1. 打开 [Releases](https://github.com/hkrt69iruk/vCenter-Paste-Assistant/releases/tag/v1.0.0)，下载 `vcenter-paste-assistant-v1.0.0.zip`。
2. 解压发布压缩包。
3. 打开 `chrome://extensions/` 或 `edge://extensions/`。
4. 开启“开发者模式”。
5. 点击“加载已解压的扩展程序”。
6. 选择解压后的扩展目录。
7. 打开 vCenter/ESXi 虚拟机 Web 控制台并刷新页面。
8. 聚焦控制台，通过浮动面板或扩展弹窗发送文本。

## 语言设置

默认使用简体中文。打开浏览器扩展管理页，进入：

**vCenter 粘贴工具 → 详细信息 → 扩展程序选项 → 语言**

选择 English 后，刷新 vCenter/ESXi WebMKS 控制台页面即可生效。

## 使用说明

### 粘贴文本

1. 聚焦虚拟机控制台。
2. 按 `Ctrl+V` / `Command+V`，或打开浮动面板。
3. 检查待发送文本。
4. 点击“粘贴到虚拟机”。

### 管理片段

- 新建片段：填写名称与内容后保存。
- 发送片段：在片段列表点击“发送”。
- 调整顺序：拖动片段重新排序。
- 迁移数据：通过设置页导入或导出 JSON。

示例文件见 [`example-snippets.json`](example-snippets.json)。

## 兼容性与限制

- 文本按 US-ANSI 键盘布局转换为键盘事件并逐字符输入。
- 换行符会转换为 Enter。
- 这是模拟键盘输入，不是真正的双向剪贴板同步。
- 适合 Shell 命令、IP 地址、URL、用户名及 ASCII 文本。
- Unicode/中文直接输入可能受 Guest OS 输入法和 WebMKS 行为影响。
- 多行文本可能触发连续执行，发送前应检查内容。
- 扩展需要访问 HTTP/HTTPS 页面，因为私有 vCenter/ESXi 可能使用任意域名或 IP；仅在检测到 WebMKS 特征时显示界面。

## 项目结构

```text
extension/              浏览器扩展源码
scripts/                构建与校验脚本
assets/                 项目图片资源
docs/                   隐私政策等文档
example-snippets.json   示例片段
README.zh-CN.md         中文说明
README.en.md            English documentation
```

## 隐私

扩展不会上传剪贴板文本、片段或设置，不包含分析、跟踪像素及远程日志。完整说明见[隐私政策](docs/PRIVACY_POLICY.md)。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方来源代码的原版权声明按许可证要求保留。
