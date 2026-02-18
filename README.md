# 中国 AI 套餐 for Copilot

接入中国 AI 模型套餐到 VS Code Copilot：智谱 z.ai（已验证），以及 Kimi、火山云、Minimax、阿里云的 Beta 套餐接入能力（尚未测试）。

## 演示

![基本演示](https://i.imgur.com/IERzt05.gif)

## 安装方式

### 方式一：从 VS Code 插件市场安装（推荐）

- [点击访问 VS Code 插件市场](https://marketplace.visualstudio.com/items?itemName=techfetch-dev.chinese-ai-plans-for-copilot)

### 方式二：在 VS Code 中搜索安装

1. 打开 VS Code 扩展面板（`Ctrl+Shift+X` 或 `Cmd+Shift+X`）
2. 搜索 `Chinese AI Plans for Copilot` 或 `中国 AI 套餐`
3. 点击安装

### 方式三：从源码安装

1. 克隆本仓库
2. 安装依赖：
```bash
npm install
```

3. 编译：
```bash
npm run compile
```

4. 在 VS Code 中，按 `F5` 启动扩展开发主机进行测试

## 功能特性

- 支持智谱 z.ai 套餐模型动态查询（已验证）
- 支持 Kimi、火山云、Minimax、阿里云套餐模型的 Beta 接入（尚未测试）
- 非 z.ai 提供商如遇问题，请提交 Issue 反馈
- 无缝集成到 VS Code Copilot Chat
- 支持多轮对话
- 可自定义模型参数
- 简单的 API Key 配置
- **中英双语界面支持，默认使用中文**（根据 VS Code 语言设置自动切换）

## GitHub Pages 套餐看板

仓库提供了一个 GitHub Pages 静态看板，用于展示抓取到的各家编码套餐信息（价格、备注、来源和更新时间）。

- 访问路径：https://jqknono.github.io/chinese-llm-for-copilot/
- 页面数据文件：`docs/provider-pricing.json`

## 服务状态

- **智谱 z.ai**：已验证
- **Kimi / 火山云 / Minimax / 阿里云**：Beta（尚未测试）
- Beta 服务如遇问题，请提交 Issue

## 多语言支持

支持中英双语界面，根据 VS Code 语言设置自动切换（默认中文）。

## 支持的模型

- **智谱 z.ai**（已验证）
- **Kimi AI**（Beta，尚未测试）
- **火山云**（Beta，尚未测试）
- **Minimax**（Beta，尚未测试）
- **阿里云通义千问**（Beta，尚未测试）

模型列表由厂商接口动态返回

## 使用方法

### 1. 获取 API Key

- [智谱 z.ai](https://open.bigmodel.cn/)
- [Kimi AI](https://platform.moonshot.cn/)
- [火山云](https://www.volcengine.com/)
- [Minimax](https://platform.minimaxi.com/)
- [阿里云](https://dashscope.aliyun.com/)

### 2. 配置 API Key

按 `Ctrl+Shift+P`，输入 `中国 AI: 设置 [提供商] API Key`。API Key 会保存到 VS Code Secret Storage。

### 3. 使用 Copilot Chat

打开 Copilot Chat 面板（`Ctrl+L`），选择 AI 提供商和模型，开始对话。

## 配置选项

在 VS Code 设置中配置 `region` 选项：`true` 为中国大陆接口，`false` 为海外接口。

## 开发

详细的开发指南请查看 [DEV.md](DEV.md)

## 常见问题

**Q: API Key 无效？**  
A: 检查 API Key 是否正确或已过期。

**Q: 提示速率限制？**  
A: 稍后再试或升级账户配额。

**Q: 如何切换提供商？**  
A: 在 Copilot Chat 面板的模型选择器中选择。

**Q: Beta 提供商遇到问题？**  
A: 请提交 Issue，附上报错信息和复现步骤。

## 相关链接

- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [智谱 API 文档](https://open.bigmodel.cn/dev/api)
- [Kimi 开放平台](https://platform.moonshot.cn/)
- [Kimi API 文档](https://platform.moonshot.cn/docs)
- [火山引擎](https://www.volcengine.com/)
- [火山云 API 文档](https://www.volcengine.com/docs/82379)
- [VS Code 扩展 API](https://code.visualstudio.com/api)
- Beta 服务问题反馈：请在仓库提交 Issue

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
