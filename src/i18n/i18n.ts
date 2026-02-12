import * as vscode from 'vscode';

interface Messages {
  [key: string]: string;
}

let currentMessages: Messages;
let currentLocale: string;

export async function initI18n(): Promise<void> {
  const config = vscode.env.language;
  const locale = config.startsWith('zh') ? 'zh-cn' : 'en';
  currentLocale = locale;

  try {
    const messageFile = locale === 'zh-cn' ? 'messages.zh-cn.json' : 'messages.en.json';
    const messagePath = __dirname + '/' + messageFile;

    // 在实际运行时，消息文件会被编译到 out/i18n 目录
    const messages = await import(messagePath);
    currentMessages = messages.default || messages;
  } catch (error) {
    console.error('Failed to load messages:', error);
    // 回退到英文
    currentMessages = {};
  }
}

export function getMessage(key: string, ...args: any[]): string {
  if (!currentMessages || !currentMessages[key]) {
    return key;
  }

  let message = currentMessages[key];

  // 替换占位符 {0}, {1}, 等
  args.forEach((arg, index) => {
    message = message.replace(`{${index}}`, String(arg));
  });

  return message;
}

export function getLocale(): string {
  return currentLocale || 'zh-cn';
}

export function isChinese(): boolean {
  return currentLocale === 'zh-cn';
}
