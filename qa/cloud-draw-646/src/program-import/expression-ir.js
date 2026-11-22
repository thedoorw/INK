const get = (value, path) => String(path).split('.').reduce((current, key) => current?.[key], value);
const has = (value, path) => get(value, path) !== undefined;
const hashSeed = value => {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
};

export class DeterministicRandom {
  constructor(seed = 1) { this.state = hashSeed(seed) || 1; this.calls = 0; }
  next() {
    let x = this.state >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0; this.calls += 1;
    return this.state / 4294967296;
  }
  bounded(min = 0, max = 1) { return Number(min) + this.next() * (Number(max) - Number(min)); }
  indexed(index, min = 0, max = 1) {
    const local = new DeterministicRandom(`${this.state}:${Number(index) || 0}`);
    return local.bounded(min, max);
  }
}

function tokenize(source) {
  const regex = /\s*(>=|<=|==|!=|&&|\|\||[()+\-*/%^?:,.<>!]|\d*\.\d+(?:e[-+]?\d+)?|\d+(?:\.\d*)?(?:e[-+]?\d+)?|[A-Za-z_$][\w$]*)\s*/giy;
  const output = []; let offset = 0;
  while (offset < source.length) {
    regex.lastIndex = offset; const match = regex.exec(source);
    if (!match) throw new Error(`INK_EXPRESSION_TOKEN:${source.slice(offset, offset + 16)}`);
    output.push(match[1]); offset = regex.lastIndex;
  }
  return output;
}

export function evaluateDeterministicExpression(source, scope = {}, options = {}) {
  if (typeof source !== 'string') return { value: source, log: [] };
  const tokens = tokenize(source), log = options.log || scope.expressionLog || [], random = options.random || new DeterministicRandom(options.seed ?? scope.seed ?? 1);
  const functions = {
    min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, round: Math.round,
    floor: Math.floor, ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    random: (min = 0, max = 1) => random.bounded(min, max),
    indexedRandom: (index, min = 0, max = 1) => random.indexed(index, min, max)
  };
  const aliases = { 'Math.min':'min','Math.max':'max','Math.abs':'abs','Math.sqrt':'sqrt','Math.round':'round','Math.floor':'floor','Math.ceil':'ceil','Math.sin':'sin','Math.cos':'cos','Math.tan':'tan','Math.random':'random' };
  let index = 0;
  const primary = () => {
    const token = tokens[index++];
    if (token === '(') { const value = ternary(); if (tokens[index++] !== ')') throw new Error('INK_EXPRESSION_PAREN'); return value; }
    if (['-','+','!'].includes(token)) { const value = primary(); return token === '-' ? -value : token === '+' ? +value : !value; }
    if (/^\d/.test(token || '') || token?.startsWith('.')) return Number(token);
    if (token === 'true') return true; if (token === 'false') return false; if (token === 'null') return null;
    if (!/^[A-Za-z_$]/.test(token || '')) throw new Error(`INK_EXPRESSION_VALUE:${token}`);
    let name = token;
    while (tokens[index] === '.' && /^[A-Za-z_$]/.test(tokens[index + 1] || '')) { index += 1; name += `.${tokens[index++]}`; }
    const normalized = aliases[name] || name;
    if (tokens[index] === '(') {
      index += 1; const args = [];
      if (tokens[index] !== ')') { while (true) { args.push(ternary()); if (tokens[index] === ',') { index += 1; continue; } break; } }
      if (tokens[index++] !== ')') throw new Error('INK_EXPRESSION_CALL_PAREN');
      if (!functions[normalized]) throw new Error(`INK_EXPRESSION_FUNCTION_DENIED:${name}`);
      const value = functions[normalized](...args); log.push({ expression: source, function: normalized, args, value }); return value;
    }
    if (normalized === 'pi' || name === 'Math.PI') return Math.PI;
    if (!has(scope, name)) throw new Error(`INK_EXPRESSION_UNKNOWN:${name}`);
    return get(scope, name);
  };
  const binary = (next, operations) => { let left = next(); while (operations.includes(tokens[index])) { const op = tokens[index++], right = next(); if (op === '*') left *= right; else if (op === '/') left /= right; else if (op === '%') left %= right; else if (op === '+') left += right; else if (op === '-') left -= right; else if (op === '^') left **= right; else if (op === '<') left = left < right; else if (op === '>') left = left > right; else if (op === '<=') left = left <= right; else if (op === '>=') left = left >= right; else if (op === '==') left = left === right; else if (op === '!=') left = left !== right; else if (op === '&&') left = Boolean(left && right); else if (op === '||') left = Boolean(left || right); } return left; };
  const power = () => binary(primary, ['^']), multiply = () => binary(power, ['*','/','%']), add = () => binary(multiply, ['+','-']), compare = () => binary(add, ['<','>','<=','>=']), equal = () => binary(compare, ['==','!=']), and = () => binary(equal, ['&&']), or = () => binary(and, ['||']);
  function ternary() { const condition = or(); if (tokens[index] === '?') { index += 1; const yes = ternary(); if (tokens[index++] !== ':') throw new Error('INK_EXPRESSION_TERNARY'); const no = ternary(); return condition ? yes : no; } return condition; }
  const value = ternary(); if (index !== tokens.length) throw new Error(`INK_EXPRESSION_TRAILING:${tokens.slice(index).join(' ')}`);
  log.push({ expression: source, value, seed: options.seed ?? scope.seed ?? 1, randomCalls: random.calls });
  return { value, log };
}
