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
        if (e.affectsConfiguration('Chinese-AI.minimax.apiKey') || this.hasEndpointConfigChanged(e)) {
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
    return 'Chinese-AI.minimax';
  }

  getBaseUrl(): string {
    const config = vscode.workspace.getConfiguration('Chinese-AI.minimax');
    const region = config.get<boolean>('region', true);
    if (!region) {
      return MINIMAX_DEFAULT_OVERSEAS_BASE_URL;
    }
    return MINIMAX_DEFAULT_MAINLAND_BASE_URL;
  }

  getApiKey(): string {
    const config = vscode.workspace.getConfiguration('Chinese-AI.minimax');
    return config.get<string>('apiKey', '');
  }

  getPredefinedModels(): AIModelConfig[] {
    return [
      {
        id: 'abab4-chat',
        vendor: 'minimax-ai',
        family: 'abab4',
        name: 'Minimax abab4',
        version: MODEL_VERSION_LABEL,
        maxTokens: 32768,
        capabilities: {
          toolCalling: true,
          imageInput: false
        },
        description: getMessage('minimax4Description')
      },
      {
        id: 'abab5-chat',
        vendor: 'minimax-ai',
        family: 'abab5',
        name: 'Minimax abab5',
        version: MODEL_VERSION_LABEL,
        maxTokens: 32768,
        capabilities: {
          toolCalling: true,
          imageInput: false
        },
        description: getMessage('minimax55Description')
      },
      {
        id: 'abab5.5-chat',
        vendor: 'minimax-ai',
        family: 'abab5.5',
        name: 'Minimax abab5.5-chat',
        version: MODEL_VERSION_LABEL,
        maxTokens: 65536,
        capabilities: {
          toolCalling: true,
          imageInput: false
        },
        description: getMessage('minimax55ChatDescription')
      },
      {
        id: 'abab5.5-pro',
        vendor: 'minimax-ai',
        family: 'abab5.5',
        name: 'Minimax abab5.5-pro',
        version: MODEL_VERSION_LABEL,
        maxTokens: 128000,
        capabilities: {
          toolCalling: true,
          imageInput: false
        },
        description: getMessage('minimax55ProDescription')
      }
    ];
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

  async fetchAvailableModels(): Promise<AIModelConfig[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return [];
    }

    try {
      const response = await this.apiClient.get('/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (response.data && response.data.data) {
        return response.data.data.map((model: any) => ({
          id: model.id,
          vendor: this.getVendor(),
          family: model.id.split('-')[0] || model.id,
          name: model.id,
          version: MODEL_VERSION_LABEL,
          maxTokens: 32768,
          capabilities: {
            toolCalling: true,
            imageInput: false
          },
          description: getMessage('minimaxApiError', model.id)
        }));
      }

      return [];
    } catch (error) {
      console.error(`${getMessage('minimaxApiError')} ${error}`);
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
    return event.affectsConfiguration('Chinese-AI.minimax.region');
  }
}
