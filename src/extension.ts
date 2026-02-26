import * as vscode from 'vscode';
import { GenericAIProvider } from './providers/genericProvider';
import { LMChatProviderAdapter } from './providers/lmChatProviderAdapter';
import { ConfigStore } from './config/configStore';
import { initI18n, getMessage } from './i18n/i18n';
import { generateCommitMessage, selectCommitMessageModel } from './commitMessageGenerator';

let providers: Map<string, GenericAIProvider> = new Map();
const COMMIT_MESSAGE_SHOW_GENERATE_SETTING_KEY = 'commitMessage.showGenerateCommand';
const COMMIT_MESSAGE_SHOW_GENERATE_CONTEXT_KEY = 'codingPlans.showGenerateCommitMessage';

function shouldShowGenerateCommitMessageCommand(): boolean {
  return vscode.workspace
    .getConfiguration('coding-plans')
    .get<boolean>(COMMIT_MESSAGE_SHOW_GENERATE_SETTING_KEY, true);
}

async function syncGenerateCommitMessageCommandVisibility(): Promise<void> {
  await vscode.commands.executeCommand(
    'setContext',
    COMMIT_MESSAGE_SHOW_GENERATE_CONTEXT_KEY,
    shouldShowGenerateCommitMessageCommand()
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await initI18n();
  console.log(getMessage('extensionActivated'));

  await syncGenerateCommitMessageCommandVisibility();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration(`coding-plans.${COMMIT_MESSAGE_SHOW_GENERATE_SETTING_KEY}`)) {
        void syncGenerateCommitMessageCommandVisibility();
      }
    })
  );

  // Register commit-message commands first so they remain available
  // even if provider initialization fails.
  context.subscriptions.push(
    vscode.commands.registerCommand('coding-plans.generateCommitMessage', generateCommitMessage)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('coding-plans.selectCommitMessageModel', selectCommitMessageModel)
  );

  const configStore = new ConfigStore(context);
  context.subscriptions.push(configStore);

  const genericProvider = new GenericAIProvider(context, configStore);
  await genericProvider.initialize();
  providers.set('coding-plans', genericProvider);

  const adapter = new LMChatProviderAdapter(genericProvider, configStore);
  context.subscriptions.push(adapter);
  try {
    if (typeof vscode.lm.registerLanguageModelChatProvider === 'function') {
      context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider('coding-plans', adapter));
    } else {
      console.warn('LanguageModelChatProvider API is unavailable; chat provider registration is skipped.');
    }
  } catch (error) {
    console.error('Failed to register language model chat provider.', error);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('coding-plans.addModels', async () => {
      const vendors = configStore.getVendors();
      if (vendors.length === 0) {
        const action = await vscode.window.showWarningMessage(
          getMessage('vendorNotConfigured'),
          getMessage('manageActionOpenSettings')
        );
        if (action) {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'coding-plans.vendors');
        }
        return;
      }

      const vendorPick = await vscode.window.showQuickPick(
        vendors.map(v => ({ label: v.name, description: v.baseUrl, vendor: v })),
        { ignoreFocusOut: true, placeHolder: getMessage('manageActionSelectVendor') }
      );
      if (!vendorPick) {
        return;
      }

      const apiKey = await vscode.window.showInputBox({
        prompt: getMessage('inputApiKey', vendorPick.vendor.name),
        password: true,
        ignoreFocusOut: true,
        placeHolder: getMessage('inputPlaceholder')
      });
      if (apiKey === undefined) {
        return;
      }

      const trimmedKey = apiKey.trim();
      if (trimmedKey.length === 0) {
        vscode.window.showWarningMessage(getMessage('apiKeyRequired', vendorPick.vendor.name));
        return;
      }

      await configStore.setApiKey(vendorPick.vendor.name, trimmedKey);
      await genericProvider.refreshModels();
      vscode.window.showInformationMessage(getMessage('apiKeySaved', vendorPick.vendor.name));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coding-plans.manage', async () => {
      const actions = [
        { id: 'setApiKey', label: getMessage('manageActionApiKey') },
        { id: 'openSettings', label: getMessage('manageActionOpenSettings') }
      ];

      const picked = await vscode.window.showQuickPick(actions, {
        ignoreFocusOut: true,
        placeHolder: getMessage('manageActionPlaceholder', 'Coding Plan')
      });

      if (!picked) {
        return;
      }

      if (picked.id === 'setApiKey') {
        const vendors = configStore.getVendors();
        if (vendors.length === 0) {
          vscode.window.showWarningMessage(getMessage('vendorNotConfigured'));
          return;
        }

        const vendorPick = await vscode.window.showQuickPick(
          vendors.map(v => ({ label: v.name, description: v.baseUrl, vendor: v })),
          { ignoreFocusOut: true, placeHolder: getMessage('manageActionSelectVendor') }
        );
        if (!vendorPick) {
          return;
        }

        const apiKey = await vscode.window.showInputBox({
          prompt: getMessage('inputApiKey', vendorPick.vendor.name),
          password: true,
          ignoreFocusOut: true,
          placeHolder: getMessage('inputPlaceholder')
        });
        if (apiKey === undefined) {
          return;
        }

        await configStore.setApiKey(vendorPick.vendor.name, apiKey.trim());
        await genericProvider.refreshModels();
        vscode.window.showInformationMessage(getMessage('apiKeySaved', vendorPick.vendor.name));
        return;
      }

      if (picked.id === 'openSettings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'coding-plans.vendors');
        return;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coding-plans.refreshModels', async () => {
      await genericProvider.refreshModels();
      vscode.window.showInformationMessage(getMessage('modelsRefreshed', 'Coding Plan'));
    })
  );

}

export function deactivate(): void {
  console.log(getMessage('extensionDeactivated'));
  providers.forEach(provider => provider.dispose());
  providers.clear();
}
