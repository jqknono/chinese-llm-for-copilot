import * as vscode from 'vscode';
import { ZhipuAIProvider } from './providers/zhipuProvider';
import { KimiAIProvider } from './providers/kimiProvider';
import { VolcengineAIProvider } from './providers/volcengineProvider';
import { MinimaxAIProvider } from './providers/minimaxProvider';
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
  const minimaxProvider = new MinimaxAIProvider(context);

  providers.set('zhipu-ai', zhipuProvider);
  providers.set('kimi-ai', kimiProvider);
  providers.set('volcengine-ai', volcengineProvider);
  providers.set('minimax-ai', minimaxProvider);

  registerLanguageModelProvider(context, 'zhipu-ai', zhipuProvider);
  registerLanguageModelProvider(context, 'kimi-ai', kimiProvider);
  registerLanguageModelProvider(context, 'volcengine-ai', volcengineProvider);
  registerLanguageModelProvider(context, 'minimax-ai', minimaxProvider);

  // 注册命令
  registerProviderCommands(context, zhipuProvider, 'zhipu', 'Zhipu GLM');
  registerProviderCommands(context, kimiProvider, 'kimi', 'Kimi');
  registerProviderCommands(context, volcengineProvider, 'volcengine', 'Volcengine');
  registerProviderCommands(context, minimaxProvider, 'minimax', 'Minimax');

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
    vscode.commands.registerCommand(`Chinese-AI.manage.${providerKey}`, async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: getMessage('inputApiKey', providerName),
        password: true,
        ignoreFocusOut: true,
        placeHolder: getMessage('inputPlaceholder')
      });

      if (apiKey !== undefined) {
        await vscode.workspace.getConfiguration(`Chinese-AI.${providerKey}`).update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(getMessage('apiKeySaved', providerName));
        await provider.refreshModels();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`Chinese-AI.setApiKey.${providerKey}`, async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: getMessage('inputApiKey', providerName),
        password: true,
        ignoreFocusOut: true,
        placeHolder: getMessage('inputPlaceholder')
      });

      if (apiKey !== undefined) {
        await vscode.workspace.getConfiguration(`Chinese-AI.${providerKey}`).update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(getMessage('apiKeySaved', providerName));
        await provider.refreshModels();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`Chinese-AI.refreshModels.${providerKey}`, async () => {
      await provider.refreshModels();
      vscode.window.showInformationMessage(getMessage('modelsRefreshed', providerName));
    })
  );

  // 初始化时刷新模型列表
  void provider.refreshModels();
}

function checkApiKeys(): void {
  const zhipuKey = vscode.workspace.getConfiguration('Chinese-AI.zhipu').get<string>('apiKey', '');
  const kimiKey = vscode.workspace.getConfiguration('Chinese-AI.kimi').get<string>('apiKey', '');
  const volcengineKey = vscode.workspace.getConfiguration('Chinese-AI.volcengine').get<string>('apiKey', '');
  const minimaxKey = vscode.workspace.getConfiguration('Chinese-AI.minimax').get<string>('apiKey', '');

  if (!zhipuKey && !kimiKey && !volcengineKey && !minimaxKey) {
    vscode.window.showInformationMessage(
      getMessage('welcomeTitle'),
      getMessage('setZhipuApiKey'),
      getMessage('setKimiApiKey'),
      getMessage('setVolcengineApiKey'),
      getMessage('setMinimaxApiKey')
    ).then(selection => {
      if (selection === getMessage('setZhipuApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.zhipu');
      } else if (selection === getMessage('setKimiApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.kimi');
      } else if (selection === getMessage('setVolcengineApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.volcengine');
      } else if (selection === getMessage('setMinimaxApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.minimax');
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
