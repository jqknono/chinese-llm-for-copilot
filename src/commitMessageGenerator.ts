import * as vscode from 'vscode';
import { getMessage } from './i18n/i18n';

const MAX_DIFF_CHARS = 20000;
const COMMIT_MESSAGE_MODEL_STATE_KEY = 'Chinese-AI.commitMessage.selectedModel'; // legacy globalState key (<=0.0.4)
const COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY = 'commitMessage.modelVendor';
const COMMIT_MESSAGE_MODEL_ID_SETTING_KEY = 'commitMessage.modelId';
const CHINESE_AI_VENDORS = new Set(['zhipu-ai', 'kimi-ai', 'volcengine-ai', 'minimax-ai', 'aliyun-ai']);
const PLACEHOLDER_MODEL_ID_SUFFIXES = ['__setup_api_key__', '__no_models__', '__unsupported__'] as const;

interface GitExtension {
  getAPI(version: number): GitAPI;
}

interface GitAPI {
  repositories: GitRepository[];
}

interface GitRepository {
  inputBox: { value: string };
  diff(cached?: boolean): Promise<string>;
  state: { indexChanges: unknown[]; workingTreeChanges: unknown[] };
}

function getCommitLanguageInstruction(): string {
  const configured = vscode.workspace
    .getConfiguration('Chinese-AI')
    .get<string>('commitMessage.language', 'auto');

  if (configured === 'zh-cn') {
    return 'You MUST write the commit message in Chinese (简体中文).';
  }
  if (configured === 'en') {
    return 'You MUST write the commit message in English.';
  }

  const locale = vscode.env.language;
  if (locale.startsWith('zh')) {
    return 'You MUST write the commit message in Chinese (简体中文).';
  }
  return 'You MUST write the commit message in English.';
}

function buildPrompt(diff: string): string {
  const langInstruction = getCommitLanguageInstruction();

  return [
    'You are a Git commit message generator.',
    langInstruction,
    'Based on the following git diff, generate a concise and descriptive commit message.',
    'Follow the Conventional Commits format: <type>(<scope>): <description>',
    'Common types: feat, fix, docs, style, refactor, perf, test, build, ci, chore.',
    'Output ONLY the commit message, no explanation, no markdown fences.',
    '',
    '--- BEGIN DIFF ---',
    diff,
    '--- END DIFF ---'
  ].join('\n');
}

async function getGitRepository(): Promise<GitRepository | undefined> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    return undefined;
  }

  const gitApi = ext.isActive ? ext.exports.getAPI(1) : (await ext.activate()).getAPI(1);
  return gitApi.repositories[0];
}

async function getDiff(repo: GitRepository): Promise<string> {
  const staged = await repo.diff(true);
  if (staged.trim().length > 0) {
    return staged;
  }
  return repo.diff(false);
}

type ModelSelectionResult =
  | { kind: 'selected'; model: vscode.LanguageModelChat }
  | { kind: 'cancelled' }
  | { kind: 'noModels' };

function isPlaceholderModelId(modelId: string): boolean {
  return PLACEHOLDER_MODEL_ID_SUFFIXES.some(suffix => modelId.endsWith(suffix));
}

function modelSortKey(model: vscode.LanguageModelChat): [number, string, string, string, string] {
  // Prefer this extension's vendors first, then other non-Copilot vendors, then Copilot.
  const tier = CHINESE_AI_VENDORS.has(model.vendor) ? 0 : (model.vendor === 'copilot' ? 2 : 1);
  return [tier, model.vendor, model.family, model.name, model.id];
}

function getCommitMessageConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('Chinese-AI');
}

async function migrateLegacySelectedModelToSettings(context: vscode.ExtensionContext): Promise<void> {
  const config = getCommitMessageConfig();
  const existingVendor = (config.get<string>(COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY, '') || '').trim();
  const existingId = (config.get<string>(COMMIT_MESSAGE_MODEL_ID_SETTING_KEY, '') || '').trim();

  if (existingVendor.length > 0 || existingId.length > 0) {
    // Already configured via settings, nothing to migrate.
    if (context.globalState.get(COMMIT_MESSAGE_MODEL_STATE_KEY) !== undefined) {
      await context.globalState.update(COMMIT_MESSAGE_MODEL_STATE_KEY, undefined);
    }
    return;
  }

  const legacy = context.globalState.get<{ vendor: string; id: string }>(COMMIT_MESSAGE_MODEL_STATE_KEY);
  if (!legacy) {
    return;
  }

  await Promise.all([
    config.update(COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY, legacy.vendor, vscode.ConfigurationTarget.Global),
    config.update(COMMIT_MESSAGE_MODEL_ID_SETTING_KEY, legacy.id, vscode.ConfigurationTarget.Global)
  ]);
  await context.globalState.update(COMMIT_MESSAGE_MODEL_STATE_KEY, undefined);
}

function readConfiguredModelSelector(): { vendor?: string; id?: string } {
  const config = getCommitMessageConfig();
  const vendor = (config.get<string>(COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY, '') || '').trim();
  const id = (config.get<string>(COMMIT_MESSAGE_MODEL_ID_SETTING_KEY, '') || '').trim();
  return {
    vendor: vendor.length > 0 ? vendor : undefined,
    id: id.length > 0 ? id : undefined
  };
}

async function saveModelSelection(model: vscode.LanguageModelChat): Promise<void> {
  const config = getCommitMessageConfig();
  await Promise.all([
    config.update(COMMIT_MESSAGE_MODEL_VENDOR_SETTING_KEY, model.vendor, vscode.ConfigurationTarget.Global),
    config.update(COMMIT_MESSAGE_MODEL_ID_SETTING_KEY, model.id, vscode.ConfigurationTarget.Global)
  ]);
}

