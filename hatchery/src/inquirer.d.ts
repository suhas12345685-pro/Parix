declare module 'inquirer' {
  interface PromptQuestion {
    name: string;
    type: string;
    message: string;
    default?: unknown;
    choices?: Array<string | { name: string; value: unknown; checked?: boolean }>;
    mask?: string;
  }

  interface Inquirer {
    prompt<T extends Record<string, unknown>>(questions: PromptQuestion[]): Promise<T>;
  }

  const inquirer: Inquirer;
  export default inquirer;
}
