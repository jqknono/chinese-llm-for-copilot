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
  getCompactErrorMessage
} from './baseProvider';
import { getMessage } from '../i18n/i18n';

interface AliyunChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'required';
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface AliyunChatResponse {
  id: string;
  object: string;
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

interface AliyunModelListEntry {
  id?: string;
  model?: string;
  name?: string;
  max_tokens?: number;
  context_length?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  object?: string;
  created?: number;
  owned_by?: string;
}

interface AliyunModelListResponse {
  object?: string;
  data?: AliyunModelListEntry[];
  models?: AliyunModelListEntry[];
}

const ALIYUN_CODING_DEFAULT_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';

export class AliyunLanguageModel extends BaseLanguageModel {
  constructor(provider: BaseAIProvider, modelInfo: AIModelConfig) {
    super(provider, modelInfo);
  }

  async sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const aliyunProvider = this.provider as AliyunAIProvider;
    const aliyunMessages = aliyunProvider.convertMessages(messages);
    const supportsToolCalling = !!this.capabilities.toolCalling;

    const request: AliyunChatRequest = {
      model: this.id,
      messages: aliyunMessages,
      tools: supportsToolCalling ? aliyunProvider.buildToolDefinitions(options) : undefined,
      tool_choice: supportsToolCalling ? aliyunProvider.buildToolChoice(options) : undefined,
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 4000
    };

    try {
      const response = await (this.provider as AliyunAIProvider).sendRequest(request, token);
      return response;
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      throw new vscode.LanguageModelError(getMessage('requestFailed', getCompactErrorMessage(error)));
    }
  }
}

export class AliyunAIProvider extends BaseAIProvider {
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
        if (e.affectsConfiguration('coding-plans.aliyun.apiKey')) {
          await this.refreshModels();
        }
      })
    );
  }

  getVendor(): string {
    return 'aliyun-ai';
  }

  getConfigSection(): string {
    return 'coding-plans.aliyun';
  }

  getBaseUrl(): string {
    return ALIYUN_CODING_DEFAULT_BASE_URL;
  }

  getApiKey(): string {
    return this.readApiKey();
  }

  getPredefinedModels(): AIModelConfig[] {
    return [];
  }

  protected async resolveModelConfigs(): Promise<AIModelConfig[]> {
    try {
      const response = await this.apiClient.get<AliyunModelListResponse>('/models');
      const entries = this.readModelEntries(response.data);
      const models: AIModelConfig[] = [];
      const deduped = new Set<string>();

      for (const entry of entries) {
        const modelId = this.readModelId(entry);
        if (!modelId || !this.isChatModel(modelId)) {
          continue;
        }

        const dedupeKey = modelId.toLowerCase();
        if (deduped.has(dedupeKey)) {
          continue;
        }
        deduped.add(dedupeKey);

        const maxTokens = this.readMaxTokens(entry);
        models.push({
          id: modelId,
          vendor: 'aliyun-ai',
          family: this.inferFamily(modelId),
          name: modelId,
          version: MODEL_VERSION_LABEL,
          maxTokens,
          maxInputTokens: maxTokens,
          maxOutputTokens: maxTokens,
          capabilities: {
            toolCalling: true,
            imageInput: false
          },
          description: getMessage('aliyunDynamicModelDescription', modelId)
        });
      }

      return models;
    } catch (error: any) {
      if (this.isModelDiscoveryUnsupportedError(error)) {
        this.setModelDiscoveryUnsupported(true);
      }
      console.warn('Failed to fetch Aliyun models from /models.', error);
      return [];
    }
  }

  convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return this.toProviderMessages(messages);
  }

  async sendRequest(
    request: AliyunChatRequest,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new vscode.LanguageModelError(getMessage('apiKeyRequired', 'Aliyun'));
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
      console.error(getMessage('aliyunApiError'), error);
      const detail = this.readApiErrorMessage(error);
      const compactDetail = detail ? getCompactErrorMessage(detail) : undefined;

      if (axios.isCancel(error)) {
        throw new vscode.LanguageModelError(getMessage('requestCancelled'));
      }

      if (error.response?.status === 401) {
        throw new vscode.LanguageModelError(compactDetail || getMessage('apiKeyInvalid'));
      } else if (error.response?.status === 429) {
        throw vscode.LanguageModelError.Blocked(
          compactDetail ? `${getMessage('rateLimitExceeded')}: ${compactDetail}` : getMessage('rateLimitExceeded')
        );
      } else if (error.response?.status === 403) {
        throw new vscode.LanguageModelError(compactDetail || getMessage('apiKeyInvalid'));
      } else if (error.response?.status === 400) {
        const invalidDetail = compactDetail || getCompactErrorMessage(error.response.data?.error?.message || '');
        throw new vscode.LanguageModelError(getMessage('invalidRequest', invalidDetail));
      }

      throw new vscode.LanguageModelError(compactDetail || getCompactErrorMessage(error) || getMessage('unknownError'));
    }
  }

  protected createModel(modelInfo: AIModelConfig): BaseLanguageModel {
    return new AliyunLanguageModel(this, modelInfo);
  }

  private readModelEntries(payload: AliyunModelListResponse | undefined): AliyunModelListEntry[] {
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

  private readModelId(entry: AliyunModelListEntry): string | undefined {
    const candidate = entry.id || entry.model || entry.name;
    if (!candidate) {
      return undefined;
    }
    const normalized = candidate.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private readMaxTokens(entry: AliyunModelListEntry): number {
    const values = [entry.max_input_tokens, entry.max_output_tokens, entry.max_tokens, entry.context_length];
    for (const value of values) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }
    return 128000;
  }

  private inferFamily(modelId: string): string {
    const parts = modelId.split('-').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}-${parts[1]}`;
    }
    return parts[0] || 'qwen';
  }

  private isChatModel(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    if (lower.includes('embedding') || lower.includes('rerank') || lower.includes('speech') || lower.includes('tts') || lower.includes('asr')) {
      return false;
    }
    return true;
  }

  private isModelDiscoveryUnsupportedError(error: any): boolean {
    const status = error?.response?.status;
    return status === 404 || status === 405 || status === 501;
  }

  private async postChatCompletionsWithRetry(request: AliyunChatRequest, axiosConfig: any): Promise<{ data: AliyunChatResponse }> {
    const maxRetries = 2;
    let attempt = 0;

    while (true) {
      try {
        return await this.apiClient.post<AliyunChatResponse>(
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
}
