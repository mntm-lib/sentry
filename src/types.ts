export type Primitive = number | string | boolean | bigint | symbol | null | undefined;

export type SimpleRecord = Record<string, any>;

export interface BaseClass {
  new(...args: any[]): any;
}

export interface TraceKitStackFrame {
  url: string;
  func: string;
  args: string[];
  line: number | null;
  column: number | null;
}

export interface SentryStackFrame {
  filename?: string;
  function?: string;
  module?: string;
  platform?: string;
  lineno?: number;
  colno?: number;
  abs_path?: string;
  context_line?: string;
  pre_context?: string[];
  post_context?: string[];
  in_app?: boolean;
  instruction_addr?: string;
  addr_mode?: string;
  vars?: SimpleRecord;
}

export interface TraceKitStackTrace {
  name: string;
  message: string;
  mechanism?: string;
  stack: StackFrame[];
  failed?: boolean;
}

export interface SdkInfo {
  name: string;
  version: string;
  integrations?: string[];
  packages?: any[];
}

export interface SentryException {
  type?: string;
  value?: string;
  mechanism?: any;
  module?: string;
  thread_id?: number;
  stacktrace?: any;
}

export interface SentryEvent {
  event_id?: string;
  message?: string;
  timestamp?: number;
  start_timestamp?: number;
  level?: string;
  platform?: string;
  logger?: string;
  server_name?: string;
  release?: string;
  dist?: string;
  environment?: string;
  sdk?: SdkInfo;
  request?: Record<string, unknown>;
  transaction?: string;
  modules?: { [key: string]: string };
  fingerprint?: string[];
  exception?: {
    values?: SentryException[];
  };
  stacktrace?: any;
  breadcrumbs?: any[];
  contexts?: any;
  tags?: SimpleRecord;
  extra?: any;
  user?: any;
  type?: string;
  spans?: any[];
  measurements?: any;
  debug_meta?: any;
}

export type SentryEventException = Omit<SentryEvent, 'exception'> & {
  exception: {
    values: SentryException[];
  };
};

export interface StackFrame {
  url: string;
  func: string;
  args: string[];
  line: number | null;
  column: number | null;
}
export interface StackTrace {
  name: string;
  message: string;
  mechanism?: string;
  stack: StackFrame[];
  failed?: boolean;
}

export type ExtendedError = Error & SimpleRecord;

export type SimpleNode = {
  parentNode: SimpleNode;
} | null;

export interface SimpleEvent {
  [key: string]: unknown;
  type: string;
  target?: unknown;
  currentTarget?: unknown;
}