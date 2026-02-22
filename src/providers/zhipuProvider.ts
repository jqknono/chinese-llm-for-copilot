import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import {
  BaseAIProvider,
  BaseLanguageModel,
  AIModelConfig,
  ChatMessage,
  ChatToolCall,
  ChatToolDefinition,
  MODEL_VERSION_LABEL,
  ModelCapabilities
} from './baseProvider';
import { getMessage } from '../i18n/i18n';

interface ZhipuChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'required';
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface ZhipuChatResponse {
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ZhipuModelListEntry {
  id?: string;
  model?: string;
  name?: string;
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  context_length?: number;
  tool_calling?: boolean | number;
  function_calling?: boolean | number;
  image_input?: boolean;
  vision?: boolean;
  capabilities?: {
    tool_calling?: boolean | number;
    function_calling?: boolean | number;
    image_input?: boolean;
    vision?: boolean;
    max_input_tokens?: number;
    max_output_tokens?: number;
  };
}

interface ZhipuModelListResponse {
  data?: ZhipuModelListEntry[];
  models?: ZhipuModelListEntry[];
}

const ZHIPU_DEFAULT_MAINLAND_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4';
const ZHIPU_DEFAULT_OVERSEAS_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

export class ZhipuLanguageModel extends BaseLanguageModel {
  constructor(provider: BaseAIProvider, modelInfo: AIModelConfig) {
    super(provider, modelInfo);
  }

  async sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const zhipuProvider = this.provider as ZhipuAIProvider;
    const zhipuMessages = zhipuProvider.convertMessages(messages);
    const supportsToolCalling = !!this.capabilities.toolCalling;

    const request: ZhipuChatRequest = {
      model: this.id,
      messages: zhipuMessages,
      tools: supportsToolCalling ? zhipuProvider.buildToolDefinitions(options) : undefined,
      tool_choice: supportsToolCalling ? zhipuProvider.buildToolChoice(options) : undefined,
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 4000
    };

    try {
      const response = await (this.provider as ZhipuAIProvider).sendRequest(request, token);
      return response;
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      throw new vscode.LanguageModelError(getMessage('requestFailed', error));
    }
  }
}

export class ZhipuAIProvider extends BaseAIProvider {
  private apiClient: AxiosInstance;

