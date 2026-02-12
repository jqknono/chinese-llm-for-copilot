import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';
import { BaseAIProvider, BaseLanguageModel, AIModelConfig, ChatMessage } from './baseProvider';
import { getMessage } from '../i18n/i18n';

interface ZhipuChatRequest {
  model: string;
  messages: ChatMessage[];
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
  context_length?: number;
}

interface ZhipuModelListResponse {
  data?: ZhipuModelListEntry[];
  models?: ZhipuModelListEntry[];
}

export class ZhipuLanguageModel extends BaseLanguageModel {
  constructor(provider: BaseAIProvider, modelInfo: AIModelConfig) {
    super(provider, modelInfo);
  }

  async sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse> {
    const zhipuMessages = (this.provider as ZhipuAIProvider).convertMessages(messages);

    const request: ZhipuChatRequest = {
      model: this.id,
      messages: zhipuMessages,
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
      throw new vscode.LanguageModelError(`请求失败: ${error}`);
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
        if (e.affectsConfiguration('china-ai.zhipu.apiKey') || e.affectsConfiguration('china-ai.zhipu.baseUrl')) {
          if (e.affectsConfiguration('china-ai.zhipu.baseUrl')) {
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
    return 'china-ai.zhipu';
  }

  getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('china-ai.zhipu');
    return config.get<string>('baseUrl', 'https://open.bigmodel.cn/api/paas/v4');
  }

  getApiKey(): string {
    const config = vscode.workspace.getConfiguration('china-ai.zhipu');
    return config.get<string>('apiKey', '');
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
        version: '1.0.0',
        maxTokens: this.readMaxTokens(entry),
        description: getMessage('zhipuDynamicModelDescription', modelId)
      });
    }

    return models;
  }

  convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    return messages.map(msg => {
      return {
        role: this.toChatRole(msg.role),
        content: this.readMessageContent(msg.content)
      };
    });
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

      const response = await this.apiClient.post<ZhipuChatResponse>(
        '/chat/completions',
        request,
        axiosConfig
      );

      const content = response.data.choices[0]?.message?.content || '';
      const usageData = response.data.usage;

      async function* streamText(text: string): AsyncIterable<string> {
        yield text;
      }

      async function* streamParts(text: string): AsyncIterable<vscode.LanguageModelTextPart | unknown> {
        yield new vscode.LanguageModelTextPart(text);
      }

      const result: vscode.LanguageModelChatResponse = {
        stream: streamParts(content),
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
    const values = [entry.max_input_tokens, entry.max_tokens, entry.context_length];
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
    return parts[0] || 'glm';
  }

  private isChatModel(modelId: string): boolean {
    const lower = modelId.toLowerCase();
    if (lower.includes('embedding') || lower.includes('rerank') || lower.includes('speech')) {
      return false;
    }
    return lower.startsWith('glm');
  }
}
