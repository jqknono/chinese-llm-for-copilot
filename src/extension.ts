import * as vscode from 'vscode';
import { ZhipuAIProvider } from './providers/zhipuProvider';
import { KimiAIProvider } from './providers/kimiProvider';
import { VolcengineAIProvider } from './providers/volcengineProvider';
import { MinimaxAIProvider } from './providers/minimaxProvider';
import { AliyunAIProvider } from './providers/aliyunProvider';
import { BaseAIProvider } from './providers/baseProvider';
import { LMChatProviderAdapter } from './providers/lmChatProviderAdapter';
import { initI18n, getMessage } from './i18n/i18n';
import { generateCommitMessage, selectCommitMessageModel } from './commitMessageGenerator';

let providers: Map<string, BaseAIProvider> = new Map();
const BETA_PROVIDER_KEYS = new Set(['kimi', 'volcengine', 'minimax', 'aliyun']);
const warnedBetaProviders = new Set<string>();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 初始化国际化
  await initI18n();

  console.log(getMessage('extensionActivated'));

  // 创建所有 AI 提供者
  const zhipuProvider = new ZhipuAIProvider(context);
  const kimiProvider = new KimiAIProvider(context);
  const volcengineProvider = new VolcengineAIProvider(context);
  const minimaxProvider = new MinimaxAIProvider(context);
  const aliyunProvider = new AliyunAIProvider(context);
  await Promise.all([
    zhipuProvider.initialize(),
    kimiProvider.initialize(),
    volcengineProvider.initialize(),
    minimaxProvider.initialize(),
    aliyunProvider.initialize()
  ]);

  providers.set('zhipu-ai', zhipuProvider);
  providers.set('kimi-ai', kimiProvider);
  providers.set('volcengine-ai', volcengineProvider);
  providers.set('minimax-ai', minimaxProvider);
  providers.set('aliyun-ai', aliyunProvider);

  registerLanguageModelProvider(context, 'zhipu-ai', zhipuProvider);
  registerLanguageModelProvider(context, 'kimi-ai', kimiProvider);
  registerLanguageModelProvider(context, 'volcengine-ai', volcengineProvider);
  registerLanguageModelProvider(context, 'minimax-ai', minimaxProvider);
  registerLanguageModelProvider(context, 'aliyun-ai', aliyunProvider);

  // 注册命令
  registerProviderCommands(context, zhipuProvider, 'zhipu', 'Zhipu z.ai');
  registerProviderCommands(context, kimiProvider, 'kimi', 'Kimi (Beta)');
  registerProviderCommands(context, volcengineProvider, 'volcengine', 'Volcengine (Beta)');
  registerProviderCommands(context, minimaxProvider, 'minimax', 'Minimax (Beta)');
  registerProviderCommands(context, aliyunProvider, 'aliyun', 'Aliyun Qwen (Beta)');

  // 注册生成 commit message 命令
  context.subscriptions.push(
    vscode.commands.registerCommand('Chinese-AI.generateCommitMessage', () => generateCommitMessage(context))
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('Chinese-AI.selectCommitMessageModel', () => selectCommitMessageModel(context))
  );

  // 检查是否有 API Key
  await checkApiKeys();
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
  type ProviderRegion = boolean;
  type ManageActionId =
    | 'configureAll'
    | 'apiKey'
    | 'region';

  interface ManageActionItem extends vscode.QuickPickItem {
    id: ManageActionId;
  }

  const configSection = `Chinese-AI.${providerKey}`;
  const getProviderConfig = () => vscode.workspace.getConfiguration(configSection);
  const maybeShowBetaWarning = () => {
    if (!BETA_PROVIDER_KEYS.has(providerKey) || warnedBetaProviders.has(providerKey)) {
      return;
    }

    warnedBetaProviders.add(providerKey);
    void vscode.window.showWarningMessage(getMessage('betaProviderWarning', providerName));
  };

  const readCurrentRegion = (): ProviderRegion => {
    return getProviderConfig().get<boolean>('region', true);
  };

  const formatRegionLabel = (region: ProviderRegion): string => {
    return region ? getMessage('regionChinaLabel') : getMessage('regionNonChinaLabel');
  };

  const promptApiKey = async (): Promise<string | undefined> => {
    return vscode.window.showInputBox({
      prompt: getMessage('inputApiKey', providerName),
      password: true,
      ignoreFocusOut: true,
      placeHolder: getMessage('inputPlaceholder')
    });
  };

  const pickRegion = async (): Promise<ProviderRegion | undefined> => {
    const currentRegion = readCurrentRegion();
    const regionItems: Array<vscode.QuickPickItem & { value: ProviderRegion }> = [
      {
        label: getMessage('regionChinaLabel'),
        description: currentRegion ? getMessage('currentSelection') : '',
        value: true
      },
      {
        label: getMessage('regionNonChinaLabel'),
        description: !currentRegion ? getMessage('currentSelection') : '',
        value: false
      }
    ];

    const picked = await vscode.window.showQuickPick(regionItems, {
      ignoreFocusOut: true,
      placeHolder: getMessage('selectRegionPlaceholder', providerName)
    });

    return picked?.value;
  };

  const applyRegionUpdate = async (region: ProviderRegion): Promise<boolean> => {
    const config = getProviderConfig();
    const current = config.get<boolean>('region', true);
    if (current === region) {
      return false;
    }
    await config.update('region', region, vscode.ConfigurationTarget.Global);
    return true;
  };

  const applyApiKeyUpdate = async (apiKey: string): Promise<boolean> => {
    const normalized = apiKey.trim();
    if (provider.getApiKey() === normalized) {
      return false;
    }
    await provider.setApiKey(normalized);
    return true;
  };

  const applyUpdates = async (payload: { apiKey?: string; region?: ProviderRegion }): Promise<void> => {
    let changed = false;
    if (payload.apiKey !== undefined) {
      changed = await applyApiKeyUpdate(payload.apiKey) || changed;
    }
    if (payload.region !== undefined) {
      changed = await applyRegionUpdate(payload.region) || changed;
    }
    if (changed) {
      await provider.refreshModels();
    }
  };

  const configureAll = async (): Promise<void> => {
    const apiKey = await promptApiKey();
    if (apiKey === undefined) {
      return;
    }

    const region = await pickRegion();
    if (region === undefined) {
      return;
    }

    await applyUpdates({ apiKey, region });

    vscode.window.showInformationMessage(getMessage('providerConfigSaved', providerName));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(`Chinese-AI.manage.${providerKey}`, async () => {
      maybeShowBetaWarning();

      const actionItems: ManageActionItem[] = [
        { id: 'configureAll', label: getMessage('manageActionConfigureAll') },
        { id: 'apiKey', label: getMessage('manageActionApiKey') },
        { id: 'region', label: getMessage('manageActionRegion') }
      ];

      const pickedAction = await vscode.window.showQuickPick(actionItems, {
        ignoreFocusOut: true,
        placeHolder: getMessage('manageActionPlaceholder', providerName)
      });

      if (!pickedAction) {
        return;
      }

      if (pickedAction.id === 'configureAll') {
        await configureAll();
        return;
      }

      if (pickedAction.id === 'apiKey') {
        const apiKey = await promptApiKey();
        if (apiKey === undefined) {
          return;
        }
        await applyUpdates({ apiKey });
        vscode.window.showInformationMessage(getMessage('apiKeySaved', providerName));
        return;
      }

      if (pickedAction.id === 'region') {
        const region = await pickRegion();
        if (region === undefined) {
          return;
        }
        await applyUpdates({ region });
        vscode.window.showInformationMessage(getMessage('regionSaved', providerName, formatRegionLabel(region)));
        return;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`Chinese-AI.setApiKey.${providerKey}`, async () => {
      maybeShowBetaWarning();
      const apiKey = await promptApiKey();

      if (apiKey !== undefined) {
        await applyUpdates({ apiKey });
        vscode.window.showInformationMessage(getMessage('apiKeySaved', providerName));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`Chinese-AI.refreshModels.${providerKey}`, async () => {
      maybeShowBetaWarning();
      await provider.refreshModels();
      vscode.window.showInformationMessage(getMessage('modelsRefreshed', providerName));
    })
  );

  // 初始化时刷新模型列表
  void provider.refreshModels();
}

async function checkApiKeys(): Promise<void> {
  const zhipuKey = providers.get('zhipu-ai')?.getApiKey() ?? '';
  const kimiKey = providers.get('kimi-ai')?.getApiKey() ?? '';
  const volcengineKey = providers.get('volcengine-ai')?.getApiKey() ?? '';
  const minimaxKey = providers.get('minimax-ai')?.getApiKey() ?? '';
  const aliyunKey = providers.get('aliyun-ai')?.getApiKey() ?? '';

  if (!zhipuKey && !kimiKey && !volcengineKey && !minimaxKey && !aliyunKey) {
    vscode.window.showInformationMessage(
      getMessage('welcomeTitle'),
      getMessage('setZhipuApiKey'),
      getMessage('setKimiApiKey'),
      getMessage('setVolcengineApiKey'),
      getMessage('setMinimaxApiKey'),
      getMessage('setAliyunApiKey')
    ).then(selection => {
      if (selection === getMessage('setZhipuApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.zhipu');
      } else if (selection === getMessage('setKimiApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.kimi');
      } else if (selection === getMessage('setVolcengineApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.volcengine');
      } else if (selection === getMessage('setMinimaxApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.minimax');
      } else if (selection === getMessage('setAliyunApiKey')) {
        vscode.commands.executeCommand('Chinese-AI.setApiKey.aliyun');
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
