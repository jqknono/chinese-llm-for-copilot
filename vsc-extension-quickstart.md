# 欢迎使用中国 AI 模型 for Copilot！

这是一个 VS Code 扩展，将中国主流 AI 模型（智谱 GLM、Kimi、火山云）集成到 Copilot 中。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 编译代码

```bash
npm run compile
```

### 3. 调试扩展

1. 按 `F5` 启动扩展开发主机
2. 在新打开的 VS Code 窗口中，按 `Ctrl+Shift+P`（或 `Cmd+Shift+P`）
3. 选择任一命令设置 API Key：
   - `中国 AI: 设置智谱 API Key`
   - `中国 AI: 设置 Kimi API Key`
   - `中国 AI: 设置火山云 API Key`
4. 输入对应的 API Key

### 4. 测试功能

1. 打开 Copilot Chat 面板（`Ctrl+L` 或 `Cmd+L`）
2. 在模型选择器中选择对应的 AI 提供商和模型
3. 开始对话！

## 支持的 AI 提供商

- **智谱 GLM**: [智谱 AI 开放平台](https://open.bigmodel.cn/)
- **Kimi AI**: [Kimi 开放平台](https://platform.moonshot.cn/)
- **火山云**: [火山引擎](https://www.volcengine.com/)

## 下一步

- 查看 [README.md](README.md) 了解更多详细信息
- 修改代码以添加新功能或新的 AI 提供商
- 使用 `vsce package` 打包扩展

祝使用愉快！
