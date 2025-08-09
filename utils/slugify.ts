// utils/slugify.ts
export function slugify(text: string): string {
  const a
    = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;'
  const b
    = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------'
  const p = new RegExp(a.split('').join('|'), 'g')

  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Заменяем пробелы на -
    .replace(p, c => b.charAt(a.indexOf(c))) // Заменяем спец. символы
    .replace(/&/g, '-and-') // Заменяем & на 'and'
    .replace(/[^\w\-]+/g, '') // Удаляем все остальные символы
    .replace(/-{2,}/g, '-') // Заменяем несколько - на один -
    .replace(/^-+/, '') // Убираем - в начале
    .replace(/-+$/, '') // Убираем - в конце
}
