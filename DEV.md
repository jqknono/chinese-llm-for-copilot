# 开发指南

## 编译

```bash
npm run compile
```

## 监听模式

```bash
npm run watch
```

## 代码检查

```bash
npm run lint
```

## 打包发布

```bash
npm run package:vsix
```

发布到插件市场：

```bash
# Linux / macOS
export VSCE_PAT=your_pat
npm run publish:marketplace

# PowerShell
$env:VSCE_PAT="your_pat"
npm run publish:marketplace
```

说明：`npm run publish:marketplace` 会在发布前自动更新 `CHANGELOG.md`（按当前 `package.json` 版本生成对应条目）。

## 编码套餐价格抓取

执行 `npm run pricing:fetch` 抓取编码套餐价格，结果会同时写入：

- `assets/provider-pricing.json`（扩展内使用）
- `docs/provider-pricing.json`（GitHub Pages 展示使用）

GitHub Actions 每周日自动更新价格文件，并触发 GitHub Pages 部署。
