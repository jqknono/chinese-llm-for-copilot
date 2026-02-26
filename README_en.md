
# Coding Plans for Copilot

Integrate Zhipu (verified) into VS Code Copilot, with Beta support for Kimi, Volcano Cloud, Minimax, and Alibaba Cloud (untested).

## Features

- Supports configuration-driven model list management (shared across all providers)
- Beta support for Kimi, Volcano Cloud, Minimax, and Alibaba Cloud models (untested)
- For non-z.ai providers, please submit Issues if encountering problems
- Seamless integration with VS Code Copilot Chat
- Supports multi-turn conversations
- Customizable model parameters
- Simple API Key configuration
- **Bilingual UI support (Chinese/English)** (auto-switches based on VS Code language settings)

## Service Status

- **Zhipu**: Verified
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

### Zhipu (Verified)
- Model list is fetched from generic `GET /models` first, then falls back to `coding-plans.models` if unavailable or empty

### Kimi AI (Beta, untested)
- Model list is fetched from generic `GET /models` first, then falls back to `coding-plans.models` if unavailable or empty

### Volcano Cloud (Beta, untested)
- Model list is fetched from generic `GET /models` first, then falls back to `coding-plans.models` if unavailable or empty

### Minimax (Beta, untested)
- Model list is fetched from generic `GET /models` first, then falls back to `coding-plans.models` if unavailable or empty

### Alibaba Cloud Tongyi Qianwen (Beta, untested)
- Model list is fetched from generic `GET /models` first, then falls back to `coding-plans.models` if unavailable or empty

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
code --install-extension coding-plans-for-copilot-0.1.0.vsix
```

## Usage

### 1. Obtain API Key

Get API Keys from your chosen provider:

- **Zhipu (Verified)**: Visit [Zhipu AI Open Platform](https://open.bigmodel.cn/)
- **Kimi AI (Beta, untested)**: Visit [Kimi Open Platform](https://platform.moonshot.cn/)
- **Volcano Cloud (Beta, untested)**: Visit [Volcano Engine](https://www.volcengine.com/)
- **Minimax (Beta, untested)**: Visit [Minimax Open Platform](https://platform.minimaxi.com/)
- **Alibaba Cloud (Beta, untested)**: Visit [Alibaba Cloud DashScope](https://dashscope.aliyun.com/)
- Submit Issues if encountering problems with Beta services

### 2. Configure API Key

In VS Code:

- Press `Ctrl+Shift+P` (or `Cmd+Shift+P`), type `Coding Plans: Manage Coding Plans Configuration`
- Use:
  - `Select Vendor` to choose the active vendor profile
  - `Set API Key` to store the API key in the config file
  - `Set Relay Base URL` to update the vendor base URL
  - `Open Config File` to edit `coding-plans.config.json`

### 3. Use Copilot Chat

1. Open Copilot Chat panel (`Ctrl+L` or `Cmd+L`)
2. Select AI provider and model from the model selector
3. Start chatting!

## Configuration Options

The config file `coding-plans.config.json` (workspace root; falls back to extension global storage) defines vendors, baseUrl, apiKey, models, and capabilities. Example:

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
`apiType` supports `openai` or `anthropic`. Optional `anthropicVersion` defaults to `2023-06-01`.

Configure these options in VS Code Settings as fallback when `/models` is unavailable:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `coding-plans.models` | array of string | deepseek/claude/gpt/gemini defaults | Global model IDs shared by all providers |
| `coding-plans.modelSettings` | object | `{}` | Per-model overrides: `contextSize`, `capabilities.tools`, `capabilities.vision` |

Default model settings: `contextSize=200000`, `tools=true`, `vision=true`.

## Development

### Project Structure

```
china-lm-for-copilot/
├── src/
│   ├── extension.ts                  # Extension entry file
│   └── providers/                    # Model providers directory
│       ├── baseProvider.ts           # Base provider abstract class
│       ├── genericProvider.ts        # Generic provider (OpenAI/Anthropic)
│       └── baseProvider.ts           # Base provider abstract class
│   └── config/
│       └── configStore.ts            # Vendor config loader
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
A: Yes! Configure API Keys for multiple providers and switch as needed. Note: Only Zhipu is verified; others are Beta (untested).

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
