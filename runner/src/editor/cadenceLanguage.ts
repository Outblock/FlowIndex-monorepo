import type { languages } from 'monaco-editor';

export const CADENCE_LANGUAGE_ID = 'cadence';

export const cadenceLanguageConfig: languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
    ['<', '>'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '/*', close: '*/', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '<', close: '>' },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /^\s*\/\/\s*#?region\b/,
      end: /^\s*\/\/\s*#?endregion\b/,
    },
  },
  indentationRules: {
    increaseIndentPattern: /^.*\{[^}"']*$/,
    decreaseIndentPattern: /^\s*\}/,
  },
};

export const cadenceTokenProvider: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.cadence',

  keywords: [
    'if', 'else', 'while', 'for', 'in', 'return', 'break', 'continue',
    'fun', 'let', 'var', 'import', 'from',
    'transaction', 'prepare', 'execute', 'pre', 'post',
    'access', 'all', 'self', 'account',
    'contract', 'resource', 'struct', 'event', 'emit', 'enum', 'case',
    'interface', 'entitlement', 'mapping',
    'create', 'destroy', 'move', 'attach', 'remove',
    'nil', 'true', 'false',
    'as', 'as!', 'as?',
    'pub', 'priv',
    'init', 'view',
    'switch', 'default',
    'try', 'catch',
  ],

  typeKeywords: [
    'String', 'Bool', 'Address', 'Void', 'Never', 'AnyStruct', 'AnyResource',
    'Character', 'Path', 'StoragePath', 'PublicPath', 'PrivatePath', 'CapabilityPath',
    'Type', 'Block',
    'Int', 'Int8', 'Int16', 'Int32', 'Int64', 'Int128', 'Int256',
    'UInt', 'UInt8', 'UInt16', 'UInt32', 'UInt64', 'UInt128', 'UInt256',
    'Word8', 'Word16', 'Word32', 'Word64', 'Word128', 'Word256',
    'Fix64', 'UFix64',
    'AuthAccount', 'PublicAccount',
    'Account',
  ],

  operators: [
    '=', '>', '<', '!', '~', '?', ':',
    '==', '<=', '>=', '!=', '&&', '||',
    '+', '-', '*', '/', '%', '&', '|', '^',
    '??', '<-', '<-!',
    '+=', '-=', '*=', '/=', '%=',
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Import statements
      [/import/, 'keyword', '@import_statement'],

      // Access control: access(all), access(self), access(account), access(contract)
      [/access/, {
        cases: {
          '@keywords': 'keyword',
        },
      }],

      // Identifiers and keywords
      [/[a-zA-Z_]\w*/, {
        cases: {
          '@typeKeywords': 'type',
          '@keywords': 'keyword',
          '@default': 'identifier',
        },
      }],

      // Whitespace
      { include: '@whitespace' },

      // Delimiters and operators
      [/[{}()\[\]]/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': '',
        },
      }],

      // Numbers
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/0[bB][01]+/, 'number.binary'],
      [/0[oO][0-7]+/, 'number.octal'],
      [/\d+\.\d+/, 'number.float'],
      [/\d+/, 'number'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
      [/"/, 'string', '@string'],

      // Decorators / attributes
      [/@[a-zA-Z_]\w*/, 'annotation'],
    ],

    import_statement: [
      [/\s+/, ''],
      [/[a-zA-Z_]\w*/, 'type'],
      [/from/, 'keyword'],
      [/0x[0-9a-fA-F]+/, 'number.hex'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/$/, '', '@pop'],
      [/\n/, '', '@pop'],
      [/./, '', '@pop'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment'],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],
  },
};

export function registerCadenceLanguage(monaco: typeof import('monaco-editor')) {
  if (!monaco.languages.getLanguages().some((l) => l.id === CADENCE_LANGUAGE_ID)) {
    monaco.languages.register({ id: CADENCE_LANGUAGE_ID });
  }
  monaco.languages.setLanguageConfiguration(CADENCE_LANGUAGE_ID, cadenceLanguageConfig);
  monaco.languages.setMonarchTokensProvider(CADENCE_LANGUAGE_ID, cadenceTokenProvider);
}
