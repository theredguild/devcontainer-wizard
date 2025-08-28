type ConfirmTheme = {
  prefix: string | { idle: string; done: string };
  spinner: {
    interval: number;
    frames: string[];
  };
  style: {
    answer: (text: string) => string;
    message: (text: string, status: 'idle' | 'done' | 'loading') => string;
    defaultAnswer: (text: string) => string;
  };
};

export type Runtime = 'rust' | 'python' | 'go' | 'node' | 'uv' | 'asdf' | 'pnpm';

export type Selection = {
    languages: string[];
    frameworks: string[];
    fuzzingAndTesting: string[];
    securityTooling: string[];
};

export type WizardState = {
  languages?: string[]
  frameworks?: string[]
  fuzzingAndTesting?: string[]
  securityTooling?: string[]
  name?: string
  vscodeExtensions?: string[]
  savePath?: string
  systemHardening?: string[]
  gitRepository?: {
    url: string
    branch?: string
    enabled: boolean
  }
}

type stepFunction = (wizardState: WizardState) => Promise<void>