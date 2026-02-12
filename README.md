# 中国 AI 模型 for Copilot

将中国主流 AI 模型（智谱 GLM、Kimi、火山云）接入 VS Code Copilot，让开发者可以在 VS Code 中使用国产 AI 模型。

## 功能特性

- 支持智谱 GLM 系列模型（GLM-4, GLM-4 Flash, GLM-4 Plus, GLM-3 Turbo）
- 支持 Kimi AI 系列模型（Kimi 8K, 32K, 128K）
- 支持火山云豆包系列模型（豆包 32K, 豆包 Pro）
- 无缝集成到 VS Code Copilot Chat
- 支持多轮对话
- 可自定义模型参数
- 简单的 API Key 配置
- **中英双语界面支持，默认使用中文**（根据 VS Code 语言设置自动切换）

## 多语言支持

本扩展支持中英双语界面，界面语言会根据 VS Code 的语言设置自动切换：

- **中文环境**（VS Code 语言设置为中文）：显示中文界面
- **英文环境**（VS Code 语言设置为英文）：显示英文界面
- **默认语言**：中文

### 如何切换 VS Code 语言

如果你想切换 VS Code 的界面语言，可以：

1. 打开 VS Code 命令面板（`Ctrl+Shift+P` 或 `Cmd+Shift+P`）
2. 输入并选择 `Configure Display Language`
3. 选择你想要的语言（例如：`zh-cn` 或 `en`）
4. 重启 VS Code

## 支持的模型

### 智谱 GLM
- **GLM-4**: 智谱 GLM-4 模型，适用于复杂对话和推理任务
- **GLM-4 Flash**: 智谱 GLM-4 Flash 模型，快速响应
- **GLM-4 Plus**: 智谱 GLM-4 Plus 模型，增强版
- **GLM-3 Turbo**: 智谱 GLM-3 Turbo 模型，高效版本

### Kimi AI
- **Kimi 8K**: Kimi AI 8K 上下文模型
- **Kimi 32K**: Kimi AI 32K 上下文模型
- **Kimi 128K**: Kimi AI 128K 上下文模型，支持长文本

### 火山云
- **豆包 32K**: 火山云豆包 32K 上下文模型
- **豆包 Pro 32K**: 火山云豆包 Pro 32K 上下文模型
- **豆包 Pro 128K**: 火山云豆包 Pro 128K 上下文模型

## 安装

### 从源码安装

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

### 打包发布

```bash
npm install -g vsce
vsce package
```

这会生成一个 `.vsix` 文件，你可以通过以下命令安装：
```bash
code --install-extension Chinese-AI-copilot-0.0.1.vsix
```

## 使用方法

### 1. 获取 API Key

根据你要使用的提供商获取对应的 API Key：

- **智谱 GLM**: 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
- **Kimi AI**: 访问 [Kimi 开放平台](https://platform.moonshot.cn/)
- **火山云**: 访问 [火山引擎](https://www.volcengine.com/)

### 2. 配置 API Key

在 VS Code 中：

#### 智谱 GLM
- 按 `Ctrl+Shift+P`（或 `Cmd+Shift+P`），输入 `中国 AI: 设置智谱 API Key`
- 或打开设置（`Ctrl+,`），搜索 `Chinese-AI.zhipu.apiKey`

#### Kimi AI
- 按 `Ctrl+Shift+P`，输入 `中国 AI: 设置 Kimi API Key`
- 或打开设置（`Ctrl+,`），搜索 `Chinese-AI.kimi.apiKey`

#### 火山云
- 按 `Ctrl+Shift+P`，输入 `中国 AI: 设置火山云 API Key`
- 或打开设置（`Ctrl+,`），搜索 `Chinese-AI.volcengine.apiKey`

### 3. 使用 Copilot Chat

1. 打开 Copilot Chat 面板（`Ctrl+L` 或 `Cmd+L`）
2. 在模型选择器中选择对应的 AI 提供商和模型
3. 开始对话！

## 配置选项

你可以在 VS Code 设置中配置以下选项：

### 智谱 GLM
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.zhipu.apiKey` | string | - | 智谱 AI API Key（必需） |
| `Chinese-AI.zhipu.baseUrl` | string | https://open.bigmodel.cn/api/coding/paas/v4 | 智谱 API 基础 URL |

### Kimi AI
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.kimi.apiKey` | string | - | Kimi AI API Key（必需） |
| `Chinese-AI.kimi.baseUrl` | string | https://api.moonshot.cn/v1 | Kimi API 基础 URL |

### 火山云
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.volcengine.apiKey` | string | - | 火山云 API Key（必需） |
| `Chinese-AI.volcengine.baseUrl` | string | https://ark.cn-beijing.volces.com/api/v3 | 火山云 API 基础 URL |

## 开发

### 项目结构

```
china-lm-for-copilot/
├── src/
│   ├── extension.ts                  # 扩展入口文件
│   └── providers/                    # 模型提供者目录
│       ├── baseProvider.ts           # 基础提供者抽象类
│       ├── zhipuProvider.ts          # 智谱 GLM 提供者
│       ├── kimiProvider.ts           # Kimi AI 提供者
│       └── volcengineProvider.ts    # 火山云提供者
├── package.json                       # 扩展配置
├── tsconfig.json                     # TypeScript 配置
└── README.md                          # 说明文档
```

### 编译

```bash
npm run compile
```

### 监听模式

```bash
npm run watch
```

### 代码检查

```bash
npm run lint
```

## 常见问题

### Q: 提示 "API Key 无效或已过期"
A: 请检查您的 API Key 是否正确，或者是否已在对应的 AI 开放平台中过期。

### Q: 提示 "已达到速率限制"
A: AI API 通常有速率限制，请稍后再试，或升级您的账户以获得更高的配额。

### Q: 如何切换不同的提供商和模型？
A: 在 Copilot Chat 面板的模型选择器中选择不同的 AI 提供商和模型。

### Q: 能否同时使用多个提供商？
A: 可以！你可以为多个提供商配置 API Key，并在需要时切换使用。

## 相关链接

- [智谱 AI 开放平台](https://open.bigmodel.cn/)
- [智谱 API 文档](https://open.bigmodel.cn/dev/api)
- [Kimi 开放平台](https://platform.moonshot.cn/)
- [Kimi API 文档](https://platform.moonshot.cn/docs)
- [火山引擎](https://www.volcengine.com/)
- [火山云 API 文档](https://www.volcengine.com/docs/82379)
- [VS Code 扩展 API](https://code.visualstudio.com/api)

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
