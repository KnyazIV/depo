import { randomInt } from "node:crypto";

/**
 * Код заявки для клиента.
 *
 * Алфавит без похожих друг на друга знаков: человек диктует такой код по
 * телефону и не путает ноль с буквой O. Восемь знаков — больше 200 миллиардов
 * комбинаций, подобрать чужую заявку перебором нереально.
 */
const ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";

export function generatePublicCode(length = 8): string {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

export function isPublicCode(value: string): boolean {
  return new RegExp(`^[${ALPHABET}]{6,12}$`).test(value);
}
