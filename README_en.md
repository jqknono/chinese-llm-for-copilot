
# Chinese AI Models for Copilot

Integrate Zhipu z.ai (verified) into VS Code Copilot, with Beta support for Kimi, Volcano Cloud, Minimax, and Alibaba Cloud (untested).

## Features

- Supports dynamic querying of Zhipu z.ai models (verified)
- Beta support for Kimi, Volcano Cloud, Minimax, and Alibaba Cloud models (untested)
- For non-z.ai providers, please submit Issues if encountering problems
- Seamless integration with VS Code Copilot Chat
- Supports multi-turn conversations
- Customizable model parameters
- Simple API Key configuration
- **Bilingual UI support (Chinese/English), defaults to Chinese** (auto-switches based on VS Code language settings)

## Service Status

- **Zhipu z.ai**: Verified
- **Kimi / Volcano Cloud / Minimax / Alibaba Cloud**: Beta (untested)
- Submit Issues if encountering problems with Beta services

## Multilingual Support

This extension supports bilingual UI (Chinese/English). The interface language automatically switches based on VS Code settings:

- **Chinese environment** (VS Code set to Chinese): Displays Chinese UI
- **English environment** (VS Code set to English): Displays English UI
- **Default language**: Chinese

### How to Change VS Code Language

To switch VS Code's UI language:

1. Open VS Code Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type and select `Configure Display Language`
3. Choose your preferred language (e.g., `zh-cn` or `en`)
4. Restart VS Code

## Supported Models

### Zhipu z.ai (Verified)
- Model list dynamically returned via provider API

### Kimi AI (Beta, untested)
- Model list dynamically returned via provider API

### Volcano Cloud (Beta, untested)
- Model list dynamically returned via provider API

### Minimax (Beta, untested)
- Model list dynamically returned via provider API

### Alibaba Cloud Tongyi Qianwen (Beta, untested)
- Model list dynamically returned via provider API

## Installation

### Install from Source

1. Clone this repository
2. Install dependencies:
```bash
npm install
```

3. Compile:
```bash
npm run compile
```

4. In VS Code, press `F5` to launch the extension development host for testing

### Package for Release

```bash
npm install -g vsce
vsce package
```

This generates a `.vsix` file. Install it via:
```bash
code --install-extension Chinese-AI-copilot-0.0.1.vsix
```

## Usage

### 1. Obtain API Key

Get API Keys from your chosen provider:

- **Zhipu z.ai (Verified)**: Visit [Zhipu AI Open Platform](https://open.bigmodel.cn/)
- **Kimi AI (Beta, untested)**: Visit [Kimi Open Platform](https://platform.moonshot.cn/)
- **Volcano Cloud (Beta, untested)**: Visit [Volcano Engine](https://www.volcengine.com/)
- **Minimax (Beta, untested)**: Visit [Minimax Open Platform](https://platform.minimaxi.com/)
- **Alibaba Cloud (Beta, untested)**: Visit [Alibaba Cloud DashScope](https://dashscope.aliyun.com/)
- Submit Issues if encountering problems with Beta services

### 2. Configure API Key

In VS Code:

#### Zhipu z.ai
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P`), type `Chinese AI: Set Zhipu API Key`
- Or open Settings (`Ctrl+,`), search for `Chinese-AI.zhipu.apiKey`

#### Kimi AI
- Press `Ctrl+Shift+P`, type `Chinese AI: Set Kimi API Key`
- Or open Settings (`Ctrl+,`), search for `Chinese-AI.kimi.apiKey`

#### Volcano Cloud
- Press `Ctrl+Shift+P`, type `Chinese AI: Set Volcano Cloud API Key`
- Or open Settings (`Ctrl+,`), search for `Chinese-AI.volcengine.apiKey`

### 3. Use Copilot Chat

1. Open Copilot Chat panel (`Ctrl+L` or `Cmd+L`)
2. Select AI provider and model from the model selector
3. Start chatting!

## Configuration Options

Configure these options in VS Code Settings:

### Zhipu z.ai (Verified)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `Chinese-AI.zhipu.apiKey` | string | - | Zhipu AI API Key (required) |
| `Chinese-AI.zhipu.region` | boolean | true | Use Mainland China interface (`true` for Mainland, `false` for overseas) |

### Kimi AI (Beta, untested)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `Chinese-AI.kimi.apiKey` | string | - | Kimi AI API Key (required) |
| `Chinese-AI.kimi.region` | boolean | true | Use Mainland China interface (`true` for Mainland, `false` for overseas) |

### Volcano Cloud (Beta, untested)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `Chinese-AI.volcengine.apiKey` | string | - | Volcano Cloud API Key (required) |
| `Chinese-AI.volcengine.region` | boolean | true | Use Mainland China interface (`true` for Mainland, `false` for overseas) |

### Minimax AI (Beta, untested)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `Chinese-AI.minimax.apiKey` | string | - | Minimax API Key (required) |
| `Chinese-AI.minimax.region` | boolean | true | Use Mainland China interface (`true` for Mainland, `false` for overseas) |

### Alibaba Cloud Tongyi Qianwen (Beta, untested)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `Chinese-AI.aliyun.apiKey` | string | - | Alibaba Cloud DashScope API Key (required) |

## Development

### Project Structure

```
china-lm-for-copilot/
├── src/
│   ├── extension.ts                  # Extension entry file
│   └── providers/                    # Model providers directory
│       ├── baseProvider.ts           # Base provider abstract class
│       ├── zhipuProvider.ts          # Zhipu GLM provider
│       ├── kimiProvider.ts           # Kimi AI provider
│       ├── volcengineProvider.ts     # Volcano Cloud provider
│       └── minimaxProvider.ts        # Minimax provider
├── package.json                      # Extension configuration
├── tsconfig.json                     # TypeScript configuration
└── README.md                         # Documentation
```

### Compile

```bash
npm run compile
```

### Watch Mode

```bash
npm run watch
```

### Lint

```bash
npm run lint
```

## FAQ

### Q: "API Key invalid or expired" error
A: Verify your API Key is correct and hasn't expired on the AI platform.

### Q: "Rate limit reached" error
A: AI APIs typically have rate limits. Try again later or upgrade your account for higher quotas.

### Q: How to switch providers/models?
A: Use the model selector in Copilot Chat panel.

### Q: Can I use multiple providers simultaneously?
A: Yes! Configure API Keys for multiple providers and switch as needed. Note: Only Zhipu z.ai is verified; others are Beta (untested).

### Q: Issues with Beta providers?
A: Submit an Issue with error details, requested model, and reproduction steps.

## Related Links

- [Zhipu AI Open Platform](https://open.bigmodel.cn/)
- [Zhipu API Documentation](https://open.bigmodel.cn/dev/api)
- [Kimi Open Platform](https://platform.moonshot.cn/)
- [Kimi API Documentation](https://platform.moonshot.cn/docs)
- [Volcano Engine](https://www.volcengine.com/)
- [Volcano Cloud API Documentation](https://www.volcengine.com/docs/82379)
- [VS Code Extension API](https://code.visualstudio.com/api)
- Beta service issues: Submit Issues in repository

## License

MIT License

## Contribution

Issues and Pull Requests are welcome!
