export interface EnvInfo {
  userAgent: string;
  browser: {name?: string; version?: string};
  os: {name?: string; version?: string};
  device: {type?: string; vendor?: string; model?: string};
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isWeChat: boolean;
  isInApp: boolean;
  isDev: boolean;
}