  constructor(context: vscode.ExtensionContext) {
    super(context);

    const baseUrl = this.getBaseUrl();
    this.apiClient = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // 添加请求拦截器设置 API Key
    this.apiClient.interceptors.request.use((config) => {
      const apiKey = this.getApiKey();
      if (apiKey) {
        config.headers['Authorization'] = `Bearer ${apiKey}`;
      }
      return config;
    });

    // 监听配置变化
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('coding-plans.zhipu.apiKey') || this.hasEndpointConfigChanged(e)) {
          if (this.hasEndpointConfigChanged(e)) {
            this.apiClient.defaults.baseURL = this.getBaseUrl();
          }
          await this.refreshModels();
        }
      })
    );
  }

  getVendor(): string {
    return 'zhipu-ai';
  }

  getConfigSection(): string {
    return 'coding-plans.zhipu';
  }

  getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('coding-plans.zhipu');
    const region = config.get<boolean>('region', true);
    if (!region) {
      return ZHIPU_DEFAULT_OVERSEAS_BASE_URL;
    }
    return ZHIPU_DEFAULT_MAINLAND_BASE_URL;
  }

  getApiKey(): string {
    return this.readApiKey();
  }

  getPredefinedModels(): AIModelConfig[] {
    return [];
  }

  protected async resolveModelConfigs(): Promise<AIModelConfig[]> {
    const response = await this.apiClient.get<ZhipuModelListResponse>('/models');
    const entries = this.readModelEntries(response.data);
    const dedupedModelIds = new Set<string>();
    const models: AIModelConfig[] = [];

    for (const entry of entries) {
      const modelId = this.readModelId(entry);
      if (!modelId || !this.isChatModel(modelId) || dedupedModelIds.has(modelId)) {
        continue;
      }

      dedupedModelIds.add(modelId);
      models.push({
        id: modelId,
        vendor: 'zhipu-ai',
        family: this.inferFamily(modelId),
        name: modelId,
        version: MODEL_VERSION_LABEL,
        maxTokens: this.readMaxInputTokens(entry),
        maxInputTokens: this.readMaxInputTokens(entry),
        maxOutputTokens: this.readMaxOutputTokens(entry),
        capabilities: this.readCapabilities(entry),
        description: getMessage('zhipuDynamicModelDescription', modelId)
      });
    }

    return models;
  }

  convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return this.toProviderMessages(messages);
  }

  async sendRequest(
    request: ZhipuChatRequest,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new vscode.LanguageModelError(getMessage('apiKeyRequired', 'Zhipu'));
    }

    try {
      const axiosConfig: any = {};
      if (token) {
        const cancelSource = axios.CancelToken.source();
        token.onCancellationRequested(() => {
          cancelSource.cancel();
        });
        axiosConfig.cancelToken = cancelSource.token;
      }

      const response = await this.postChatCompletionsWithRetry(request, axiosConfig);

      const responseMessage = response.data.choices[0]?.message;
      const content = responseMessage?.content || '';
      const usageData = response.data.usage;
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
      console.error(getMessage('zhipuApiError'), error);
      const detail = this.readApiErrorMessage(error);

      if (axios.isCancel(error)) {
        throw new vscode.LanguageModelError(getMessage('requestCancelled'));
      }

      if (error.response?.status === 401) {
        throw new vscode.LanguageModelError(detail || getMessage('apiKeyInvalid'));
      } else if (error.response?.status === 429) {
        throw new vscode.LanguageModelError(detail ? `${getMessage('rateLimitExceeded')}: ${detail}` : getMessage('rateLimitExceeded'));
      } else if (error.response?.status === 403) {
        throw new vscode.LanguageModelError(detail || getMessage('apiKeyInvalid'));
      } else if (error.response?.status === 400) {
        throw new vscode.LanguageModelError(getMessage('invalidRequest', detail || error.response.data?.error?.message));
      }

      throw new vscode.LanguageModelError(detail || error.message || getMessage('unknownError'));
    }
  }

  protected createModel(modelInfo: AIModelConfig): BaseLanguageModel {
    return new ZhipuLanguageModel(this, modelInfo);
  }

  private readModelEntries(payload: ZhipuModelListResponse | undefined): ZhipuModelListEntry[] {
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload.data)) {
      return payload.data;
    }

    if (Array.isArray(payload.models)) {
      return payload.models;
    }

    return [];
  }

  private readModelId(entry: ZhipuModelListEntry): string | undefined {
    const candidate = entry.id || entry.model || entry.name;
    if (!candidate) {
      return undefined;
    }
    const normalized = candidate.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private readMaxTokens(entry: ZhipuModelListEntry): number {
    return this.readMaxInputTokens(entry);
  }

  private readMaxInputTokens(entry: ZhipuModelListEntry): number {
    const values = [entry.capabilities?.max_input_tokens, entry.max_input_tokens, entry.max_tokens, entry.context_length];
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }
    return 128000;
  }

  private readMaxOutputTokens(entry: ZhipuModelListEntry): number {
    const values = [entry.capabilities?.max_output_tokens, entry.max_output_tokens, entry.max_tokens, entry.context_length];
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }
    return this.readMaxInputTokens(entry);
  }

  private readCapabilities(entry: ZhipuModelListEntry): ModelCapabilities {
    const toolCalling = this.readToolCalling(entry);
    const imageInput = this.readImageInput(entry);
    return {
      toolCalling,
      imageInput
    };
  }

  private readToolCalling(entry: ZhipuModelListEntry): boolean | number {
    const values: Array<boolean | number | undefined> = [
      entry.capabilities?.tool_calling,
      entry.capabilities?.function_calling,
      entry.tool_calling,
      entry.function_calling
    ];
    for (const value of values) {
      if (typeof value === 'boolean' || typeof value === 'number') {
        return value;
      }
    }
    return true;
  }

  private readImageInput(entry: ZhipuModelListEntry): boolean {
    const values: Array<boolean | undefined> = [
      entry.capabilities?.image_input,
      entry.capabilities?.vision,
      entry.image_input,
      entry.vision
    ];
    for (const value of values) {
      if (typeof value === 'boolean') {
        return value;
      }
    }
    return false;
  }

  private inferFamily(modelId: string): string {
    const parts = modelId.split('-').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}`;
    }
    return parts[0] || 'glm';
  }

  private isChatModel(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    if (lower.includes('embedding') || lower.includes('rerank') || lower.includes('speech')) {
      return false;
    }
    return lower.startsWith('glm');
  }

  private async postChatCompletionsWithRetry(request: ZhipuChatRequest, axiosConfig: any): Promise<{ data: ZhipuChatResponse }> {
    const maxRetries = 2;
    let attempt = 0;

    while (true) {
      try {
        return await this.apiClient.post<ZhipuChatResponse>(
          '/chat/completions',
          request,
          axiosConfig
        );
      } catch (error: any) {
        if (axios.isCancel(error)) {
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

  private hasEndpointConfigChanged(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration('coding-plans.zhipu.region');
  }
}
