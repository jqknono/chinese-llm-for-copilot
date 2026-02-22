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
const OLD_NAMESPACE = 'Chinese-AI';
const NEW_NAMESPACE = 'coding-plans';
const MIGRATION_NOTICE_SHOWN_KEY = 'coding-plans.migration.noticeShown';
const PROVIDER_KEYS = ['zhipu', 'kimi', 'volcengine', 'minimax', 'aliyun'] as const;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // 初始化国际化
  await initI18n();

  console.log(getMessage('extensionActivated'));

  await migrateChineseAISettingsToCodingPlans(context);

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
    vscode.commands.registerCommand('coding-plans.generateCommitMessage', generateCommitMessage)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('coding-plans.selectCommitMessageModel', selectCommitMessageModel)
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

  const configSection = `${NEW_NAMESPACE}.${providerKey}`;
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
    vscode.commands.registerCommand(`coding-plans.manage.${providerKey}`, async () => {
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
    vscode.commands.registerCommand(`coding-plans.setApiKey.${providerKey}`, async () => {
      maybeShowBetaWarning();
      const apiKey = await promptApiKey();

      if (apiKey !== undefined) {
        await applyUpdates({ apiKey });
        vscode.window.showInformationMessage(getMessage('apiKeySaved', providerName));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(`coding-plans.refreshModels.${providerKey}`, async () => {
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
        vscode.commands.executeCommand('coding-plans.setApiKey.zhipu');
      } else if (selection === getMessage('setKimiApiKey')) {
        vscode.commands.executeCommand('coding-plans.setApiKey.kimi');
      } else if (selection === getMessage('setVolcengineApiKey')) {
        vscode.commands.executeCommand('coding-plans.setApiKey.volcengine');
      } else if (selection === getMessage('setMinimaxApiKey')) {
        vscode.commands.executeCommand('coding-plans.setApiKey.minimax');
      } else if (selection === getMessage('setAliyunApiKey')) {
        vscode.commands.executeCommand('coding-plans.setApiKey.aliyun');
      }
    });
  }
}

async function migrateChineseAISettingsToCodingPlans(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  let sawAnyOldKey = false;
  let migratedAnyPlainApiKey = false;

  const migrateKeyGlobalAndWorkspace = async <T>(oldKey: string, newKey: string): Promise<void> => {
    const oldInspect = config.inspect<T>(oldKey);
    const newInspect = config.inspect<T>(newKey);
    if (!oldInspect) {
      return;
    }

    const updates: Array<Thenable<void>> = [];

    if (oldInspect.globalValue !== undefined) {
      sawAnyOldKey = true;
      if (newInspect?.globalValue === undefined) {
        updates.push(config.update(newKey, oldInspect.globalValue, vscode.ConfigurationTarget.Global));
      }
      updates.push(config.update(oldKey, undefined, vscode.ConfigurationTarget.Global));
    }

    if (oldInspect.workspaceValue !== undefined) {
      sawAnyOldKey = true;
      if (newInspect?.workspaceValue === undefined) {
        updates.push(config.update(newKey, oldInspect.workspaceValue, vscode.ConfigurationTarget.Workspace));
      }
      updates.push(config.update(oldKey, undefined, vscode.ConfigurationTarget.Workspace));
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  const migrateKeyWorkspaceFolder = async <T>(oldKey: string, newKey: string): Promise<void> => {
    if (workspaceFolders.length === 0) {
      return;
    }

    await Promise.all(workspaceFolders.map(async folder => {
      const folderConfig = vscode.workspace.getConfiguration(undefined, folder.uri);
      const oldInspect = folderConfig.inspect<T>(oldKey);
      const newInspect = folderConfig.inspect<T>(newKey);
      if (!oldInspect) {
        return;
      }

      const updates: Array<Thenable<void>> = [];
      if (oldInspect.workspaceFolderValue !== undefined) {
        sawAnyOldKey = true;
        if (newInspect?.workspaceFolderValue === undefined) {
          updates.push(folderConfig.update(newKey, oldInspect.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder));
        }
        updates.push(folderConfig.update(oldKey, undefined, vscode.ConfigurationTarget.WorkspaceFolder));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    }));
  };

  const migrateKeyAllScopes = async <T>(oldKey: string, newKey: string): Promise<void> => {
    await migrateKeyGlobalAndWorkspace<T>(oldKey, newKey);
    await migrateKeyWorkspaceFolder<T>(oldKey, newKey);
  };

  // commit message settings
  await migrateKeyAllScopes<string>(`${OLD_NAMESPACE}.commitMessage.language`, `${NEW_NAMESPACE}.commitMessage.language`);
  await migrateKeyAllScopes<string>(`${OLD_NAMESPACE}.commitMessage.modelVendor`, `${NEW_NAMESPACE}.commitMessage.modelVendor`);
  await migrateKeyAllScopes<string>(`${OLD_NAMESPACE}.commitMessage.modelId`, `${NEW_NAMESPACE}.commitMessage.modelId`);

  // provider region flags
  await Promise.all(PROVIDER_KEYS.map(async providerKey => {
    await migrateKeyAllScopes<boolean>(`${OLD_NAMESPACE}.${providerKey}.region`, `${NEW_NAMESPACE}.${providerKey}.region`);
  }));

  // best-effort apiKey migration from plaintext settings to new Secret Storage
  for (const providerKey of PROVIDER_KEYS) {
    const oldKey = `${OLD_NAMESPACE}.${providerKey}.apiKey`;
    const newSecretKey = `${NEW_NAMESPACE}.${providerKey}.apiKey`;

    const existingSecret = (await context.secrets.get(newSecretKey))?.trim() ?? '';
    if (existingSecret.length > 0) {
      // Still clear any legacy plaintext key to reduce exposure.
      await migrateKeyAllScopes<string>(oldKey, oldKey);
      continue;
    }

    let plaintextApiKey: string | undefined;

    // Prefer workspaceFolder > workspace > global, first folder wins.
    for (const folder of workspaceFolders) {
      const folderConfig = vscode.workspace.getConfiguration(undefined, folder.uri);
      const inspect = folderConfig.inspect<string>(oldKey);
      if (inspect?.workspaceFolderValue && typeof inspect.workspaceFolderValue === 'string' && inspect.workspaceFolderValue.trim().length > 0) {
        plaintextApiKey = inspect.workspaceFolderValue.trim();
        break;
      }
    }

    if (!plaintextApiKey) {
      const inspect = config.inspect<string>(oldKey);
      const workspaceValue = inspect?.workspaceValue;
      const globalValue = inspect?.globalValue;
      if (typeof workspaceValue === 'string' && workspaceValue.trim().length > 0) {
        plaintextApiKey = workspaceValue.trim();
      } else if (typeof globalValue === 'string' && globalValue.trim().length > 0) {
        plaintextApiKey = globalValue.trim();
      }
    }

    if (plaintextApiKey) {
      await context.secrets.store(newSecretKey, plaintextApiKey);
      migratedAnyPlainApiKey = true;
    }

    // Always remove plaintext API keys from settings once seen.
    await migrateKeyAllScopes<string>(oldKey, oldKey);
  }

  if (!sawAnyOldKey) {
    return;
  }

  if (context.globalState.get<boolean>(MIGRATION_NOTICE_SHOWN_KEY) === true) {
    return;
  }

  await context.globalState.update(MIGRATION_NOTICE_SHOWN_KEY, true);
  if (migratedAnyPlainApiKey) {
    void vscode.window.showInformationMessage(getMessage('migrationCompletedWithApiKey'));
    return;
  }
  void vscode.window.showInformationMessage(getMessage('migrationCompletedNoApiKey'));
}

export function deactivate(): void {
  console.log(getMessage('extensionDeactivated'));

  // 清理所有提供者
  providers.forEach(provider => provider.dispose());
  providers.clear();
}
