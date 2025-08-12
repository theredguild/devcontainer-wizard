import { Theme } from "@/types";

export const checkboxStyle: Theme = {
  prefix: {
    idle: "•",
    done: "✓",
  },
  spinner: {
    interval: 120,
    frames: [".", "..", "..."],
  },
  style: {
    answer: (text) => text,
    message: (text) => text,
    error: (text) => text,
    defaultAnswer: (text) => text,
    help: (text) => text,
    highlight: (text) => text,
    key: (text) => text,
    disabledChoice: (text) => text,
    description: (text) => text,
    renderSelectedChoices: (selectedChoices) => `${selectedChoices.length} selected`,
  },
  icon: {
    checked: "✓",
    unchecked: "⬚",
    cursor: "›",
  },
  helpMode: "auto",
};
