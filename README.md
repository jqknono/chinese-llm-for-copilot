# 编码套餐 for Copilot

**一键切换多厂商 AI 模型，打破 Copilot 套餐限制。**

支持智谱 z.ai、Kimi、火山云、Minimax、阿里云等国产大厂编码套餐，无需改变使用习惯，直接在 VS Code Copilot Chat 中无缝调用。

---

## 核心特性

- **多厂商统一接入**：一键切换 5+ 主流国产 AI 厂商，配置一次即可使用所有支持模型
- **零学习成本**：完全集成到 VS Code Copilot Chat，不改变任何操作习惯
- **灵活模型管理**：支持动态拉取 `/models` 端点，也可自定义模型列表与参数
- **智能 Commit 生成**：基于 Git 变更自动生成符合 Conventional Commits 规范的提交消息
- **中英双语支持**：根据 VS Code 语言设置自动切换（默认中文）
- **企业级安全**：API Key 使用 VS Code Secret Storage 本地保存，不上云不共享

---

## 快速开始

### 安装

**推荐方式**：在 VS Code 扩展市场搜索「编码套餐」或 `Coding Plans for Copilot` 直接安装。

[访问 VS Code 插件市场](https://marketplace.visualstudio.com/items?itemName=techfetch-dev.coding-plans-for-copilot)

### 配置

1. 按 `Ctrl+Shift+P`，输入 `编码套餐: 管理编码套餐配置`
2. 选择「选择供应商」，选择你已注册的平台（如智谱 z.ai、Kimi 等）
3. 选择「设置 API Key」，粘贴你的 API Key
4. 打开 Copilot Chat（`Ctrl+L`），切换到「编码套餐」提供商

### 配置入口

1. 按 `Ctrl+Shift+P`，输入 `编码套餐: 管理编码套餐配置`
2. 插件会打开设置页并定位到 `coding-plans.vendors`
3. 也可以直接编辑 `settings.json`

### 基础配置示例（settings.json）

```json
{
  "coding-plans.vendors": [
    {
      "name": "zhipu",
      "baseUrl": "https://open.bigmodel.cn/api/coding/paas/v4",
      "useModelsEndpoint": false,
      "models": [
        {
          "name": "glm-4.7",
          "description": "智谱 GLM-4.7",
          "capabilities": {
            "tools": true,
            "vision": false
          },
          "maxInputTokens": 128000,
          "maxOutputTokens": 128000
        }
      ]
    }
  ],
  "coding-plans.commitMessage.showGenerateCommand": true,
  "coding-plans.commitMessage.language": "zh-cn",
  "coding-plans.commitMessage.options": {
    "pipelineMode": "single",
    "maxBodyBulletCount": 7,
    "subjectMaxLength": 72
  }
}
```

### 可配置项说明

| 配置键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `coding-plans.vendors` | `array` | 内置供应商模板 | 供应商配置列表。 |
| `coding-plans.vendors[].name` | `string` | 必填 | 供应商唯一名称（用于匹配与选择）。 |
| `coding-plans.vendors[].baseUrl` | `string` | 必填 | 供应商 API 基础地址，可填写自建中转站。 |
| `coding-plans.vendors[].useModelsEndpoint` | `boolean` | `false` | 为 `true` 时刷新模型会请求 `/models`。 |
| `coding-plans.vendors[].models` | `array` | `[]` | 手动模型清单。 |
| `coding-plans.vendors[].models[].name` | `string` | 必填 | 模型名称。 |
| `coding-plans.vendors[].models[].description` | `string` | 空 | 模型描述。 |
| `coding-plans.vendors[].models[].capabilities.tools` | `boolean` | `true` | 是否启用工具调用能力。 |
| `coding-plans.vendors[].models[].capabilities.vision` | `boolean` | `false` | 是否启用视觉输入能力。 |
| `coding-plans.vendors[].models[].maxInputTokens` | `number` | `200000` | 模型最大输入 token。 |
| `coding-plans.vendors[].models[].maxOutputTokens` | `number` | `200000` | 模型最大输出 token。 |
| `coding-plans.commitMessage.showGenerateCommand` | `boolean` | `true` | 是否显示“生成 Commit 消息”命令。 |
| `coding-plans.commitMessage.language` | `string` | `en` | 提交消息语言，支持 `en` / `zh-cn`。 |
| `coding-plans.commitMessage.useRecentCommitStyle` | `boolean` | `false` | 是否参考最近 20 条 commit 风格。 |
| `coding-plans.commitMessage.modelVendor` | `string` | 空 | 生成提交消息时优先使用的供应商名。 |
| `coding-plans.commitMessage.modelId` | `string` | 空 | 生成提交消息时优先使用的模型名。 |
| `coding-plans.commitMessage.options.prompt` | `string` | 内置提示词 | 覆盖生成提示词。 |
| `coding-plans.commitMessage.options.maxDiffLines` | `number` | `3000` | 读取 diff 的最大行数。 |
| `coding-plans.commitMessage.options.pipelineMode` | `string` | `single` | 生成管线：`single` / `two-stage` / `auto`。 |
| `coding-plans.commitMessage.options.summaryTriggerLines` | `number` | `1200` | 触发摘要模式的 diff 行数阈值。 |
| `coding-plans.commitMessage.options.summaryChunkLines` | `number` | `800` | 摘要模式每段行数。 |
| `coding-plans.commitMessage.options.summaryMaxChunks` | `number` | `12` | 摘要分段最大数量。 |
| `coding-plans.commitMessage.options.maxBodyBulletCount` | `number` | `7` | 正文 bullet 最大数量。 |
| `coding-plans.commitMessage.options.subjectMaxLength` | `number` | `72` | 标题最大长度。 |
| `coding-plans.commitMessage.options.requireConventionalType` | `boolean` | `true` | 是否强制 Conventional Commits 类型。 |
| `coding-plans.commitMessage.options.warnOnValidationFailure` | `boolean` | `true` | 校验失败时是否提示告警。 |
| `coding-plans.models` | `array` | `[]` | 高级兜底：当 `/models` 不可用时，作为可选模型列表。 |
| `coding-plans.modelSettings` | `object` | `{}` | 高级兜底：按模型覆盖 token 与能力参数。 |

`API Key` 不在 `settings.json` 明文存储。请通过「设置 API Key」写入 VS Code Secret Storage。

## 高级功能

### 智能 Commit 消息生成

1. 按 `Ctrl+Shift+P`，输入 `编码套餐: 生成 Commit 消息`
2. 插件会分析当前 Git 变更，自动生成符合规范的提交消息
3. 可选择使用的模型（默认使用当前配置的供应商）

### 多工作区独立配置

供应商配置可按工作区/文件夹保存；API Key 按供应商名保存在 VS Code Secret Storage（本地）。

### 套餐价格看板

访问 [GitHub Pages 套餐看板](https://jqknono.github.io/coding-plans-for-copilot/) 查看各厂商编码套餐价格与更新时间。

---

## 开发指南

详细的开发文档请查看 [DEV.md](DEV.md)

### 快速命令

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式（开发时使用）
npm run watch

# 代码检查
npm run lint

# 打包发布
npm run package:vsix
```

---

## 更新日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本更新详情。

---

## 问题反馈

- **功能建议**：提交 [Issue](https://github.com/jqknono/coding-plans-for-copilot/issues)
- **使用问题**：在 Issue 中附上错误日志和 `settings.json` 相关配置片段（隐去敏感信息）
- **厂商接入**：欢迎提交 Pull Request

---

## 许可证

MIT License

---

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交变更 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request
