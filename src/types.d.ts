export type SelectTheme = {
  prefix: string | { idle: string; done: string };
  spinner: {
    interval: number;
    frames: string[];
  };
  style: {
    answer: (text: string) => string;
    message: (text: string, status: 'idle' | 'done' | 'loading') => string;
    error: (text: string) => string;
    help: (text: string) => string;
    highlight: (text: string) => string;
    description: (text: string) => string;
    disabled: (text: string) => string;
  };
  icon: {
    cursor: string;
  };
  helpMode: 'always' | 'never' | 'auto';
  indexMode: 'hidden' | 'number';
};

export type InputTheme = {
  prefix: string | { idle: string; done: string };
  spinner: {
    interval: number;
    frames: string[];
  };
  style: {
    answer: (text: string) => string;
    message: (text: string, status: 'idle' | 'done' | 'loading') => string;
    error: (text: string) => string;
    defaultAnswer: (text: string) => string;
  };
  validationFailureMode: 'keep' | 'clear';
};

export type CheckBoxTheme = {
    prefix: string | { idle: string; done: string };
    spinner: {
      interval: number;
      frames: string[];
    };
    style: {
      answer: (text: string) => string;
      message: (text: string, status: 'idle' | 'done' | 'loading') => string;
      error: (text: string) => string;
      defaultAnswer: (text: string) => string;
      help: (text: string) => string;
      highlight: (text: string) => string;
      key: (text: string) => string;
      disabledChoice: (text: string) => string;
      description: (text: string) => string;
      renderSelectedChoices: <T>(
        selectedChoices: ReadonlyArray<Choice<T>>,
        allChoices: ReadonlyArray<Choice<T> | Separator>,
      ) => string;
    };
    icon: {
      checked: string;
      unchecked: string;
      cursor: string;
    };
    helpMode: 'always' | 'never' | 'auto';
  };