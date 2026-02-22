# 欢迎使用编码套餐 for Copilot！

这是一个 VS Code 扩展，将智谱 z.ai（已验证）以及 Kimi/火山云/Minimax/阿里云（Beta，尚未测试）的套餐能力集成到 Copilot 中。

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
   - `编码套餐: 设置智谱 API Key`
   - `编码套餐: 设置 Kimi API Key (Beta)`
   - `编码套餐: 设置火山云 API Key (Beta)`
   - `编码套餐: 设置 Minimax API Key (Beta)`
   - `编码套餐: 设置阿里云 API Key (Beta)`
4. 输入对应的 API Key
5. API Key 会保存到 VS Code Secret Storage，不写入 `settings.json`

### 4. 测试功能

1. 打开 Copilot Chat 面板（`Ctrl+L` 或 `Cmd+L`）
2. 在模型选择器中选择对应的 AI 提供商和模型
3. 开始对话（非 z.ai 提供商为 Beta，遇到问题请提交 Issue）

## 支持的 AI 提供商

- **智谱 z.ai（已验证）**: [智谱 AI 开放平台](https://open.bigmodel.cn/)
- **Kimi AI（Beta，尚未测试）**: [Kimi 开放平台](https://platform.moonshot.cn/)
- **火山云（Beta，尚未测试）**: [火山引擎](https://www.volcengine.com/)
- **Minimax（Beta，尚未测试）**: [Minimax 开放平台](https://platform.minimaxi.com/)
- **阿里云（Beta，尚未测试）**: [阿里云 DashScope](https://dashscope.aliyun.com/)
- Beta 服务遇到问题请提交 Issue

## 下一步

- 查看 [README.md](README.md) 了解更多详细信息
- 修改代码以添加新功能或新的 AI 提供商
- 使用 `vsce package` 打包扩展

祝使用愉快！
