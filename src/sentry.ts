import type {
  SentryEvent,
  SentryEventException,
  SentryException,
  SentryStackFrame,
  SimpleNode,
  SimpleRecord,
  StackTrace,
  TraceKitStackFrame,
  TraceKitStackTrace
} from './types.js';

import {
  FUNCTION,
  UNKNOWN,
  getLocation,
  getType,
  isDOMError,
  isDOMException,
  isElement,
  isError,
  isErrorEvent,
  isEvent,
  isRecord,
  truncate
} from './utils.js';

const addExceptionBase = (event: SentryEvent): SentryEventException => {
  const base = event as SentryEventException;

  base.exception = base.exception || {};
  base.exception.values = base.exception.values || [];
  base.exception.values[0] = base.exception.values[0] || {};

  return base;
};

const addExceptionTypeValue = (event: SentryEvent, value?: string, type?: string): SentryEventException => {
  const base = addExceptionBase(event);

  base.exception.values[0].value = base.exception.values[0].value || value || '';
  base.exception.values[0].type = base.exception.values[0].type || type || 'Error';

  return base;
};

export const addExceptionMechanism = (event: SentryEvent, mechanism: SimpleRecord): SentryEventException => {
  const base = addExceptionBase(event);

  base.exception.values[0].mechanism = base.exception.values[0].mechanism || {};
  for (const key in mechanism) {
    base.exception.values[0].mechanism[key] = mechanism[key];
  }

  return base;
};

const extractMessage = (ex: SimpleRecord): string => {
  const message = ex && ex.message;

  if (!message) {
    return 'No error message';
  }
  if (message.error && typeof message.error.message === 'string') {
    return message.error.message;
  }

  return message;
};

const popFrames = (stacktrace: StackTrace, popSize: number): StackTrace => {
  try {
    return Object.assign(stacktrace, stacktrace.stack.slice(popSize));
  } catch {
    return stacktrace;
  }
};

