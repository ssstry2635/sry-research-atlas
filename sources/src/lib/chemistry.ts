const subscript: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '(': '₍', ')': '₎' };
const superscript: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾' };
const subscriptReverse = Object.fromEntries(Object.entries(subscript).map(([key, value]) => [value, key]));
const superscriptReverse = Object.fromEntries(Object.entries(superscript).map(([key, value]) => [value, key]));

export const commonElements = ['Cs', 'Pb', 'Br', 'I', 'Cl', 'Ag', 'Bi', 'FA', 'MA', 'Sn', 'Ge', 'Na', 'K', 'Rb', 'Sr', 'Ba', 'Zn', 'Cd', 'S', 'O'];

const elementNames: Record<string, string> = {
  氢: 'H', 氦: 'He', 锂: 'Li', 铍: 'Be', 硼: 'B', 碳: 'C', 氮: 'N', 氧: 'O', 氟: 'F', 氖: 'Ne',
  钠: 'Na', 镁: 'Mg', 铝: 'Al', 硅: 'Si', 磷: 'P', 硫: 'S', 氯: 'Cl', 氩: 'Ar', 钾: 'K', 钙: 'Ca',
  钪: 'Sc', 钛: 'Ti', 钒: 'V', 铬: 'Cr', 锰: 'Mn', 铁: 'Fe', 钴: 'Co', 镍: 'Ni', 铜: 'Cu', 锌: 'Zn',
  镓: 'Ga', 锗: 'Ge', 砷: 'As', 硒: 'Se', 溴: 'Br', 氪: 'Kr', 铷: 'Rb', 锶: 'Sr', 钇: 'Y', 锆: 'Zr',
  铌: 'Nb', 钼: 'Mo', 锝: 'Tc', 钌: 'Ru', 铑: 'Rh', 钯: 'Pd', 银: 'Ag', 镉: 'Cd', 铟: 'In', 锡: 'Sn',
  锑: 'Sb', 碲: 'Te', 碘: 'I', 氙: 'Xe', 铯: 'Cs', 钡: 'Ba', 镧: 'La', 铈: 'Ce', 镨: 'Pr', 钕: 'Nd',
  钐: 'Sm', 铕: 'Eu', 钆: 'Gd', 铽: 'Tb', 镝: 'Dy', 钬: 'Ho', 铒: 'Er', 铥: 'Tm', 镱: 'Yb', 镥: 'Lu',
  铪: 'Hf', 钽: 'Ta', 钨: 'W', 铼: 'Re', 锇: 'Os', 铱: 'Ir', 铂: 'Pt', 金: 'Au', 汞: 'Hg', 铊: 'Tl',
  铅: 'Pb', 铋: 'Bi', 甲脒: 'FA', 甲胺: 'MA', 铵: 'NH4',
};

const elementSymbols = ['He', 'Li', 'Be', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'Cl', 'Ar', 'Ca', 'Sc', 'Ti', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'H', 'B', 'C', 'N', 'O', 'F', 'P', 'S', 'K', 'V', 'Y', 'I', 'W'];
const symbolByLowercase = new Map(elementSymbols.map((symbol) => [symbol.toLowerCase(), symbol]));
const spokenAliases: Record<string, string> = {
  水: 'H2O', 水分子: 'H2O', 二氧化碳: 'CO2', 一氧化碳: 'CO', 二氧化钛: 'TiO2', 氧化锌: 'ZnO',
  溴化铅铯: 'CsPbBr3', 碘化铅铯: 'CsPbI3', 氯化铅铯: 'CsPbCl3',
  cspbbrthree: 'CsPbBr3', cspbithree: 'CsPbI3', cspbclthree: 'CsPbCl3',
};

function asciiDigits(input: string) {
  return input.replace(/[₀-₉₊₋₍₎]/g, (char) => subscriptReverse[char] || char).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]/g, (char) => superscriptReverse[char] || char);
}

function replaceSpokenNumbers(input: string) {
  let value = input.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 65296)).replace(/[，。；、]/g, ' ');
  const englishNumbers: Record<string, string> = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', point: '.', dot: '.' };
  Object.entries(englishNumbers).forEach(([word, digit]) => { value = value.replace(new RegExp(`\\b${word}\\b`, 'gi'), digit); });
  return value.replace(/零|〇/g, '0').replace(/一/g, '1').replace(/二|两/g, '2').replace(/三/g, '3').replace(/四/g, '4').replace(/五/g, '5').replace(/六/g, '6').replace(/七/g, '7').replace(/八/g, '8').replace(/九/g, '9').replace(/点/g, '.').replace(/十/g, '10');
}

