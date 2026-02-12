import * as vscode from 'vscode';

export interface AIModelConfig {
  id: string;
  vendor: string;
  family: string;
  name: string;
  version?: string;
  maxTokens: number;
  description: string;
}

export abstract class BaseLanguageModel implements vscode.LanguageModelChat {
  public readonly id: string;
  public readonly vendor: string;
  public readonly family: string;
  public readonly name: string;
  public readonly version: string;
  public readonly maxInputTokens: number;
  public readonly maxOutputTokens: number;
  public readonly description: string;

  constructor(
    protected provider: BaseAIProvider,
    modelInfo: AIModelConfig
  ) {
    this.id = modelInfo.id;
    this.vendor = modelInfo.vendor;
    this.family = modelInfo.family;
    this.name = modelInfo.name;
    this.version = modelInfo.version || '1.0.0';
    this.maxInputTokens = modelInfo.maxTokens;
    this.maxOutputTokens = modelInfo.maxTokens;
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
  role: 'user' | 'assistant' | 'system';
  content: string;
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

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this.modelChangedEmitter.dispose();
  }
}
