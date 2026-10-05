declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
    LLM_API_KEY?: string;
    LLM_MODEL?: string;
    NODE_ENV?: string;
  }
  interface Process {
    env: ProcessEnv;
    exit(code?: number): never;
  }
  interface Timeout {}
}

declare const process: NodeJS.Process;

declare function setTimeout(callback: (...args: any[]) => void, ms?: number, ...args: any[]): NodeJS.Timeout;
declare function clearTimeout(timeoutId?: NodeJS.Timeout | number): void;
