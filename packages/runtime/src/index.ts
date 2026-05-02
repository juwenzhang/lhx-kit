import {type EnvInfo, detectEnv} from './env';
import {type ExperimentController, type ExperimentOptions, createExperiment} from './experiment';
import {type Logger, type LoggerOptions, createLogger} from './logger';
import {type MobileOptions, setupMobile} from './mobile';
import {type CreateRequestOptions, createRequest} from './request';
import {type ThemeController, type ThemeOptions, createTheme} from './theme';

export * from './request';
export * from './env';
export * from './mobile';
export * from './logger';
export * from './bridge';
export * from './auth';
export * from './mock';
export * from './experiment';
export * from './theme';

export interface SetupRuntimeOptions {
  request?: CreateRequestOptions;
  mobile?: MobileOptions | false;
  logger?: LoggerOptions;
  experiment?: ExperimentOptions;
  theme?: ThemeOptions;
}

export interface RuntimeContext {
  request: ReturnType<typeof createRequest>;
  env: EnvInfo;
  logger: Logger;
  experiment: ExperimentController;
  theme?: ThemeController;
  dispose(): void;
}

export function setupRuntime(options: SetupRuntimeOptions = {}): RuntimeContext {
  const disposers: Array<() => void> = [];
  const env = detectEnv();
  const logger = createLogger(options.logger);
  const request = createRequest(options.request);
  const experiment = createExperiment(options.experiment);
  const theme = options.theme ? createTheme(options.theme) : undefined;

  if (options.mobile !== false) {
    const cleanup = setupMobile(options.mobile || {});
    disposers.push(cleanup);
  }

  return {
    request,
    env,
    logger,
    experiment,
    theme,
    dispose() {
      for (const fn of disposers) fn();
    }
  };
}
