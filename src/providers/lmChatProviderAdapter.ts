import * as vscode from 'vscode';
import { BaseAIProvider, BaseLanguageModel, MODEL_VERSION_LABEL } from './baseProvider';
import { getMessage } from '../i18n/i18n';

interface ProviderPickerConfiguration {
  name?: unknown;
  apiKey?: unknown;
  region?: unknown;
}

interface PrepareLanguageModelChatModelOptionsWithConfiguration extends vscode.PrepareLanguageModelChatModelOptions {
  group?: unknown;
  configuration?: ProviderPickerConfiguration;
}

function toLanguageModelInfo(model: BaseLanguageModel): vscode.LanguageModelChatInformation {
  return {
    id: model.id,
    name: model.name,
    family: model.family,
    tooltip: model.description,
    detail: model.version,
    version: model.version,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    capabilities: model.capabilities
  };
}

function getProviderDisplayName(vendor: string): string {
  switch (vendor) {
    case 'zhipu-ai':
      return 'Zhipu';
    case 'kimi-ai':
      return 'Kimi';
    case 'volcengine-ai':
      return 'Volcengine';
    default:
      return vendor;
  }
}

function getPlaceholderModelId(vendor: string): string {
  return `${vendor}__setup_api_key__`;
}

function isPlaceholderModel(vendor: string, modelId: string): boolean {
  return modelId === getPlaceholderModelId(vendor);
}

function getPlaceholderModel(vendor: string): vscode.LanguageModelChatInformation {
  const providerName = getProviderDisplayName(vendor);
  return {
    id: getPlaceholderModelId(vendor),
    name: getMessage('setupModelName'),
    family: 'setup',
    tooltip: getMessage('setupModelTooltip', providerName),
    detail: getMessage('setupModelDetail'),
    version: MODEL_VERSION_LABEL,
    maxInputTokens: 1,
    maxOutputTokens: 1,
    capabilities: {
      toolCalling: false,
      imageInput: false
    }
  };
}

export class LMChatProviderAdapter implements vscode.LanguageModelChatProvider, vscode.Disposable {
  private readonly onDidChangeLanguageModelChatInformationEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeLanguageModelChatInformation =
    this.onDidChangeLanguageModelChatInformationEmitter.event;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly provider: BaseAIProvider) {
    this.disposables.push(
      this.provider.onDidChangeModels(() => {
        this.onDidChangeLanguageModelChatInformationEmitter.fire();
      })
    );
  }

  async provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const options = _options as PrepareLanguageModelChatModelOptionsWithConfiguration;
    const hasGroup = typeof options.group === 'string' && options.group.trim().length > 0;
    const hasConfigurationPayload = this.hasConfigurationPayload(options.configuration);

    // VS Code may invoke provider once for base vendor and once per configured group.
    // Group/configuration calls should be treated as setup sync only, otherwise the same
    // model list is reported multiple times and UI shows duplicated model rows.
    if (hasGroup || hasConfigurationPayload) {
      await this.applyPickerConfiguration(options);
      return [];
    }

    const models = this.provider.getAvailableModels();
    if (models.length === 0) {
      return [getPlaceholderModel(this.provider.getVendor())];
    }

    return models.map(model => toLanguageModelInfo(model));
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const vendor = this.provider.getVendor();
    if (isPlaceholderModel(vendor, model.id)) {
      const providerName = getProviderDisplayName(vendor);
      progress.report(new vscode.LanguageModelTextPart(getMessage('setupModelResponse', providerName)));
      return;
    }

    const targetModel = this.provider.getModel(model.id);
    if (!targetModel) {
      throw vscode.LanguageModelError.NotFound(`Model not found: ${model.id}`);
    }

    const response = await targetModel.sendRequest(
      messages.map(message => this.toChatMessage(message)),
      options as unknown as vscode.LanguageModelChatRequestOptions,
      token
    );

    for await (const part of response.stream) {
      progress.report(part as vscode.LanguageModelResponsePart);
    }
  }

  provideTokenCount(
    model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    token: vscode.CancellationToken
  ): Thenable<number> {
    if (isPlaceholderModel(this.provider.getVendor(), model.id)) {
      return Promise.resolve(0);
    }

    const targetModel = this.provider.getModel(model.id);
    if (!targetModel) {
      return Promise.reject(vscode.LanguageModelError.NotFound(`Model not found: ${model.id}`));
    }

    if (typeof text === 'string') {
      return targetModel.countTokens(text, token);
    }

    return targetModel.countTokens(this.toChatMessage(text), token);
  }

  private hasConfigurationPayload(configuration: ProviderPickerConfiguration | undefined): boolean {
    if (!configuration || typeof configuration !== 'object') {
      return false;
    }
    return Object.keys(configuration).length > 0;
  }

  private toChatMessage(message: vscode.LanguageModelChatRequestMessage): vscode.LanguageModelChatMessage {
    return new vscode.LanguageModelChatMessage(
      message.role,
      [...message.content] as vscode.LanguageModelInputPart[],
      message.name
    );
  }

  private async applyPickerConfiguration(options: PrepareLanguageModelChatModelOptionsWithConfiguration): Promise<void> {
    const rawConfig = options.configuration;
    if (!rawConfig || typeof rawConfig !== 'object') {
      return;
    }

    const normalized = this.normalizePickerConfiguration(rawConfig);
    if (!normalized) {
      return;
    }

    const configSection = this.provider.getConfigSection();
    const config = vscode.workspace.getConfiguration(configSection);
    const updates: Array<Thenable<void>> = [];

    const setStringIfChanged = (key: string, value: string): void => {
      const current = config.get<string>(key, '');
      if (current !== value) {
        updates.push(config.update(key, value, vscode.ConfigurationTarget.Global));
      }
    };

    const setBooleanIfChanged = (key: string, value: boolean): void => {
      const current = config.get<boolean>(key, true);
      if (current !== value) {
        updates.push(config.update(key, value, vscode.ConfigurationTarget.Global));
      }
    };

    if (normalized.apiKey !== undefined) {
      setStringIfChanged('apiKey', normalized.apiKey);
    }
    if (normalized.region !== undefined) {
      setBooleanIfChanged('region', normalized.region);
    }
    if (updates.length > 0) {
      await Promise.all(updates);
      await this.provider.refreshModels();
    }
  }

  private normalizePickerConfiguration(raw: ProviderPickerConfiguration): {
    apiKey?: string;
    region?: boolean;
  } | undefined {
    const normalized: {
      apiKey?: string;
      region?: boolean;
    } = {};

    if (typeof raw.apiKey === 'string') {
      normalized.apiKey = raw.apiKey.trim();
    }

    if (typeof raw.region === 'boolean') {
      normalized.region = raw.region;
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables.length = 0;
    this.onDidChangeLanguageModelChatInformationEmitter.dispose();
  }
}
