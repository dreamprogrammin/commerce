// utils/slugify.ts
export function slugify(text: string): string {
  // Мапа для транслитерации кириллицы (русский + казахский)
  const cyrillicMap: Record<string, string> = {
    // Русский алфавит
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'h',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'sch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
    // Казахские буквы
    ә: 'a',
    ғ: 'g',
    қ: 'q',
    ң: 'n',
    ө: 'o',
    ұ: 'u',
    ү: 'u',
    һ: 'h',
    і: 'i',
  }

  // Латинские символы со спецзнаками
  const latinSpecial
    = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;'
  const latinNormal
    = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------'
  const latinPattern = new RegExp(latinSpecial.split('').join('|'), 'g')

  return text
    .toString()
    .toLowerCase()
    // Транслитерация кириллицы
    .split('')
    .map(char => cyrillicMap[char] || char)
    .join('')
    .replace(/\s+/g, '-') // Заменяем пробелы на -
    .replace(latinPattern, c => latinNormal.charAt(latinSpecial.indexOf(c))) // Заменяем спец. символы
    .replace(/&/g, '-and-') // Заменяем & на 'and'
    .replace(/[^\w\-]+/g, '') // Удаляем все остальные символы
    .replace(/-{2,}/g, '-') // Заменяем несколько - на один -
    .replace(/^-+/, '') // Убираем - в начале
    .replace(/-+$/, '') // Убираем - в конце
}
