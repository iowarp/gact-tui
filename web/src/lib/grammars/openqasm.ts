import type { LanguageRegistration } from 'shiki';

/**
 * OpenQASM 2 and 3 for Shiki, which bundles no quantum language. Scopes follow the
 * TextMate names the `clio-syntax` theme already colours, so QASM reads in the same
 * palette as Python.
 */
const KEYWORDS = [
  'OPENQASM',
  'include',
  'defcalgrammar',
  'def',
  'defcal',
  'cal',
  'gate',
  'opaque',
  'extern',
  'box',
  'let',
  'input',
  'output',
  'const',
  'readonly',
  'mutable',
  'if',
  'else',
  'for',
  'in',
  'while',
  'break',
  'continue',
  'return',
  'end',
  'switch',
  'case',
  'default',
  'pragma',
];

const OPERATIONS = ['measure', 'reset', 'barrier', 'delay', 'stretch', 'durationof', 'nop'];

const TYPES = [
  'qubit',
  'qreg',
  'bit',
  'creg',
  'bool',
  'int',
  'uint',
  'float',
  'angle',
  'complex',
  'duration',
  'array',
  'void',
];

const MODIFIERS = ['ctrl', 'negctrl', 'inv', 'pow'];

const CONSTANTS = ['pi', 'π', 'tau', 'τ', 'euler', 'ℇ', 'true', 'false', 'im'];

const GATES = [
  'U',
  'CX',
  'gphase',
  'u',
  'u1',
  'u2',
  'u3',
  'p',
  'phase',
  'cphase',
  'id',
  'x',
  'y',
  'z',
  'h',
  's',
  'sdg',
  't',
  'tdg',
  'sx',
  'sxdg',
  'rx',
  'ry',
  'rz',
  'cx',
  'cy',
  'cz',
  'ch',
  'cp',
  'crx',
  'cry',
  'crz',
  'cu',
  'cu1',
  'cu3',
  'ccx',
  'cswap',
  'swap',
  'iswap',
  'ecr',
  'rxx',
  'ryy',
  'rzz',
  'rzx',
  'rccx',
  'rc3x',
  'c3x',
  'c3sqrtx',
  'c4x',
  'csx',
];

const words = (list: readonly string[]) => `(?<![\\w$])(?:${list.join('|')})(?![\\w$])`;

const openqasm: LanguageRegistration = {
  name: 'openqasm',
  displayName: 'OpenQASM',
  scopeName: 'source.openqasm',
  aliases: ['qasm', 'qasm2', 'qasm3', 'openqasm2', 'openqasm3'],
  patterns: [
    { include: '#comments' },
    { include: '#strings' },
    { include: '#annotations' },
    {
      match: `(?<![\\w$])(gate|def|defcal)\\s+([A-Za-z_][\\w]*)`,
      captures: {
        1: { name: 'keyword.other.openqasm' },
        2: { name: 'entity.name.function.openqasm' },
      },
    },
    { match: words(KEYWORDS), name: 'keyword.control.openqasm' },
    { match: words(OPERATIONS), name: 'keyword.operator.word.openqasm' },
    { match: words(TYPES), name: 'storage.type.openqasm' },
    { match: `${words(MODIFIERS)}(?=\\s*(?:\\(|@))`, name: 'storage.modifier.openqasm' },
    { match: words(CONSTANTS), name: 'constant.language.openqasm' },
    { match: words(GATES), name: 'support.function.gate.openqasm' },
    { match: '\\$\\d+', name: 'variable.other.constant.physical-qubit.openqasm' },
    {
      match: '(?<![\\w.])(?:\\d[\\d_]*\\.?[\\d_]*(?:[eE][+-]?\\d+)?|\\.\\d[\\d_]*(?:[eE][+-]?\\d+)?)(?:ns|us|µs|ms|s|dt|im)?(?![\\w.])',
      name: 'constant.numeric.openqasm',
    },
    { match: '0[xX][\\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+', name: 'constant.numeric.openqasm' },
    { match: '->|=>|@|\\+\\+|[-+*/%^&|!~<>=]=?', name: 'keyword.operator.openqasm' },
    { match: '[;,]', name: 'punctuation.separator.openqasm' },
    { match: '[()\\[\\]{}]', name: 'punctuation.section.openqasm' },
  ],
  repository: {
    comments: {
      patterns: [
        { match: '//.*$', name: 'comment.line.double-slash.openqasm' },
        { begin: '/\\*', end: '\\*/', name: 'comment.block.openqasm' },
      ],
    },
    strings: {
      patterns: [
        { begin: '"', end: '"', name: 'string.quoted.double.openqasm' },
        { begin: "'", end: "'", name: 'string.quoted.single.openqasm' },
      ],
    },
    annotations: {
      patterns: [
        { match: '#pragma\\b.*$', name: 'keyword.other.directive.pragma.openqasm' },
        { match: '^\\s*@[A-Za-z_][\\w.]*', name: 'storage.type.annotation.openqasm' },
      ],
    },
  },
};

export default openqasm;
