import {UAParser} from 'ua-parser-js';
import type {EnvInfo} from './types';

export function detectEnv(userAgent?: string): EnvInfo {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const parsed = new UAParser(ua).getResult();
  const lowerUA = ua.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(lowerUA);
  const isAndroid = /android/.test(lowerUA);
  const isWeChat = /micromessenger/.test(lowerUA);
  const isInApp = /\b(webview|wv)\b/.test(lowerUA) || isWeChat;
  return {
    userAgent: ua,
    browser: {name: parsed.browser.name, version: parsed.browser.version},
    os: {name: parsed.os.name, version: parsed.os.version},
    device: {type: parsed.device.type, vendor: parsed.device.vendor, model: parsed.device.model},
    isMobile: parsed.device.type === 'mobile' || isIOS || isAndroid,
    isIOS,
    isAndroid,
    isWeChat,
    isInApp,
    isDev: typeof import.meta !== 'undefined' && (import.meta as unknown as {env?: {DEV?: boolean}}).env?.DEV === true
  };
}
