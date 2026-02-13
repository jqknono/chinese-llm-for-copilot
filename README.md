# 中国 AI 模型 for Copilot

将智谱 z.ai（已验证）接入 VS Code Copilot，并提供 Kimi、火山云、Minimax、阿里云的 Beta 接入能力（尚未测试）。

## 功能特性

- 支持智谱 z.ai 模型动态查询（已验证）
- 支持 Kimi、火山云、Minimax、阿里云模型的 Beta 接入（尚未测试）
- 非 z.ai 提供商如遇问题，请提交 Issue 反馈
- 无缝集成到 VS Code Copilot Chat
- 支持多轮对话
- 可自定义模型参数
- 简单的 API Key 配置
- **中英双语界面支持，默认使用中文**（根据 VS Code 语言设置自动切换）

## 服务状态

- **智谱 z.ai**：已验证
- **Kimi / 火山云 / Minimax / 阿里云**：Beta（尚未测试）
- Beta 服务如遇问题，请提交 Issue

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

### 智谱 z.ai（已验证）
- 模型列表由厂商接口动态返回

### Kimi AI（Beta，尚未测试）
- 模型列表由厂商接口动态返回

### 火山云（Beta，尚未测试）
- 模型列表由厂商接口动态返回

### Minimax（Beta，尚未测试）
- 模型列表由厂商接口动态返回

### 阿里云通义千问（Beta，尚未测试）
- 模型列表由厂商接口动态返回

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

- **智谱 z.ai（已验证）**: 访问 [智谱 AI 开放平台](https://open.bigmodel.cn/)
- **Kimi AI（Beta，尚未测试）**: 访问 [Kimi 开放平台](https://platform.moonshot.cn/)
- **火山云（Beta，尚未测试）**: 访问 [火山引擎](https://www.volcengine.com/)
- **Minimax（Beta，尚未测试）**: 访问 [Minimax 开放平台](https://platform.minimaxi.com/)
- **阿里云（Beta，尚未测试）**: 访问 [阿里云 DashScope](https://dashscope.aliyun.com/)
- 使用 Beta 服务如遇问题，请提交 Issue

### 2. 配置 API Key

在 VS Code 中：

#### 智谱 z.ai
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

### 智谱 z.ai（已验证）
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.zhipu.apiKey` | string | - | 智谱 AI API Key（必需） |
| `Chinese-AI.zhipu.region` | boolean | true | 是否使用中国大陆接口（`true` 为大陆，`false` 为海外） |

### Kimi AI（Beta，尚未测试）
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.kimi.apiKey` | string | - | Kimi AI API Key（必需） |
| `Chinese-AI.kimi.region` | boolean | true | 是否使用中国大陆接口（`true` 为大陆，`false` 为海外） |

### 火山云（Beta，尚未测试）
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.volcengine.apiKey` | string | - | 火山云 API Key（必需） |
| `Chinese-AI.volcengine.region` | boolean | true | 是否使用中国大陆接口（`true` 为大陆，`false` 为海外） |

### Minimax AI（Beta，尚未测试）
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.minimax.apiKey` | string | - | Minimax API Key（必需） |
| `Chinese-AI.minimax.region` | boolean | true | 是否使用中国大陆接口（`true` 为大陆，`false` 为海外） |

### 阿里云通义千问（Beta，尚未测试）
| 设置项 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `Chinese-AI.aliyun.apiKey` | string | - | 阿里云 DashScope API Key（必需） |

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
│       ├── volcengineProvider.ts     # 火山云提供者
│       └── minimaxProvider.ts        # Minimax 提供者
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
A: 可以！你可以为多个提供商配置 API Key，并在需要时切换使用。请注意，目前仅智谱 z.ai 已验证，其他提供商为 Beta（尚未测试）。

### Q: Beta 提供商遇到问题怎么办？
A: 请在仓库提交 Issue，并附上报错信息、请求模型和复现步骤。

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
