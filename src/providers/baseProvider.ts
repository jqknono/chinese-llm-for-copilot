import * as vscode from 'vscode';

export const MODEL_VERSION_LABEL = 'Chinese AI Copilot';

export interface ModelCapabilities {
  toolCalling?: boolean | number;
  imageInput?: boolean;
}

export interface AIModelConfig {
  id: string;
  vendor: string;
  family: string;
  name: string;
  version?: string;
  maxTokens: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  capabilities?: ModelCapabilities;
  description: string;
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

export abstract class BaseLanguageModel implements vscode.LanguageModelChat {
  public readonly id: string;
  public readonly vendor: string;
  public readonly family: string;
  public readonly name: string;
  public readonly version: string;
  public readonly maxInputTokens: number;
  public readonly maxOutputTokens: number;
  public readonly capabilities: vscode.LanguageModelChatCapabilities;
  public readonly description: string;

  constructor(
    protected provider: BaseAIProvider,
    modelInfo: AIModelConfig
  ) {
    this.id = modelInfo.id;
    this.vendor = modelInfo.vendor;
    this.family = modelInfo.family;
    this.name = modelInfo.name;
    this.version = modelInfo.version || MODEL_VERSION_LABEL;
    this.maxInputTokens = modelInfo.maxInputTokens ?? modelInfo.maxTokens;
    this.maxOutputTokens = modelInfo.maxOutputTokens ?? modelInfo.maxTokens;
    this.capabilities = modelInfo.capabilities ?? {
      toolCalling: true,
      imageInput: false
    };
    this.description = modelInfo.description;
  }

  abstract sendRequest(
    messages: vscode.LanguageModelChatMessage[],
    options?: vscode.LanguageModelChatRequestOptions,
    token?: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatResponse>;

  countTokens(
    text: string | vscode.LanguageModelChatMessage,
    token?: vscode.CancellationToken
  ): Promise<number> {
    let contentText: string;

    if (typeof text === 'string') {
      contentText = text;
    } else {
      contentText = typeof text.content === 'string'
        ? text.content
        : text.content.map(part => 'value' in part ? (part as any).value : '').join('');
    }

    // 简单的 token 估算：每个字符约 0.5 个 token
    return Promise.resolve(Math.ceil(contentText.length * 0.5));
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

export abstract class BaseAIProvider implements vscode.Disposable {
  protected models: BaseLanguageModel[];
  protected disposables: vscode.Disposable[] = [];
  private readonly modelChangedEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeModels = this.modelChangedEmitter.event;

  constructor(protected context: vscode.ExtensionContext) {
    this.models = [];
  }

  abstract getVendor(): string;
  abstract getConfigSection(): string;
  abstract getBaseUrl(): string;
  abstract getApiKey(): string;
  abstract getPredefinedModels(): AIModelConfig[];
  abstract convertMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[];
  abstract sendRequest(request: any, token?: vscode.CancellationToken): Promise<vscode.LanguageModelChatResponse>;

  async refreshModels(): Promise<void> {
    const apiKey = this.getApiKey();

    if (!apiKey) {
      this.models = [];
      this.modelChangedEmitter.fire();
      return;
    }

    try {
      const resolvedModels = await this.resolveModelConfigs();
      this.models = resolvedModels.map(model => this.createModel(model));
      console.log(`${this.getVendor()} 模型列表已刷新:`, this.models.map(m => m.id));
      this.modelChangedEmitter.fire();
    } catch (error: any) {
      console.error(`刷新 ${this.getVendor()} 模型列表失败:`, error);
      this.models = [];
      this.modelChangedEmitter.fire();
    }
  }

  protected async resolveModelConfigs(): Promise<AIModelConfig[]> {
    return this.getPredefinedModels();
  }

  protected abstract createModel(modelInfo: AIModelConfig): BaseLanguageModel;

  getAvailableModels(): BaseLanguageModel[] {
    return this.models;
  }

  getModel(modelId: string): BaseLanguageModel | undefined {
    return this.models.find(m => m.id === modelId);
  }

  protected toChatRole(role: vscode.LanguageModelChatMessageRole | string): 'user' | 'assistant' | 'system' {
    if (role === vscode.LanguageModelChatMessageRole.User || role === 'user') {
      return 'user';
    }
    if (role === vscode.LanguageModelChatMessageRole.Assistant || role === 'assistant') {
      return 'assistant';
    }
    return 'system';
  }

  protected readMessageContent(content: string | ReadonlyArray<vscode.LanguageModelInputPart | unknown>): string {
    if (typeof content === 'string') {
      return content;
    }

    return content.map(part => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return part.value;
      }

      if (part && typeof part === 'object' && 'value' in part) {
        const value = (part as { value?: unknown }).value;
        if (typeof value === 'string') {
          return value;
        }
      }

      return '';
    }).join('');
  }

  public toProviderMessages(messages: vscode.LanguageModelChatMessage[]): ChatMessage[] {
    const normalized: ChatMessage[] = [];

    for (const message of messages) {
      const textParts: string[] = [];
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];
      const toolResults: vscode.LanguageModelToolResultPart[] = [];

      for (const part of message.content) {
        if (part instanceof vscode.LanguageModelTextPart) {
          textParts.push(part.value);
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push(part);
        } else if (part instanceof vscode.LanguageModelToolResultPart) {
          toolResults.push(part);
        } else if (part instanceof vscode.LanguageModelDataPart) {
          textParts.push(this.readDataPartContent(part));
        } else if (part && typeof part === 'object' && 'value' in part) {
          const value = (part as { value?: unknown }).value;
          if (typeof value === 'string') {
            textParts.push(value);
          }
        }
      }

      const textContent = textParts.join('');

      if (toolResults.length > 0) {
        for (const result of toolResults) {
          normalized.push({
            role: 'tool',
            tool_call_id: result.callId,
            content: this.stringifyToolResultContent(result.content)
          });
        }
        if (textContent.trim().length > 0) {
          normalized.push({
            role: 'user',
            content: textContent
          });
        }
        continue;
      }

      if (toolCalls.length > 0) {
        normalized.push({
          role: 'assistant',
          content: textContent,
          tool_calls: toolCalls.map(call => ({
            id: call.callId || this.makeToolCallId(),
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.input ?? {})
            }
          }))
        });
        continue;
      }