const chrome = /^\s*at (?:(.*?) ?\()?((?:file|https?|blob|chrome-extension|address|native|eval|webpack|<anonymous>|[a-z-]+:|.*bundle|\/).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i;
const gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)?((?:file|https?|blob|chrome|webpack|resource|moz-extension|capacitor).*?:\/.*?|\[native code]|[^@]*(?:bundle|\d+\.js)|\/[\w ./=-]+)(?::(\d+))?(?::(\d+))?\s*$/i;
const winjs = /^\s*at (?:((?:\[object object])?.+) )?\(?((?:file|ms-appx|https?|webpack|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i;
const geckoEval = /(\S+) line (\d+)(?: > eval line \d+)* > eval/i;
const chromeEval = /\((\S*):(\d+):(\d+)\)/;
const reactMinifiedRegexp = /minified react error #\d+;/i;
const opera10Regex = / line (\d+).*script (?:in )?(\S+)(?:: in function (\S+))?$/i;
const opera11Regex = / line (\d+), column (\d+)\s*(?:in (?:<anonymous function: ([^>]+)>|([^)]+))\((.*)\))? in (.*):\s*$/i;
const errorRegex = /^(?:uncaught (?:exception: )?)?(?:((?:eval|internal|range|reference|syntax|type|uri|)error): )?(.*)$/i;

const computeStackTraceFromStackProp = (ex: SimpleRecord): StackTrace | null => {
  if (!ex || !ex.stack) {
    return null;
  }

  const stack = [];
  const lines = (ex.stack as string).split('\n');
  let isEval;
  let submatch;
  let parts;
  let element;

  for (const [i, line] of lines.entries()) {
    if ((parts = chrome.exec(line))) {
      const isNative = parts[2] && parts[2].startsWith('native');

      isEval = parts[2] && parts[2].startsWith('eval');
      if (isEval && (submatch = chromeEval.exec(parts[2]))) {
        parts[2] = submatch[1];
        parts[3] = submatch[2];
        parts[4] = submatch[3];
      }

      let url = parts[2] && parts[2].startsWith('address at ') ? parts[2].slice('address at '.length) : parts[2];
      let func = parts[1] || FUNCTION;
      const isSafariExtension = func.includes('safari-extension');
      const isSafariWebExtension = func.includes('safari-web-extension');

      if (isSafariExtension || isSafariWebExtension) {
        func = func.includes('@') ? func.split('@')[0] : FUNCTION;
        url = isSafariExtension ? `safari-extension:${url}` : `safari-web-extension:${url}`;
      }

      element = {
        url,
        func,
        args: isNative ? [parts[2]] : [],
        line: parts[3] ? +parts[3] : null,
        column: parts[4] ? +parts[4] : null
      };
    } else if ((parts = winjs.exec(line))) {
      element = {
        url: parts[2],
        func: parts[1] || FUNCTION,
        args: [],
        line: +parts[3],
        column: parts[4] ? +parts[4] : null
      };
    } else if ((parts = gecko.exec(line))) {
      isEval = parts[3] && parts[3].includes(' > eval');
      if (isEval && (submatch = geckoEval.exec(parts[3]))) {
        parts[1] = parts[1] || `eval`;
        parts[3] = submatch[1];
        parts[4] = submatch[2];
        parts[5] = '';
      } else if (i === 0 && !parts[5] && ex.columnNumber != null) {
        stack[0].column = (ex.columnNumber as number) + 1;
      } else {
        // As-is
      }
      element = {
        url: parts[3],
        func: parts[1] || FUNCTION,
        args: parts[2] ? parts[2].split(',') : [],
        line: parts[4] ? +parts[4] : null,
        column: parts[5] ? +parts[5] : null
      };
    } else {
      // As-is
      continue;
    }

    if (!element.func && element.line) {
      element.func = FUNCTION;
    }

    stack.push(element);
  }

  if (stack.length === 0) {
    return null;
  }

  return {
    message: extractMessage(ex),
    name: (ex.name as string) || UNKNOWN,
    stack
  };
};

const computeStackTraceFromStacktraceProp = (ex: SimpleRecord): StackTrace | null => {
  if (!ex || !ex.stacktrace) {
    return null;
  }

  const lines = (ex.stacktrace as string).split('\n');
  const stack = [];
  let parts;
  let element = null;

  for (let line = 0; line < lines.length; line += 2) {
    if ((parts = opera10Regex.exec(lines[line]))) {
      element = {
        url: parts[2],
        func: parts[3],
        args: [],
        line: +parts[1],
        column: null
      };
    } else if ((parts = opera11Regex.exec(lines[line]))) {
      element = {
        url: parts[6],
        func: parts[3] || parts[4],
        args: parts[5] ? parts[5].split(',') : [],
        line: +parts[1],
        column: +parts[2]
      };
    } else {
      // As-is
    }

    if (element !== null) {
      if (!element.func && element.line) {
        element.func = FUNCTION;
      }
      stack.push(element);
    }

    element = null;
  }

  if (stack.length === 0) {
    return null;
  }

  return {
    message: extractMessage(ex),
    name: (ex.name as string) || UNKNOWN,
    stack
  };
};

const computeStackTrace = (ex: SimpleRecord): StackTrace => {
  let stack = null;
  let popSize = 0;

  if (ex) {
    if (typeof ex.framesToPop === 'number') {
      popSize = ex.framesToPop;
    } else if (reactMinifiedRegexp.test(ex.message as string)) {
      popSize = 1;
    } else {
      // As-is
    }
  }

  try {
    stack = computeStackTraceFromStacktraceProp(ex);
    if (stack) {
      return popFrames(stack, popSize);
    }
  } catch {
    // Noop
  }

  try {
    stack = computeStackTraceFromStackProp(ex);
    if (stack) {
      return popFrames(stack, popSize);
    }
  } catch {
    // Noop
  }

  return {
    message: extractMessage(ex),
    name: (ex && ex.name as string) || UNKNOWN,
    stack: [],
    failed: true
  };
};

const htmlElementAsString = (el: unknown): string => {
  const elem = el as Element | SVGElement;

  let out = '';

  if (!elem || !elem.tagName) {
    return out;
  }

  out += elem.tagName.toLowerCase();

  const id = elem.id;

  if (id) {
    out += `#${id}`;
  }

  let className = elem.className;

  if (className) {
    if (typeof className === 'object' && className.baseVal) {
      className = className.baseVal;
    }
    out += className.split(/\s+/).join('.');
  }

  return out;
};

const htmlTreeAsString = (elem: SimpleNode): string => {
  try {
    let currentElem = elem;
    const MAX_TRAVERSE_HEIGHT = 5;
    const MAX_OUTPUT_LEN = 80;
    let out = '';
    let height = 0;
    let len = 0;
    const separator = ' > ';
    const sepLength = separator.length;
    let nextStr;

    while (currentElem && height++ < MAX_TRAVERSE_HEIGHT) {
      nextStr = htmlElementAsString(currentElem);

      if (nextStr === 'html' || (height > 1 && len + (out.length * sepLength) + nextStr.length >= MAX_OUTPUT_LEN)) {
        break;
      }

      out = nextStr + separator + out;

      len += nextStr.length;
      currentElem = currentElem.parentNode;
    }

    return out;
  } catch {
    return UNKNOWN;
  }
};

const htmlTargetAsString = (elem: unknown): string => {
  return isElement(elem) ? htmlTreeAsString(elem) : getType.call(elem);
};

const getWalkSource = (value: SimpleRecord): SimpleRecord => {
  const source = Object.assign({}, value);

  if (isEvent(value)) {
    try {
      source.target = htmlTargetAsString(source.target);
    } catch {
      source.target = UNKNOWN;
    }

    try {
      source.currentTarget = htmlTargetAsString(source.currentTarget);
    } catch {
      source.currentTarget = UNKNOWN;
    }

    return source;
  }

  return value;
};

const extractExceptionKeysForMessage = (exception: SimpleRecord): string => {
  const keys = Object.keys(getWalkSource(exception));

  if (keys.length === 0) {
    return UNKNOWN;
  }

  return truncate(keys.join(', '));
};

const prepareFramesForEvent = (stack: TraceKitStackFrame[]): SentryStackFrame[] => {
  if (!stack || stack.length === 0) {
    return [];
  }

  let localStack = stack;

  const firstFrameFunction = localStack[0].func || '';

  if (firstFrameFunction.includes('captureMessage') || firstFrameFunction.includes('captureException')) {
    localStack = localStack.slice(1);
  }

  return localStack.
    slice(0, 20).
    reverse().
    map((frame: TraceKitStackFrame): SentryStackFrame => ({
      colno: frame.column === null ? 0 : frame.column,
      filename: frame.url || localStack[0].url,
      function: frame.func || FUNCTION,
      in_app: true,
      lineno: frame.line === null ? 0 : frame.line
    }));
};

const exceptionFromStacktrace = (stacktrace: TraceKitStackTrace): SentryException => {
  const frames = prepareFramesForEvent(stacktrace.stack);

  const exception: SentryException = {
    type: stacktrace.name,
    value: stacktrace.message || 'Unrecoverable error caught'
  };

  if (frames && frames.length > 0) {
    exception.stacktrace = { frames };
  }

  return exception;
};

const eventFromPlainObject = (exception: SimpleRecord, syntheticException: Error | null, rejection: boolean): SentryEvent => {
  const fallback = rejection ? 'UnhandledRejection' : 'Error';

  const event: SentryEvent = {
    exception: {
      values: [{
        type: isEvent(exception) ? exception.constructor.name : fallback,
        value: `Non-Error ${
          rejection ? 'promise rejection' : 'exception'
        } captured with keys: ${extractExceptionKeysForMessage(exception)}`
      }]
    }
  };

  if (syntheticException) {
    const stacktrace = computeStackTrace(syntheticException);
    const frames = prepareFramesForEvent(stacktrace.stack);

    event.stacktrace = {
      frames
    };
  }

  return event;
};

const eventFromStacktrace = (stacktrace: TraceKitStackTrace): SentryEvent => {
  const exception = exceptionFromStacktrace(stacktrace);

  return {
    exception: {
      values: [exception]
    }
  };
};

const eventFromString = (input: string, syntheticException: Error | null): SentryEvent => {
  const event: SentryEvent = {
    message: input
  };

  if (syntheticException) {
    const stacktrace = computeStackTrace(syntheticException);
    const frames = prepareFramesForEvent(stacktrace.stack);

    event.stacktrace = {
      frames
    };
  }

  return event;
};

export const eventFromUnknownInput = (exception: unknown, syntheticException: Error | null, rejection: boolean): SentryEvent => {
  let event: SentryEvent;

  if (isErrorEvent(exception) && exception.error) {
    event = eventFromStacktrace(computeStackTrace(exception.error as Error));

    return event;
  }

  if (isDOMError(exception) || isDOMException(exception)) {
    const domException = exception;
    const name = domException.name || (isDOMError(domException) ? 'DOMError' : 'DOMException');
    const message = domException.message ? `${name}: ${domException.message}` : name;

    event = eventFromString(message, syntheticException);
    event = addExceptionTypeValue(event, message);
    if ('code' in domException) {
      event.tags = Object.assign(event.tags, {
        'DOMException.code': `${domException.code}`
      });
    }

    return event;
  }

  if (isError(exception)) {
    event = eventFromStacktrace(computeStackTrace(exception as SimpleRecord));

    return event;
  }

  if (isRecord(exception)) {
    event = eventFromPlainObject(exception, syntheticException, rejection);
    event = addExceptionMechanism(event, {
      synthetic: true
    });

    return event;
  }

  event = eventFromString(exception as string, syntheticException);
  event = addExceptionTypeValue(event, `${exception}`);
  event = addExceptionMechanism(event, {
    synthetic: true
  });

  return event;
};

export const enhanceEventWithInitialFrame = (event: SentryEvent, url?: string, line?: number | string, column?: number | string): SentryEventException => {
  const base = addExceptionBase(event);

  base.exception.values[0].stacktrace = base.exception.values[0].stacktrace || {};
  base.exception.values[0].stacktrace.frames = base.exception.values[0].stacktrace.frames || [];
  const colno = column == null ? 0 : +column || 0;
  const lineno = line == null ? 0 : +line || 0;
  const filename = typeof url === 'string' && url !== '' ? url : getLocation();

  if (base.exception.values[0].stacktrace.frames.length === 0) {
    base.exception.values[0].stacktrace.frames.push({
      colno,
      filename,
      function: FUNCTION,
      in_app: true,
      lineno
    });
  }

  return base;
};

export const eventFromIncompleteOnError = (msg: ErrorEvent | string, url?: string, line?: number | string, column?: number | string) => {
  let name = 'Error';
  let message = isErrorEvent(msg) ? msg.message : msg;

  const groups = errorRegex.exec(message);

  if (groups) {
    name = groups[1] || name;
    message = groups[2] || message;
  }

  const event = {
    exception: {
      values: [{
        type: name,
        value: message
      }]
    }
  };

  return enhanceEventWithInitialFrame(event, url, line, column);
};

export const eventFromRejectionWithPrimitive = (reason: unknown) => {
  return {
    exception: {
      values: [{
        type: 'UnhandledRejection',
        value: `Non-Error promise rejection captured with value: ${String(reason)}`
      }]
    }
  };
};
