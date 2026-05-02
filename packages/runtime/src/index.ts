import {detectEnv, type EnvInfo} from './env';
import {createExperiment, type ExperimentController, type ExperimentOptions} from './experiment';
import {createLogger, type Logger, type LoggerOptions} from './logger';
import {type MobileOptions, setupMobile} from './mobile';
import {type CreateRequestOptions, createRequest} from './request';
import {createTheme, type ThemeController, type ThemeOptions} from './theme';

export * from './auth';
export * from './bridge';
export * from './env';
export * from './experiment';
export * from './logger';
export * from './mobile';
export * from './mock';
export * from './request';
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
