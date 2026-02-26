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
  void genericProvider.initialize().catch(error => {
    console.error('Failed to initialize generic provider models.', error);
  });
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
    vscode.commands.registerCommand('coding-plans.manage', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'coding-plans.vendors');
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
