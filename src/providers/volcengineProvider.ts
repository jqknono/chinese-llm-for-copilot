import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import {
  BaseAIProvider,
  BaseLanguageModel,
  AIModelConfig,
  ChatMessage,
  ChatToolCall,
  ChatToolDefinition,
  MODEL_VERSION_LABEL
} from './baseProvider';
import { getMessage } from '../i18n/i18n';

interface VolcengineChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'required';
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface VolcengineChatResponse {
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

interface VolcengineModelListEntry {
  id?: string;
  model?: string;
  name?: string;
  max_tokens?: number;
  context_length?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
}

interface VolcengineModelListResponse {
  data?: VolcengineModelListEntry[];
  models?: VolcengineModelListEntry[];
}

const VOLCENGINE_DEFAULT_MAINLAND_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3';
const VOLCENGINE_DEFAULT_OVERSEAS_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/coding/v3';

export class VolcengineLanguageModel extends BaseLanguageModel {
  constructor(provider: BaseAIProvider, modelInfo: AIModelConfig) {
    super(provider, modelInfo);
  }

  async sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const volcengineProvider = this.provider as VolcengineAIProvider;
    const volcengineMessages = volcengineProvider.convertMessages(messages);
    const supportsToolCalling = !!this.capabilities.toolCalling;

    const request: VolcengineChatRequest = {
      model: this.id,
      messages: volcengineMessages,
      tools: supportsToolCalling ? volcengineProvider.buildToolDefinitions(options) : undefined,
      tool_choice: supportsToolCalling ? volcengineProvider.buildToolChoice(options) : undefined,
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 4000
    };

    try {
      const response = await (this.provider as VolcengineAIProvider).sendRequest(request, token);
      return response;
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      throw new vscode.LanguageModelError(getMessage('requestFailed', error));
    }
  }
}

export class VolcengineAIProvider extends BaseAIProvider {
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
        if (e.affectsConfiguration('Chinese-AI.volcengine.apiKey') || this.hasEndpointConfigChanged(e)) {
          if (this.hasEndpointConfigChanged(e)) {
            this.apiClient.defaults.baseURL = this.getBaseUrl();
          }
          await this.refreshModels();
        }
      })
    );
  }

  getVendor(): string {
    return 'volcengine-ai';
  }

  getConfigSection(): string {
    return 'Chinese-AI.volcengine';
  }

  getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('Chinese-AI.volcengine');
    const region = config.get<boolean>('region', true);
    if (!region) {
      return VOLCENGINE_DEFAULT_OVERSEAS_BASE_URL;
    }
    return VOLCENGINE_DEFAULT_MAINLAND_BASE_URL;
  }

  getApiKey(): string {
    const config = vscode.workspace.getConfiguration('Chinese-AI.volcengine');
    return config.get<string>('apiKey', '');
  }

  getPredefinedModels(): AIModelConfig[] {
    return [];
  }

  protected async resolveModelConfigs(): Promise<AIModelConfig[]> {
    try {
      const response = await this.apiClient.get<VolcengineModelListResponse>('/models');
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
          vendor: 'volcengine-ai',
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
          description: getMessage('volcengineDynamicModelDescription', modelId)
        });
      }

      return models;
    } catch (error: any) {
      if (this.isModelDiscoveryUnsupportedError(error)) {
        this.setModelDiscoveryUnsupported(true);
      }
      console.warn('Failed to fetch Volcengine models from /models.', error);
      return [];
    }
  }

  convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return this.toProviderMessages(messages);
  }

  async sendRequest(
    request: VolcengineChatRequest,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new vscode.LanguageModelError(getMessage('apiKeyRequired', 'Volcengine'));
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

      const response = await this.apiClient.post<VolcengineChatResponse>(
        '/chat/completions',
        request,
        axiosConfig
      );

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
      console.error(getMessage('volcengineApiError'), error);

      if (axios.isCancel(error)) {
        throw new vscode.LanguageModelError(getMessage('requestCancelled'));
      }

      if (error.response?.status === 401) {
        throw new vscode.LanguageModelError(getMessage('apiKeyInvalid'));
      } else if (error.response?.status === 429) {
        throw new vscode.LanguageModelError(getMessage('rateLimitExceeded'));
      } else if (error.response?.status === 400) {
        throw new vscode.LanguageModelError(getMessage('invalidRequest', error.response.data?.error?.message));
      }

      throw new vscode.LanguageModelError(error.message || getMessage('unknownError'));
    }
  }

  protected createModel(modelInfo: AIModelConfig): BaseLanguageModel {
    return new VolcengineLanguageModel(this, modelInfo);
  }

  private readModelEntries(payload: VolcengineModelListResponse | undefined): VolcengineModelListEntry[] {
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

  private readModelId(entry: VolcengineModelListEntry): string | undefined {
    const candidate = entry.id || entry.model || entry.name;
    if (!candidate) {
      return undefined;
    }
    const normalized = candidate.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private readMaxTokens(entry: VolcengineModelListEntry): number {
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
    return parts[0] || 'volcengine';
  }

  private isChatModel(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    if (lower.includes('embedding') || lower.includes('rerank') || lower.includes('speech')) {
      return false;
    }
    return true;
  }

  private isModelDiscoveryUnsupportedError(error: any): boolean {
    const status = error?.response?.status;
    return status === 404 || status === 405 || status === 501;
  }

  private hasEndpointConfigChanged(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration('Chinese-AI.volcengine.region');
  }
}