async function selectModel(
  context: vscode.ExtensionContext,
  allowPrompt: boolean,
  forcePrompt = false
): Promise<ModelSelectionResult> {
  const allModels = await vscode.lm.selectChatModels();
  const models = allModels
    .filter(model => !isPlaceholderModelId(model.id))
    .sort((a, b) => {
      const ka = modelSortKey(a);
      const kb = modelSortKey(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) { return -1; }
        if (ka[i] > kb[i]) { return 1; }
      }
      return 0;
    });

  if (models.length === 0) {
    return { kind: 'noModels' };
  }

  await migrateLegacySelectedModelToSettings(context);

  if (!forcePrompt) {
    const selector = readConfiguredModelSelector();

    if (selector.vendor && selector.id) {
      const match = models.find(model => model.vendor === selector.vendor && model.id === selector.id);
      if (match) {
        return { kind: 'selected', model: match };
      }
      if (allowPrompt) {
        void vscode.window.showWarningMessage(getMessage('commitMessageConfiguredModelNotFound'));
      }
    } else if (selector.vendor) {
      const match = models.find(model => model.vendor === selector.vendor);
      if (match) {
        return { kind: 'selected', model: match };
      }
      if (allowPrompt) {
        void vscode.window.showWarningMessage(getMessage('commitMessageConfiguredVendorNotFound', selector.vendor));
      }
    } else if (selector.id) {
      const match = models.find(model => model.id === selector.id);
      if (match) {
        return { kind: 'selected', model: match };
      }
      if (allowPrompt) {
        void vscode.window.showWarningMessage(getMessage('commitMessageConfiguredModelNotFound'));
      }
    }
  }

  if (!allowPrompt) {
    return { kind: 'selected', model: models[0] };
  }

  if (models.length === 1) {
    await saveModelSelection(models[0]);
    return { kind: 'selected', model: models[0] };
  }

  const picked = await vscode.window.showQuickPick(
    models.map(model => ({
      label: model.name,
      description: `${model.vendor} · ${model.family} · ${model.version}`,
      detail: model.id,
      model
    })),
    {
      ignoreFocusOut: true,
      placeHolder: getMessage('commitMessageSelectModel')
    }
  );

  if (!picked) {
    return { kind: 'cancelled' };
  }

  await saveModelSelection(picked.model);
  return { kind: 'selected', model: picked.model };
}

function isLanguageModelBlockedError(error: unknown): boolean {
  if (error instanceof vscode.LanguageModelError) {
    return error.code === vscode.LanguageModelError.Blocked.name;
  }
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && code === vscode.LanguageModelError.Blocked.name;
}

export async function selectCommitMessageModel(context: vscode.ExtensionContext): Promise<void> {
  const selection = await selectModel(context, true, true);
  if (selection.kind === 'cancelled') {
    vscode.window.showInformationMessage(getMessage('requestCancelled'));
    return;
  }
  if (selection.kind === 'noModels') {
    vscode.window.showWarningMessage(getMessage('commitMessageNoModel'));
    return;
  }
  vscode.window.showInformationMessage(
    getMessage('commitMessageModelSaved', `${selection.model.vendor} · ${selection.model.name}`)
  );
}

export async function generateCommitMessage(context: vscode.ExtensionContext): Promise<void> {
  try {
    const repo = await getGitRepository();
    if (!repo) {
      vscode.window.showWarningMessage(getMessage('commitMessageNoGitRepo'));
      return;
    }

    const diff = await getDiff(repo);
    if (diff.trim().length === 0) {
      vscode.window.showInformationMessage(getMessage('commitMessageNoChanges'));
      return;
    }

    let truncatedDiff = diff;
    if (diff.length > MAX_DIFF_CHARS) {
      truncatedDiff = diff.substring(0, MAX_DIFF_CHARS);
      vscode.window.showWarningMessage(
        getMessage('commitMessageDiffTooLarge', diff.length, MAX_DIFF_CHARS)
      );
    }

    const selection = await selectModel(context, true);
    if (selection.kind === 'cancelled') {
      vscode.window.showInformationMessage(getMessage('requestCancelled'));
      return;
    }
    if (selection.kind === 'noModels') {
      vscode.window.showWarningMessage(getMessage('commitMessageNoModel'));
      return;
    }
    const model = selection.model;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.SourceControl,
        title: getMessage('commitMessageGenerating')
      },
      async (_progress, token) => {
        const prompt = buildPrompt(truncatedDiff);
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];

        let response: vscode.LanguageModelChatResponse;
        try {
          response = await model.sendRequest(
            messages,
            { justification: 'Generate a git commit message from the current diff.' },
            token
          );
        } catch (error: unknown) {
          // Most commonly: Copilot quota exceeded. Give a clearer hint when possible.
          if (isLanguageModelBlockedError(error) && model.vendor === 'copilot') {
            throw new Error(getMessage('commitMessageCopilotQuotaExceeded'));
          }
          throw error;
        }

        let result = '';
        for await (const chunk of response.text) {
          result += chunk;
        }

        result = result.trim();
        // Ensure we only set the title line in SCM input.
        const firstLine = result.split(/\r?\n/).find(line => line.trim().length > 0)?.trim() ?? '';
        if (firstLine.length > 0) {
          repo.inputBox.value = firstLine;
        }
      }
    );
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(getMessage('commitMessageFailed', detail));
  }
}
