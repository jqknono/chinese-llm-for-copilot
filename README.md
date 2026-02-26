# 编码套餐 for Copilot

接入 AI 模型套餐到 VS Code Copilot：目前仅验证智谱 z.ai 套餐接入能力；Kimi、火山云、Minimax、阿里云套餐尚未测试。

## 演示

![基本演示](https://i.imgur.com/IERzt05.gif)

## 安装方式

### 方式一：从 VS Code 插件市场安装（推荐）

- [点击访问 VS Code 插件市场](https://marketplace.visualstudio.com/items?itemName=techfetch-dev.coding-plans-for-copilot)

### 方式二：在 VS Code 中搜索安装

1. 打开 VS Code 扩展面板（`Ctrl+Shift+X` 或 `Cmd+Shift+X`）
2. 搜索 `Coding Plans for Copilot` 或 `编码套餐`
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

- 支持通过配置文件管理模型列表（全供应商共享）
- 支持 Kimi、火山云、Minimax、阿里云套餐模型接入（尚未测试）
- 非 z.ai 提供商如遇问题，请提交 Issue 反馈
- 无缝集成到 VS Code Copilot Chat
- 支持多轮对话
- 可自定义模型参数
- 简单的 API Key 配置
- **中英双语界面支持，默认使用中文**（根据 VS Code 语言设置自动切换）

## GitHub Pages 套餐看板

仓库提供了一个 GitHub Pages 静态看板，用于展示抓取到的各家编码套餐信息（价格、备注、来源和更新时间）。

- 访问路径：https://jqknono.github.io/coding-plans-for-copilot/
- 页面数据源：`assets/provider-pricing.json`

## 多语言支持

支持中英双语界面，根据 VS Code 语言设置自动切换（默认中文）。

## 支持的套餐

| 提供商 | 状态 | 备注 |
| --- | --- | --- |
| 智谱 z.ai | 已验证 | 推荐优先使用 |
| Kimi AI | 尚未测试 | 如遇问题请提交 Issue |
| 火山云 | 尚未测试 | 如遇问题请提交 Issue |
| Minimax | 尚未测试 | 如遇问题请提交 Issue |
| 阿里云百炼套餐 | 尚未测试 | 如遇问题请提交 Issue |

模型列表获取策略：

- 优先调用通用模型接口 `GET /models`
- 若接口返回空或不可用，则回退到 `coding-plans.models` 预置模型列表

## 使用方法

### 1. 获取 API Key

- [智谱 z.ai](https://open.bigmodel.cn/)
- [Kimi AI](https://platform.moonshot.cn/)
- [火山云](https://www.volcengine.com/)
- [Minimax](https://platform.minimaxi.com/)
- [阿里云](https://dashscope.aliyun.com/)

### 2. 配置供应商与 API Key

按 `Ctrl+Shift+P`，输入 `编码套餐: 管理编码套餐配置`，可执行：

- `选择供应商`：从预配置供应商中选择当前使用的 vendor
- `设置 API Key`：写入当前 vendor 的 API Key（保存在配置文件中）
- `设置中转站地址`：更新当前 vendor 的 baseUrl
- `打开配置文件`：手动编辑 `coding-plans.config.json`

### 3. 使用 Copilot Chat

打开 Copilot Chat 面板（`Ctrl+L`），选择 AI 提供商和模型，开始对话。

## 配置选项

配置文件 `coding-plans.config.json`（工作区根目录；无工作区时存放在扩展全局存储）包含可用供应商、baseUrl、API Key、模型与能力。示例：

```json
{
  "schemaVersion": 1,
  "activeVendorId": "aliyun",
  "vendors": [
    {
      "id": "aliyun",
      "displayName": "Aliyun Bailian",
      "apiType": "openai",
      "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
      "apiKey": "YOUR_API_KEY",
      "models": []
    }
  ]
}
```
`apiType` 支持 `openai` 或 `anthropic`。可选 `anthropicVersion`（默认 `2023-06-01`）。

在 VS Code 设置中仍可配置（作为 /models 失败时的兜底）：

- `coding-plans.models`：全局模型 ID 列表（默认包含 deepseek/claude/gpt/gemini 常用模型）
- `coding-plans.modelSettings`：按模型覆盖参数（`contextSize`、`capabilities.tools`、`capabilities.vision`）
模型默认参数：`contextSize=200000`、`tools=true`、`vision=true`。

## 开发

详细的开发指南请查看 [DEV.md](DEV.md)

## 相关链接

- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [智谱 API 文档](https://open.bigmodel.cn/dev/api)
- [Kimi 开放平台](https://platform.moonshot.cn/)
- [Kimi API 文档](https://platform.moonshot.cn/docs)
- [火山引擎](https://www.volcengine.com/)
- [火山云 API 文档](https://www.volcengine.com/docs/82379)
- [VS Code 扩展 API](https://code.visualstudio.com/api)
- 服务问题反馈：请在仓库提交 Issue

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