      normalized.push({
        role: this.toChatRole(message.role),
        content: textContent
      });
    }

    return normalized;
  }

  public buildToolDefinitions(
    options?: vscode.LanguageModelChatRequestOptions
  ): ChatToolDefinition[] | undefined {
    if (!options?.tools || options.tools.length === 0) {
      return undefined;
    }

    return options.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || {
          type: 'object',
          properties: {},
          additionalProperties: true
        }
      }
    }));
  }

  public buildToolChoice(
    options?: vscode.LanguageModelChatRequestOptions
  ): 'auto' | 'required' | undefined {
    if (!options?.tools || options.tools.length === 0) {
      return undefined;
    }

    if (options.toolMode === vscode.LanguageModelChatToolMode.Required) {
      return 'required';
    }

    return 'auto';
  }

  public buildResponseParts(content: string, toolCalls?: ChatToolCall[]): vscode.LanguageModelResponsePart[] {
    const parts: vscode.LanguageModelResponsePart[] = [];

    if (content.trim().length > 0) {
      parts.push(new vscode.LanguageModelTextPart(content));
    }

    for (const toolCall of toolCalls ?? []) {
      const name = toolCall.function?.name;
      if (!name) {
        continue;
      }

      parts.push(
        new vscode.LanguageModelToolCallPart(
          toolCall.id || this.makeToolCallId(),
          name,
          this.parseToolArguments(toolCall.function.arguments)
        )
      );
    }

    return parts;
  }

  private readDataPartContent(part: vscode.LanguageModelDataPart): string {
    try {
      const decoder = new TextDecoder();
      if (part.mimeType.startsWith('text/') || part.mimeType.includes('json')) {
        return decoder.decode(part.data);
      }
      return `[${part.mimeType} ${part.data.byteLength} bytes]`;
    } catch {
      return '';
    }
  }

  private stringifyToolResultContent(content: Array<vscode.LanguageModelTextPart | vscode.LanguageModelPromptTsxPart | vscode.LanguageModelDataPart | unknown>): string {
    const resultParts = content.map(part => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return part.value;
      }
      if (part instanceof vscode.LanguageModelDataPart) {
        return this.readDataPartContent(part);
      }
      try {
        return JSON.stringify(part);
      } catch {
        return String(part);
      }
    }).filter(part => part.length > 0);

    return resultParts.join('\n');
  }

  private parseToolArguments(rawArgs: string): object {
    if (!rawArgs) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === 'object') {
        return parsed as object;
      }
      return { value: parsed };
    } catch {
      return { raw: rawArgs };
    }
  }

  private makeToolCallId(): string {
    return `tool_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this.modelChangedEmitter.dispose();
  }
}
