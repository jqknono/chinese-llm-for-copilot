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

interface MinimaxChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  tool_choice?: 'auto' | 'required';
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface MinimaxChatResponse {
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

interface MinimaxModelListEntry {
  id?: string;
  model?: string;
  name?: string;
  max_tokens?: number;
  context_length?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
}

interface MinimaxModelListResponse {
  data?: MinimaxModelListEntry[];
  models?: MinimaxModelListEntry[];
}

const MINIMAX_DEFAULT_MAINLAND_BASE_URL = 'https://api.minimaxi.com/v1';
const MINIMAX_DEFAULT_OVERSEAS_BASE_URL = 'https://api.minimax.io/v1';

export class MinimaxLanguageModel extends BaseLanguageModel {
  constructor(provider: BaseAIProvider, modelInfo: AIModelConfig) {
    super(provider, modelInfo);
  }

  async sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const minimaxProvider = this.provider as MinimaxAIProvider;
    const minimaxMessages = minimaxProvider.convertMessages(messages);
    const supportsToolCalling = !!this.capabilities.toolCalling;

    const request: MinimaxChatRequest = {
      model: this.id,
      messages: minimaxMessages,
      tools: supportsToolCalling ? minimaxProvider.buildToolDefinitions(options) : undefined,
      tool_choice: supportsToolCalling ? minimaxProvider.buildToolChoice(options) : undefined,
      stream: false,
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 4000
    };

    try {
      const response = await (this.provider as MinimaxAIProvider).sendRequest(request, token);
      return response;
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        throw error;
      }
      throw new vscode.LanguageModelError(getMessage('requestFailed', error));
    }
  }
}

export class MinimaxAIProvider extends BaseAIProvider {
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
        if (e.affectsConfiguration('coding-plans.minimax.apiKey') || this.hasEndpointConfigChanged(e)) {
          if (this.hasEndpointConfigChanged(e)) {
            this.apiClient.defaults.baseURL = this.getBaseUrl();
          }
          await this.refreshModels();
        }
      })
    );
  }

  getVendor(): string {
    return 'minimax-ai';
  }

  getConfigSection(): string {
    return 'coding-plans.minimax';
  }

  getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('coding-plans.minimax');
    const region = config.get<boolean>('region', true);
    if (!region) {
      return MINIMAX_DEFAULT_OVERSEAS_BASE_URL;
    }
    return MINIMAX_DEFAULT_MAINLAND_BASE_URL;
  }

  getApiKey(): string {
    return this.readApiKey();
  }

  getPredefinedModels(): AIModelConfig[] {
    return [];
  }

  convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return this.toProviderMessages(messages);
  }

  async sendRequest(
    request: MinimaxChatRequest,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      throw new vscode.LanguageModelError(getMessage('apiKeyRequired', 'Minimax'));
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

      const response = await this.apiClient.post<MinimaxChatResponse>('/chat/completions', request, axiosConfig);

      const minimaxResponse = response.data;
      const responseMessage = minimaxResponse.choices[0]?.message;
      const content = responseMessage?.content || '';
      const usageData = minimaxResponse.usage;
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
      if (axios.isCancel(error)) {
        throw new vscode.LanguageModelError(getMessage('requestCancelled'));
      }

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          throw new vscode.LanguageModelError(getMessage('apiKeyInvalid'));
        } else if (status === 429) {
          throw new vscode.LanguageModelError(getMessage('rateLimitExceeded'));
        } else if (status === 400) {
          throw new vscode.LanguageModelError(getMessage('invalidRequest', data?.error?.message || 'Unknown'));
        } else {
          console.error(`${getMessage('minimaxApiError')} ${JSON.stringify(data)}`);
          throw new vscode.LanguageModelError(getMessage('unknownError'));
        }
      }

      console.error(`${getMessage('minimaxApiError')} ${error.message}`);
      throw new vscode.LanguageModelError(getMessage('unknownError'));
    }
  }

  protected async resolveModelConfigs(): Promise<AIModelConfig[]> {
    try {
      const response = await this.apiClient.get<MinimaxModelListResponse>('/models');
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
          vendor: 'minimax-ai',
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
          description: getMessage('minimaxDynamicModelDescription', modelId)
        });
      }

      return models;
    } catch (error: any) {
      if (this.isModelDiscoveryUnsupportedError(error)) {
        this.setModelDiscoveryUnsupported(true);
      }
      console.warn('Failed to fetch Minimax models from /models.', error);
      return [];
    }
  }

  buildToolDefinitions(options?: vscode.LanguageModelChatRequestOptions): ChatToolDefinition[] {
    if (!options?.tools || options.tools.length === 0) {
      return [];
    }

    return options.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as object
      }
    }));
  }

  protected createModel(modelInfo: AIModelConfig): BaseLanguageModel {
    return new MinimaxLanguageModel(this, modelInfo);
  }

  buildToolChoice(options?: vscode.LanguageModelChatRequestOptions): 'auto' | 'required' {
    if (!options?.tools || options.tools.length === 0) {
      return 'auto';
    }
    return 'required';
  }

  private hasEndpointConfigChanged(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration('coding-plans.minimax.region');
  }

  private readModelEntries(payload: MinimaxModelListResponse | undefined): MinimaxModelListEntry[] {
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

  private readModelId(entry: MinimaxModelListEntry): string | undefined {
    const candidate = entry.id || entry.model || entry.name;
    if (!candidate) {
      return undefined;
    }
    const normalized = candidate.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private readMaxTokens(entry: MinimaxModelListEntry): number {
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
    return parts[0] || 'minimax';
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
}
