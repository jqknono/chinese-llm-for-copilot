import * as vscode from 'vscode';
import {
  BaseAIProvider,
  BaseLanguageModel,
  AIModelConfig,
  ChatMessage,
  ChatToolCall,
  ChatToolDefinition,
  getCompactErrorMessage,
  normalizeHttpBaseUrl
} from './baseProvider';
import { ConfigStore, VendorConfig, VendorModelConfig } from '../config/configStore';
import { getMessage } from '../i18n/i18n';

interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'required';
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface OpenAIChatResponse {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: ChatToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface GenericChatRequest {
  modelId: string;
  messages: vscode.LanguageModelChatMessage[];
  options?: vscode.LanguageModelChatRequestOptions;
  capabilities: vscode.LanguageModelChatCapabilities;
}

interface ModelVendorMapping {
  vendor: VendorConfig;
  modelName: string;
}

const DEFAULT_CONTEXT_SIZE = 200000;
const DEFAULT_MAX_TOKENS = 4000;

export class GenericLanguageModel extends BaseLanguageModel {
  constructor(provider: BaseAIProvider, modelInfo: AIModelConfig) {
    super(provider, modelInfo);
  }

  async sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const provider = this.provider as GenericAIProvider;
    const request: GenericChatRequest = {
      modelId: this.id,
      messages,
      options,
      capabilities: this.capabilities
    };

    try {
      return await provider.sendRequest(request, token);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      throw new vscode.LanguageModelError(getMessage('requestFailed', getCompactErrorMessage(error)));
    }
  }
}

export class GenericAIProvider extends BaseAIProvider {
  private modelVendorMap = new Map<string, ModelVendorMapping>();

  constructor(
    context: vscode.ExtensionContext,
    private readonly configStore: ConfigStore
  ) {
    super(context);
    this.disposables.push(
      this.configStore.onDidChange(() => void this.refreshModels())
    );
  }

  async initialize(): Promise<void> {
    await this.refreshModels();
  }

  getVendor(): string {
    return 'coding-plans';
  }

  getConfigSection(): string {
    return 'coding-plans';
  }

  getBaseUrl(): string {
    const vendors = this.configStore.getVendors();
    return vendors[0]?.baseUrl || '';
  }

  getApiKey(): string {
    return this.configStore.getVendors().length > 0 ? 'configured' : '';
  }

  async setApiKey(_apiKey: string): Promise<void> {
    // Per-vendor API keys are managed via configStore.setApiKey(vendorName, apiKey)
  }

  getPredefinedModels(): AIModelConfig[] {
    return [];
  }

  convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return this.toProviderMessages(messages);
  }

  async refreshModels(): Promise<void> {
    const vendors = this.configStore.getVendors();
    this.modelVendorMap.clear();
    const allModelConfigs: AIModelConfig[] = [];

    for (const vendor of vendors) {
      if (!vendor.baseUrl) {
        continue;
      }

      if (vendor.models.length > 0) {
        for (const model of vendor.models) {
          const compositeId = `${vendor.name}/${model.name}`;
          allModelConfigs.push(this.buildModelFromVendorConfig(model, vendor, compositeId));
          this.modelVendorMap.set(compositeId, { vendor, modelName: model.name });
        }
      } else {
        const apiKey = await this.configStore.getApiKey(vendor.name);
        if (apiKey) {
          const discovered = await this.discoverModelsFromApi(vendor, apiKey);
          for (const m of discovered) {
            const actualName = m.id.includes('/') ? m.id.substring(m.id.indexOf('/') + 1) : m.id;
            this.modelVendorMap.set(m.id, { vendor, modelName: actualName });
          }
          allModelConfigs.push(...discovered);
        }
      }
    }

    this.models = allModelConfigs.map(m => this.createModel(m));
    console.log('Coding Plans models refreshed:', this.models.map(m => m.id));
    this.modelChangedEmitter.fire();
  }

  async sendRequest(
    request: GenericChatRequest,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const mapping = this.modelVendorMap.get(request.modelId);
    if (!mapping) {
      throw new vscode.LanguageModelError(getMessage('vendorNotConfigured'));
    }

    const baseUrl = normalizeHttpBaseUrl(mapping.vendor.baseUrl);
    if (!baseUrl) {
      throw new vscode.LanguageModelError(getMessage('baseUrlInvalid'));
    }

    const apiKey = await this.configStore.getApiKey(mapping.vendor.name);
    if (!apiKey) {
      throw new vscode.LanguageModelError(getMessage('apiKeyRequired', mapping.vendor.name));
    }

    return this.sendOpenAIRequest(request, mapping.modelName, baseUrl, apiKey, token);
  }

  protected createModel(modelInfo: AIModelConfig): BaseLanguageModel {
    return new GenericLanguageModel(this, modelInfo);
  }

  private buildModelFromVendorConfig(
    model: VendorModelConfig,
    vendor: VendorConfig,
    compositeId: string
  ): AIModelConfig {
    const contextSize = model.contextSize ?? DEFAULT_CONTEXT_SIZE;
    const toolCalling = model.capabilities?.tools ?? true;
    const imageInput = model.capabilities?.vision ?? true;

    return {
      id: compositeId,
      vendor: 'coding-plans',
      family: vendor.name,
      name: model.name,
      version: vendor.name,
      maxTokens: contextSize,
      maxInputTokens: contextSize,
      maxOutputTokens: contextSize,
      capabilities: { toolCalling, imageInput },
      description: model.description || getMessage('genericDynamicModelDescription', vendor.name, model.name)
    };
  }

  private async discoverModelsFromApi(vendor: VendorConfig, apiKey: string): Promise<AIModelConfig[]> {
    try {
      const baseUrl = normalizeHttpBaseUrl(vendor.baseUrl);
      if (!baseUrl) {
        return [];
      }

      const response = await this.fetchJson<any>(`${baseUrl}/models`, {
        method: 'GET',
        ...this.buildRequestInit(apiKey)
      });
      const data = response.data;
      const entries: any[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
          ? data.models
          : Array.isArray(data)
            ? data
            : [];

      const models: AIModelConfig[] = [];
      const seen = new Set<string>();

      for (const entry of entries) {
        const modelId =
          typeof entry.id === 'string' ? entry.id.trim() :
          typeof entry.model === 'string' ? entry.model.trim() :
          typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!modelId || seen.has(modelId.toLowerCase())) {
          continue;
        }
        if (!this.isLikelyChatModel(modelId)) {
          continue;
        }
        seen.add(modelId.toLowerCase());

        const compositeId = `${vendor.name}/${modelId}`;
        models.push({
          id: compositeId,
          vendor: 'coding-plans',
          family: vendor.name,
          name: modelId,
          version: vendor.name,
          maxTokens: DEFAULT_CONTEXT_SIZE,
          maxInputTokens: DEFAULT_CONTEXT_SIZE,
          maxOutputTokens: DEFAULT_CONTEXT_SIZE,
          capabilities: { toolCalling: true, imageInput: true },
          description: getMessage('genericDynamicModelDescription', vendor.name, modelId)
        });
      }

      return models;
    } catch (error) {
      console.warn(`Failed to discover models from ${vendor.name}:`, error);
      return [];
    }
  }

  private async sendOpenAIRequest(
    request: GenericChatRequest,
    modelName: string,
    baseUrl: string,
    apiKey: string,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const messages = this.convertMessages(request.messages);
    const supportsToolCalling = !!request.capabilities.toolCalling;

    const payload: OpenAIChatRequest = {
      model: modelName,
      messages,
      tools: supportsToolCalling ? this.buildToolDefinitions(request.options) : undefined,
      tool_choice: supportsToolCalling ? this.buildToolChoice(request.options) : undefined,
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: DEFAULT_MAX_TOKENS
    };

    try {
      const requestInit = this.buildRequestInit(apiKey, token);
      const response = await this.postWithRetry(`${baseUrl}/chat/completions`, payload, requestInit);
      const responseMessage = response.choices[0]?.message;
      const content = responseMessage?.content || '';
      const usageData = response.usage;
      const responseParts = this.buildResponseParts(content, responseMessage?.tool_calls);

      async function* streamText(text: string): AsyncIterable<string> {
        if (text.trim().length > 0) {
          yield text;
        }
      }

      async function* streamParts(parts: vscode.LanguageModelResponsePart[]): AsyncIterable<vscode.LanguageModelResponsePart> {
        for (const part of parts) {
          yield part;
        }
      }

      const result: vscode.LanguageModelChatResponse = {
        stream: streamParts(responseParts),
        text: streamText(content)
      };

      if (usageData) {
        (result as any).promptTokens = usageData.prompt_tokens;
        (result as any).completionTokens = usageData.completion_tokens;
        (result as any).totalTokens = usageData.total_tokens;
      }

      return result;
    } catch (error: any) {
      throw this.toProviderError(error);
    }
  }

  private async postWithRetry(
    url: string,
    payload: OpenAIChatRequest,
    requestInit: RequestInit
  ): Promise<OpenAIChatResponse> {
    const maxRetries = 2;
    let attempt = 0;

    while (true) {
      try {
        const response = await this.fetchJson<OpenAIChatResponse>(url, {
          ...requestInit,
          method: 'POST',
          body: JSON.stringify(payload)
        });
        return response.data;
      } catch (error: any) {
        if (this.isAbortError(error)) {
          throw error;
        }

        const status = error?.response?.status;
        const shouldRetry = (status === 429 || (typeof status === 'number' && status >= 500)) && attempt < maxRetries;
        if (!shouldRetry) {
          throw error;
        }

        const delayMs = 800 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempt += 1;
      }
    }
  }

  private buildRequestInit(apiKey: string, token?: vscode.CancellationToken): RequestInit {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };
    const init: RequestInit = { headers };

    if (token) {
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      init.signal = controller.signal;
    }

    return init;
  }

  private toProviderError(error: any): vscode.LanguageModelError {
    const detail = this.readApiErrorMessage(error);
    const compactDetail = detail ? getCompactErrorMessage(detail) : undefined;

    if (this.isAbortError(error)) {
      return new vscode.LanguageModelError(getMessage('requestCancelled'));
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      return new vscode.LanguageModelError(compactDetail || getMessage('apiKeyInvalid'));
    }
    if (error.response?.status === 429) {
      return vscode.LanguageModelError.Blocked(
        compactDetail ? `${getMessage('rateLimitExceeded')}: ${compactDetail}` : getMessage('rateLimitExceeded')
      );
    }
    if (error.response?.status === 400) {
      const invalidDetail = compactDetail || getCompactErrorMessage(error.response.data?.error?.message || '');
      return new vscode.LanguageModelError(getMessage('invalidRequest', invalidDetail));
    }

    const message = compactDetail || getCompactErrorMessage(error) || getMessage('unknownError');
    return new vscode.LanguageModelError(getMessage('requestFailed', message));
  }

  private readApiErrorMessage(error: any): string | undefined {
    const responseData = error?.response?.data;
    if (!responseData) {
      return undefined;
    }

    const message = responseData?.error?.message || responseData?.message;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }

    if (typeof responseData === 'string' && responseData.trim().length > 0) {
      return responseData.trim();
    }

    return undefined;
  }

  private isAbortError(error: any): boolean {
    return !!error && typeof error === 'object' && error.name === 'AbortError';
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<{ data: T; status: number }> {
    const response = await fetch(url, init);
    const data = await this.readResponseData(response);

    if (!response.ok) {
      const error: any = new Error(`Request failed with status ${response.status}`);
      error.response = { status: response.status, data };
      throw error;
    }

    return { data: data as T, status: response.status };
  }

  private async readResponseData(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) {
      return undefined;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
