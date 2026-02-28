import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../logging/outputChannelLogger';

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
    const candidatePaths = [
      path.join(__dirname, 'i18n', messageFile),
      path.join(__dirname, messageFile)
    ];

    let loaded: Messages | undefined;
    for (const candidatePath of candidatePaths) {
      try {
        const fileContent = await fs.readFile(candidatePath, 'utf8');
        loaded = JSON.parse(fileContent) as Messages;
        break;
      } catch {
        // Try next candidate path.
      }
    }

    if (!loaded) {
      throw new Error(`Message file not found: ${messageFile}`);
    }
    currentMessages = loaded;
  } catch (error) {
    logger.error('Failed to load messages', error);
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
