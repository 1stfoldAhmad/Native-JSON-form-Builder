/**
 * Declarative input masking helper.
 * Tokens:
 * - `#` or `9` -> ASCII digit [0-9]
 * - `A` -> ASCII letter [A-Za-z]
 * - `*` -> Alphanumeric [A-Za-z0-9]
 * Any other character is treated as a literal separator (e.g. `-`, ` `, `(`, `)`, `/`, `+`).
 */

function isTokenChar(token: string): boolean {
  return token === '#' || token === '9' || token === 'A' || token === '*';
}

function matchesToken(char: string, token: string): boolean {
  if (token === '#' || token === '9') return /\d/.test(char);
  if (token === 'A') return /[A-Za-z]/.test(char);
  if (token === '*') return /[A-Za-z0-9]/.test(char);
  return char === token;
}

export function applyMask(rawInput: string, mask: string | undefined): string {
  if (!mask || !rawInput) return rawInput;

  let output = '';
  let inputIdx = 0;

  for (let maskIdx = 0; maskIdx < mask.length && inputIdx < rawInput.length; maskIdx++) {
    const maskChar = mask[maskIdx];
    const inputChar = rawInput[inputIdx];

    if (isTokenChar(maskChar)) {
      // Advance input until a matching character is found or input ends
      while (inputIdx < rawInput.length && !matchesToken(rawInput[inputIdx], maskChar)) {
        inputIdx++;
      }
      if (inputIdx < rawInput.length) {
        output += rawInput[inputIdx];
        inputIdx++;
      }
    } else {
      output += maskChar;
      if (inputChar === maskChar) {
        inputIdx++;
      }
    }
  }

  return output;
}

export function stripMask(maskedValue: string, mask: string | undefined): string {
  if (!mask || !maskedValue) return maskedValue;

  let raw = '';
  let maskIdx = 0;

  for (let i = 0; i < maskedValue.length; i++) {
    const ch = maskedValue[i];
    if (maskIdx < mask.length) {
      const token = mask[maskIdx];
      if (isTokenChar(token)) {
        if (matchesToken(ch, token)) {
          raw += ch;
          maskIdx++;
        }
      } else if (ch === token) {
        maskIdx++;
      }
    }
  }

  return raw;
}

export const MASK_PRESETS: Record<string, string> = {
  cnic: '#####-#######-#',
  pkPhone: '03##-#######',
  creditCard: '#### #### #### ####',
  expiry: '##/##',
  usPhone: '(###) ###-####',
};