function formulaCandidate(input: string) {
  const compact = input.replace(/\s+/g, '');
  if (!compact || !/[A-Z]/.test(compact)) return false;
  return /^(?:\d+)?(?:[A-Z][a-z]?\d*(?:\.\d+)?|\d+(?:\.\d+)?|[()[\]]|·|\.|\^?\d*[+-])+$/.test(compact);
}

export function formatChemicalFormula(input: string): string {
  const trimmed = asciiDigits(input.trim()).replace(/\s+/g, '');
  if (!formulaCandidate(trimmed)) return input.trim();
  let value = trimmed.replace(/\*/g, '·');
  value = value.replace(/\^?(\d+)([+-])$/, '^$1$2').replace(/\^([+-])$/, '^$1');
  value = value.replace(/\d+(?:\.\d+)?/g, (digits, offset: number) => {
    const before = value.slice(0, offset);
    if (offset === 0 && /^\d+(?:\.\d+)?[A-Z]/.test(value)) return digits;
    if (before.endsWith('^') || before.endsWith('·')) return digits;
    return [...digits].map((char) => subscript[char] || char).join('');
  });
  value = value.replace(/\^(\d*[+-])/, (_, charge: string) => [...charge].map((char) => superscript[char] || char).join(''));
  return value;
}

export function formulaToSearchQuery(input: string) {
  return asciiDigits(input).replace(/\^/g, '').replace(/·/g, '.').trim();
}

function normalizeElementCase(input: string) {
  let output = '';
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (!/[A-Za-z]/.test(char)) { output += char; index += 1; continue; }
    if (input.startsWith('FA', index) || input.startsWith('MA', index)) { output += input.slice(index, index + 2); index += 2; continue; }
    const pair = input.slice(index, index + 2);
    const symbol = symbolByLowercase.get(pair.toLowerCase()) || symbolByLowercase.get(char.toLowerCase());
    if (!symbol) return input;
    output += symbol;
    index += symbol.length === 2 && pair.toLowerCase() === symbol.toLowerCase() ? 2 : 1;
  }
  return output;
}

export interface ChemicalSpeechResult {
  transcript: string;
  formatted: string;
  query: string;
  confident: boolean;
}

export function recognizeChemicalSpeech(transcript: string): ChemicalSpeechResult {
  const original = transcript.trim();
  if (formulaCandidate(original.replace(/\s+/g, '')) && !/\s/.test(original)) {
    const formatted = formatChemicalFormula(original);
    return { transcript: original, formatted, query: formulaToSearchQuery(formatted), confident: true };
  }
  const compactAlias = original.toLowerCase().replace(/[\s\-_]/g, '');
  const alias = spokenAliases[compactAlias] || spokenAliases[original.replace(/\s/g, '')];
  if (alias) {
    const formatted = formatChemicalFormula(alias);
    return { transcript: original, formatted, query: formulaToSearchQuery(formatted), confident: true };
  }
  let value = replaceSpokenNumbers(original).trim();
  const names = Object.keys(elementNames).sort((a, b) => b.length - a.length);
  names.forEach((name) => { value = value.replaceAll(name, elementNames[name]); });
  const compact = value.replace(/\s+/g, '');
  if (/^[\u4e00-\u9fff]/.test(compact) || /[\u4e00-\u9fff]/.test(compact)) {
    return { transcript: original, formatted: original, query: original, confident: false };
  }
  const normalized = normalizeElementCase(compact);
  const formatted = formatChemicalFormula(normalized);
  const confident = formulaCandidate(normalized) && /[A-Z][a-z]?/.test(normalized) && !/\s/.test(original) && /\d/.test(normalized);
  return { transcript: original, formatted, query: confident ? formulaToSearchQuery(formatted) : original, confident };
}

export function convertSelection(input: string, start: number, end: number, mode: 'subscript' | 'superscript') {
  const selected = asciiDigits(input.slice(start, end));
  const table = mode === 'subscript' ? subscript : superscript;
  const converted = [...selected].map((char) => table[char] || char).join('');
  return input.slice(0, start) + converted + input.slice(end);
}
