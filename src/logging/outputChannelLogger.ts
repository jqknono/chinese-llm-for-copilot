import * as vscode from 'vscode';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

class OutputChannelLogger implements vscode.Disposable {
  private channel: vscode.OutputChannel | undefined;

  constructor(private readonly channelName: string) {}

  info(message: string, data?: unknown): void {
    this.write('INFO', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.write('WARN', message, data);
  }

  error(message: string, data?: unknown): void {
    this.write('ERROR', message, data);
  }

  debug(message: string, data?: unknown): void {
    this.write('DEBUG', message, data);
  }

  dispose(): void {
    this.channel?.dispose();
    this.channel = undefined;
  }

  private getChannel(): vscode.OutputChannel {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel(this.channelName);
    }
    return this.channel;
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const suffix = data === undefined ? '' : ` ${this.stringify(data)}`;
    this.getChannel().appendLine(`${timestamp} [${level}] ${message}${suffix}`);
  }

  private stringify(data: unknown): string {
    if (typeof data === 'string') {
      return data;
    }

    try {
      return JSON.stringify(
        data,
        (_key, value) => {
          if (value instanceof Error) {
            return {
              name: value.name,
              message: value.message,
              stack: value.stack
            };
          }
          return value;
        }
      );
    } catch {
      return String(data);
    }
  }
}

export const logger = new OutputChannelLogger('Coding Plans');
