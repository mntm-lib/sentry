import type {
  BaseClass,
  Primitive,
  SimpleRecord
} from './types.js';

export const getLocation = (): string => {
  return location.origin + location.pathname;
};

export const getTransaction = () => {
  return location.hash;
};

export const getReferrer = (): string => {
  return document.referrer || getLocation();
};

export const getUserAgent = (): string => {
  return navigator.userAgent;
};

export const getUser = (): SimpleRecord => {
  const query = location.search.slice(1);

  const params: SimpleRecord = {};

  if (query !== '') {
    let match: RegExpMatchArray | null;
    const paramsRegex = /([\w-]+)=([\w-]+)/g;

    while ((match = paramsRegex.exec(query)) !== null) {
      params[match[1]] = match[2];
    }
  }

  return params;
};

const screen = window.screen || {
  width: window.innerWidth,
  height: window.innerHeight
};

export const getTags = () => {
  return {
    'browser.screen': `${screen.width}x${screen.height}`,
    'browser.language': (navigator.languages && navigator.languages[0]) || navigator.language || (navigator as SimpleRecord).userLanguage || '',
    'browser.frame': window.parent !== window ? 'iframe' : 'native'
  };
};

export const FUNCTION = '<anonymous>';
export const UNKNOWN = '<unknown>';

export const getFunctionName = (fn: unknown) => {
  try {
    if (!fn || typeof fn !== 'function') {
      return FUNCTION;
    }

    return fn.name || FUNCTION;
  } catch {
    return FUNCTION;
  }
};

export const getType = {}.toString;

export const isInstanceOf = (wat: unknown, base: BaseClass) => {
  try {
    return wat instanceof base;
  } catch {
    return false;
  }
};

export const isError = (wat: unknown) => {
  if (wat == null) {
    return false;
  }
  switch (getType.call(wat)) {
    case '[object Error]':
    case '[object Exception]':
    case '[object DOMException]':
      return true;
    default:
      return isInstanceOf(wat, Error);
  }
};

export const isErrorEvent = (wat: unknown): wat is ErrorEvent => {
  return wat != null && getType.call(wat) === '[object ErrorEvent]';
};
export const isDOMError = (wat: unknown): wat is DOMException => {
  return wat != null && getType.call(wat) === '[object DOMError]';
};
export const isDOMException = (wat: unknown): wat is DOMException => {
  return wat != null && getType.call(wat) === '[object DOMException]';
};

export const isRecord = (wat: unknown): wat is SimpleRecord => {
  if (typeof wat !== 'object' || wat == null) {
    return false;
  }

  for (const key in wat) {
    return true;
  }

  return false;
};

export const isPrimitive = (wat: unknown): wat is Primitive => {
  return wat == null || (typeof wat !== 'object' && typeof wat !== 'function');
};

export const isElement = (wat: unknown): wat is Element => {
  return isInstanceOf(wat, Element);
};

export const isEvent = (wat: unknown): wat is Event => {
  return isInstanceOf(wat, Event);
};

export const truncate = (str: string) => {
  const safe = `${str}`;

  if (safe.length > 25) {
    return `${safe.slice(0, 20)}<...>`;
  }

  return safe;
};

export const createSIDPart = () => (Math.random() * 16 | 0).toString(16) + Date.now().toString(16);

export const createSID = () => {
  const version = '4';
  const order = (((Math.random() * 16 | 0) & 0x3) | 0x8).toString(16);

  let part = '';

  while (part.length < 30) {
    part += createSIDPart();
  }
  part = part.slice(0, 12) + version + part.slice(12, 16) + order + part.slice(16, 30);

  return part;
};

export const createDate = () => new Date().toISOString();
export const createTimestamp = () => Date.now() / 1000;

export const define = (to: SimpleRecord, name: string, value: unknown) => {
  try {
    Object.defineProperty(to, name, { value });
  } catch {
    // Noop
  }
};
