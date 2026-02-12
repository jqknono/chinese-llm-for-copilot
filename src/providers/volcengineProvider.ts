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

const VOLCENGINE_DEFAULT_MAINLAND_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const VOLCENGINE_DEFAULT_OVERSEAS_BASE_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';

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
    return [
      {
        id: 'ep-20250201140916-m989g',
        vendor: 'volcengine-ai',
        family: 'doubao',
        name: '豆包 32K',
        version: MODEL_VERSION_LABEL,
        maxTokens: 32768,
        capabilities: {
          toolCalling: true,
          imageInput: false
        },
        description: getMessage('doubao32kDescription')
      },
      {
        id: 'doubao-pro-32k',
        vendor: 'volcengine-ai',
        family: 'doubao',
        name: '豆包 Pro 32K',
        version: MODEL_VERSION_LABEL,
        maxTokens: 32768,
        capabilities: {
          toolCalling: true,
          imageInput: false
        },
        description: getMessage('doubaoPro32kDescription')
      },
      {
        id: 'doubao-pro-128k',
        vendor: 'volcengine-ai',
        family: 'doubao',
        name: '豆包 Pro 128K',
        version: MODEL_VERSION_LABEL,
        maxTokens: 128000,
        capabilities: {
          toolCalling: true,
          imageInput: false
        },
        description: getMessage('doubaoPro128kDescription')
      }
    ];
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

  private hasEndpointConfigChanged(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration('Chinese-AI.volcengine.region');
  }
}
