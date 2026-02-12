import * as vscode from 'vscode';
import { ZhipuAIProvider } from './providers/zhipuProvider';
import { KimiAIProvider } from './providers/kimiProvider';
import { VolcengineAIProvider } from './providers/volcengineProvider';
import { BaseAIProvider } from './providers/baseProvider';
import { LMChatProviderAdapter } from './providers/lmChatProviderAdapter';
import { initI18n, getMessage } from './i18n/i18n';

let providers: Map<string, BaseAIProvider> = new Map();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 初始化国际化
  await initI18n();

  console.log(getMessage('extensionActivated'));

  // 创建所有 AI 提供者
  const zhipuProvider = new ZhipuAIProvider(context);
  const kimiProvider = new KimiAIProvider(context);
  const volcengineProvider = new VolcengineAIProvider(context);

  providers.set('zhipu-ai', zhipuProvider);
  providers.set('kimi-ai', kimiProvider);
  providers.set('volcengine-ai', volcengineProvider);

  registerLanguageModelProvider(context, 'zhipu-ai', zhipuProvider);
  registerLanguageModelProvider(context, 'kimi-ai', kimiProvider);
  registerLanguageModelProvider(context, 'volcengine-ai', volcengineProvider);

  // 注册命令
  registerProviderCommands(context, zhipuProvider, 'zhipu', 'Zhipu GLM');
  registerProviderCommands(context, kimiProvider, 'kimi', 'Kimi');
  registerProviderCommands(context, volcengineProvider, 'volcengine', 'Volcengine');

  // 检查是否有 API Key
  checkApiKeys();
}

function registerLanguageModelProvider(
  context: vscode.ExtensionContext,
  vendor: string,
  provider: BaseAIProvider
): void {
  const adapter = new LMChatProviderAdapter(provider);
  context.subscriptions.push(adapter);
  context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider(vendor, adapter));
}

function registerProviderCommands(
  context: vscode.ExtensionContext,
  provider: BaseAIProvider,
  providerKey: string,
  providerName: string
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(`china-ai.manage.${providerKey}`, async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: getMessage('inputApiKey', providerName),
        password: true,
        ignoreFocusOut: true,
        placeHolder: getMessage('inputPlaceholder')
      });

      if (apiKey !== undefined) {
        await vscode.workspace.getConfiguration(`china-ai.${providerKey}`).update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(getMessage('apiKeySaved', providerName));
        await provider.refreshModels();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`china-ai.setApiKey.${providerKey}`, async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: getMessage('inputApiKey', providerName),
        password: true,
        ignoreFocusOut: true,
        placeHolder: getMessage('inputPlaceholder')
      });

      if (apiKey !== undefined) {
        await vscode.workspace.getConfiguration(`china-ai.${providerKey}`).update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(getMessage('apiKeySaved', providerName));
        await provider.refreshModels();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`china-ai.refreshModels.${providerKey}`, async () => {
      await provider.refreshModels();
      vscode.window.showInformationMessage(getMessage('modelsRefreshed', providerName));
    })
  );

  // 初始化时刷新模型列表
  void provider.refreshModels();
}

function checkApiKeys(): void {
  const zhipuKey = vscode.workspace.getConfiguration('china-ai.zhipu').get<string>('apiKey', '');
  const kimiKey = vscode.workspace.getConfiguration('china-ai.kimi').get<string>('apiKey', '');
  const volcengineKey = vscode.workspace.getConfiguration('china-ai.volcengine').get<string>('apiKey', '');

  if (!zhipuKey && !kimiKey && !volcengineKey) {
    vscode.window.showInformationMessage(
      getMessage('welcomeTitle'),
      getMessage('setZhipuApiKey'),
      getMessage('setKimiApiKey'),
      getMessage('setVolcengineApiKey')
    ).then(selection => {
      if (selection === getMessage('setZhipuApiKey')) {
        vscode.commands.executeCommand('china-ai.setApiKey.zhipu');
      } else if (selection === getMessage('setKimiApiKey')) {
        vscode.commands.executeCommand('china-ai.setApiKey.kimi');
      } else if (selection === getMessage('setVolcengineApiKey')) {
        vscode.commands.executeCommand('china-ai.setApiKey.volcengine');
      }
    });
  }
}

export function deactivate(): void {
  console.log(getMessage('extensionDeactivated'));

  // 清理所有提供者
  providers.forEach(provider => provider.dispose());
  providers.clear();
}
