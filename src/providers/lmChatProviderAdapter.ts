import * as vscode from 'vscode';
import { BaseAIProvider, BaseLanguageModel, MODEL_VERSION_LABEL, getCompactErrorMessage } from './baseProvider';
import { ConfigStore } from '../config/configStore';
import { getMessage } from '../i18n/i18n';

let hasShownVendorNotConfiguredWarning = false;

interface ProviderPickerConfiguration {
  name?: unknown;
  vendorName?: unknown;
  apiKey?: unknown;
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
    case 'coding-plans':
      return 'Coding Plan';
    default:
      return vendor;
  }
}

function getPlaceholderModelId(vendor: string): string {
  return `${vendor}__setup_api_key__`;
}

function getNoModelsPlaceholderModelId(vendor: string): string {
  return `${vendor}__no_models__`;
}

function getUnsupportedPlaceholderModelId(vendor: string): string {
  return `${vendor}__unsupported__`;
}

function getVendorNotConfiguredPlaceholderModelId(vendor: string): string {
  return `${vendor}__vendor_not_configured__`;
}

function isPlaceholderModel(vendor: string, modelId: string): boolean {
  return modelId === getPlaceholderModelId(vendor)
    || modelId === getNoModelsPlaceholderModelId(vendor)
    || modelId === getUnsupportedPlaceholderModelId(vendor)
    || modelId === getVendorNotConfiguredPlaceholderModelId(vendor);
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

function getNoModelsPlaceholderModel(vendor: string): vscode.LanguageModelChatInformation {
  const providerName = getProviderDisplayName(vendor);
  return {
    id: getNoModelsPlaceholderModelId(vendor),
    name: getMessage('noModelName'),
    family: 'no-models',
    tooltip: getMessage('noModelTooltip', providerName),
    detail: getMessage('noModelDetail'),
    version: MODEL_VERSION_LABEL,
    maxInputTokens: 1,
    maxOutputTokens: 1,
    capabilities: {
      toolCalling: false,
      imageInput: false
    }
  };
}

function getUnsupportedPlaceholderModel(vendor: string): vscode.LanguageModelChatInformation {
  const providerName = getProviderDisplayName(vendor);
  return {
    id: getUnsupportedPlaceholderModelId(vendor),
    name: getMessage('unsupportedModelName'),
    family: 'unsupported',
    tooltip: getMessage('unsupportedModelTooltip', providerName),
    detail: getMessage('unsupportedModelDetail'),
    version: MODEL_VERSION_LABEL,
    maxInputTokens: 1,
    maxOutputTokens: 1,
    capabilities: {
      toolCalling: false,
      imageInput: false
    }
  };
}

function getVendorNotConfiguredPlaceholderModel(vendor: string): vscode.LanguageModelChatInformation {
  return {
    id: getVendorNotConfiguredPlaceholderModelId(vendor),
    name: getMessage('vendorNotConfiguredName'),
    family: 'vendor-not-configured',
    tooltip: getMessage('vendorNotConfiguredTooltip'),
    detail: getMessage('vendorNotConfiguredDetail'),
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

  constructor(
    private readonly provider: BaseAIProvider,
    private readonly configStore?: ConfigStore
  ) {
    this.disposables.push(
      this.provider.onDidChangeModels(() => {
        this.onDidChangeLanguageModelChatInformationEmitter.fire();
      })
    );
  }

  public notifyLanguageModelInformationChanged(): void {
    this.onDidChangeLanguageModelChatInformationEmitter.fire();
  }

  async provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const pickerOptions = options as PrepareLanguageModelChatModelOptionsWithConfiguration;
    const hasGroup = typeof pickerOptions.group === 'string' && pickerOptions.group.trim().length > 0;
    const hasConfigurationPayload = this.hasConfigurationPayload(pickerOptions.configuration);

    // Only return model information for explicitly added provider groups.
    // Base vendor calls are ignored to avoid all providers being listed by default.
    if (!hasGroup && !hasConfigurationPayload) {
      return [];
    }

    if (hasGroup || hasConfigurationPayload) {
      await this.applyPickerConfiguration(pickerOptions);
    }

    return this.buildModelInformation(pickerOptions.configuration);
  }

  private async buildModelInformation(
    configuration?: ProviderPickerConfiguration
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const models = this.provider.getAvailableModels();
    const requestedVendor = this.resolveRequestedVendorName(configuration);
    const resolvedVendor = this.resolveConfiguredVendorName(requestedVendor);
    if (requestedVendor && !resolvedVendor && this.configStore) {
      return [getVendorNotConfiguredPlaceholderModel(this.provider.getVendor())];
    }
    const vendorForFiltering = resolvedVendor || requestedVendor;
    const filteredModels = vendorForFiltering
      ? models.filter(model => model.family.toLowerCase() === vendorForFiltering.toLowerCase())
      : models;

    if (filteredModels.length === 0) {
      if (vendorForFiltering && this.configStore) {
        const apiKey = (await this.configStore.getApiKey(vendorForFiltering)).trim();
        if (apiKey.length === 0) {
          return [getPlaceholderModel(this.provider.getVendor())];
        }
      } else {
        const apiKey = this.provider.getApiKey().trim();
        if (apiKey.length === 0) {
          return [getPlaceholderModel(this.provider.getVendor())];
        }
      }

      if (this.provider.isModelDiscoveryUnsupported()) {
        return [getUnsupportedPlaceholderModel(this.provider.getVendor())];
      }

      return [getNoModelsPlaceholderModel(this.provider.getVendor())];
    }

    return filteredModels.map(model => toLanguageModelInfo(model));
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
      if (model.id === getUnsupportedPlaceholderModelId(vendor)) {
        progress.report(new vscode.LanguageModelTextPart(getMessage('unsupportedModelResponse', providerName)));
        return;
      }
      if (model.id === getNoModelsPlaceholderModelId(vendor)) {
        progress.report(new vscode.LanguageModelTextPart(getMessage('noModelResponse', providerName)));
        return;
      }
      if (model.id === getVendorNotConfiguredPlaceholderModelId(vendor)) {
        progress.report(new vscode.LanguageModelTextPart(getMessage('vendorNotConfiguredResponse')));
        return;
      }
      progress.report(new vscode.LanguageModelTextPart(getMessage('setupModelResponse', providerName)));
      return;
    }

    const targetModel = this.provider.getModel(model.id);
    if (!targetModel) {
      throw vscode.LanguageModelError.NotFound(`Model not found: ${model.id}`);
    }

    try {
      const response = await targetModel.sendRequest(
        messages.map(message => this.toChatMessage(message)),
        options as unknown as vscode.LanguageModelChatRequestOptions,
        token
      );

      for await (const part of response.stream) {
        progress.report(part as vscode.LanguageModelResponsePart);
      }
    } catch (error) {
      throw this.toCompactLanguageModelError(error);
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

    let changed = false;

    const vendorName = normalized.vendorName;
    if (vendorName && this.configStore) {
      const resolvedVendor = this.resolveConfiguredVendorName(vendorName);
      if (!resolvedVendor) {
        await this.warnVendorNotConfigured(vendorName);
        return;
      }
      if (normalized.apiKey !== undefined) {
        const nextApiKey = normalized.apiKey.trim();
        const currentApiKey = await this.configStore.getApiKey(resolvedVendor);
        if (currentApiKey !== nextApiKey) {
          await this.configStore.setApiKey(resolvedVendor, nextApiKey);
          changed = true;
        }
      }
    } else if (normalized.apiKey !== undefined) {
      const nextApiKey = normalized.apiKey.trim();
      if (this.provider.getApiKey() !== nextApiKey) {
        await this.provider.setApiKey(nextApiKey);
        changed = true;
      }
    }

    if (changed) {
      await this.provider.refreshModels();
    }
  }

  private normalizePickerConfiguration(raw: ProviderPickerConfiguration): {
    vendorName?: string;
    apiKey?: string;
  } | undefined {
    const normalized: {
      vendorName?: string;
      apiKey?: string;
    } = {};

    if (typeof raw.vendorName === 'string') {
      normalized.vendorName = raw.vendorName.trim();
    }
    if (typeof raw.apiKey === 'string') {
      normalized.apiKey = raw.apiKey.trim();
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private resolveRequestedVendorName(configuration?: ProviderPickerConfiguration): string {
    if (configuration && typeof configuration.vendorName === 'string') {
      const fromConfig = configuration.vendorName.trim();
      if (fromConfig.length > 0) {
        return fromConfig;
      }
    }

    return '';
  }

  private resolveConfiguredVendorName(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || !this.configStore) {
      return undefined;
    }

    const vendors = this.configStore.getVendors();
    const match = vendors.find(v => v.name.toLowerCase() === trimmed.toLowerCase());
    return match?.name;
  }

  private async warnVendorNotConfigured(vendorName: string): Promise<void> {
    if (hasShownVendorNotConfiguredWarning) {
      return;
    }
    hasShownVendorNotConfiguredWarning = true;

    const message = getMessage('vendorNotConfiguredMatch', vendorName.trim());
    const action = getMessage('manageActionOpenSettings');
    void vscode.window.showWarningMessage(message, action).then(picked => {
      if (picked) {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'coding-plans.vendors');
      }
    });
  }

  private toCompactLanguageModelError(error: unknown): vscode.LanguageModelError {
    const compactMessage = getCompactErrorMessage(error) || getMessage('unknownError');
    const code = error instanceof vscode.LanguageModelError ? error.code : undefined;
    const inferredBlocked = /(?:rate\s*limit|quota|429|速率限制|配额|当前订阅套餐暂未开放)/i.test(compactMessage);

    let wrapped: vscode.LanguageModelError;
    if (code === vscode.LanguageModelError.Blocked.name || inferredBlocked) {
      wrapped = vscode.LanguageModelError.Blocked(compactMessage);
    } else if (code === vscode.LanguageModelError.NoPermissions.name) {
      wrapped = vscode.LanguageModelError.NoPermissions(compactMessage);
    } else if (code === vscode.LanguageModelError.NotFound.name) {
      wrapped = vscode.LanguageModelError.NotFound(compactMessage);
    } else {
      wrapped = new vscode.LanguageModelError(compactMessage);
    }

    return this.compactLanguageModelError(wrapped, compactMessage);
  }

  private compactLanguageModelError(error: vscode.LanguageModelError, compactMessage: string): vscode.LanguageModelError {
    const sanitizedMessage = compactMessage || getMessage('unknownError');
    this.overwriteErrorMessage(error, sanitizedMessage);
    this.overwriteErrorStack(error, `${error.name}: ${sanitizedMessage}`);
    this.clearErrorCause(error);
    return error;
  }

  private overwriteErrorMessage(error: Error, message: string): void {
    try {
      Object.defineProperty(error, 'message', {
        value: message,
        configurable: true,
        writable: true
      });
    } catch {
      // ignore: keep original message when runtime prevents overriding.
    }
  }

  private overwriteErrorStack(error: Error, stack: string): void {
    try {
      Object.defineProperty(error, 'stack', {
        value: stack,
        configurable: true,
        writable: true
      });
    } catch {
      // ignore: keep original stack when runtime prevents overriding.
    }
  }

  private clearErrorCause(error: Error): void {
    try {
      Object.defineProperty(error, 'cause', {
        value: undefined,
        configurable: true,
        writable: true
      });
    } catch {
      // ignore: some runtimes define cause as non-configurable.
    }
  }

  dispose(): void {
    this.disposables.forEach(disposable => disposable.dispose());
    this.disposables.length = 0;
    this.onDidChangeLanguageModelChatInformationEmitter.dispose();
  }
}
