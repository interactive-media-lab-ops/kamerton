// КАМЕРТОН · формат блоку Глибинного шару (розділ 8 спеки deep_layer).
//
// Окремий модуль БЕЗ залежностей навмисно: цей самий рендер потрібен і
// валідатору (schema.js, тягне zod), і продукту (selectors.js, у бандл zod не
// пускають). Друга копія формату розійшлась би з першою мовчки, як уже
// розійшлись три форми method_notes.

/** Ліміти розділу 8. Міряються на рендері, а не логічно. */
export const DEPTH_BLOCK_MAX_LINES = 8;
export const DEPTH_LINE_MAX_CHARS = 120;

/**
 * Блок у звіті за розділом 8. Формат живе в одному місці: і ліміти, і підписи.
 *
 * Примітки аналітика у звіт не потрапляють (розділ 8): вони роздували рядок до
 * трьох екранних, і ліміт переставав щось означати. Ілюстрація для узгодження
 * вмикає їх явно, бо на зустрічі обговорюється саме міркування.
 */
export function depthBlock(markup, dictionaries, caseTitle, opts = {}) {
  const notes = Boolean(opts.notes);
  const label = (list, id) => (list || []).find((x) => x.id === id)?.label || id;
  const note = (t) => (notes && t ? ` · ${t}` : '');
  const lines = [];
  const cutLine = (title, lens) => `${title}: лінза зрізана · ${lens.reason}${note(lens.note)}`;

  // Відхилення від букви розділу 8: підпис першого рядка залежить від предмета.
  // Шаблон спеки писався, коли предметом був тільки кейс; назвати тему кейсом
  // означало б збрехати рівно в тому рядку, який відповідає «про що це».
  lines.push(`${markup.topic_id ? 'ТЕМА' : 'КЕЙС'}: ${caseTitle || markup.case_id || markup.topic_id}`);

  const plot = markup.plot || {};
  if (plot.cut) {
    lines.push(cutLine('СЮЖЕТ', plot));
  } else {
    const second = plot.secondary
      ? ` · ризик-сценарій: ${label(dictionaries?.plots, plot.secondary.id)}${note(plot.secondary.note)}`
      : '';
    lines.push(`СЮЖЕТ: ${label(dictionaries?.plots, plot.primary?.id)}${note(plot.primary?.note)}${second}`);
  }

  const roles = markup.roles || {};
  if (roles.cut) {
    lines.push(cutLine('РОЛІ', roles));
  } else if ((roles.items || []).length) {
    lines.push('РОЛІ: ' + roles.items
      .map((r) => `${label(dictionaries?.roles, r.role_id)} · ${r.who}`).join('; '));
  }

  const types = markup.psychotypes || {};
  if (types.cut) {
    lines.push(cutLine('ПСИХОТИПИ', types));
  } else if ((types.items || []).length) {
    lines.push('ПСИХОТИПИ: ' + types.items
      .map((p) => label(dictionaries?.psychotypes, p.id) +
        (typeof p.share === 'number' ? ` ${Math.round(p.share * 100)}%` : ''))
      .join(', '));
  }

  (markup.how_to_speak || []).forEach((h) => {
    const to = h.psychotype_id ? `[${label(dictionaries?.psychotypes, h.psychotype_id)}] ` : '';
    lines.push(`ЯК ГОВОРИТИ: ${to}${h.text}`);
  });
  (markup.what_to_avoid || []).forEach((a) => lines.push(`ЧОГО УНИКАТИ: ${a}`));
  return lines;
}

/**
 * Кейс із трьома зрізаними лінзами у звіт не йде (розділ 5), але лишається в
 * реєстрі як зафіксоване спостереження «поле промовчало». Мовчання поля це теж
 * результат вимірювання, і викидати його означало б втрачати дані.
 */
export function depthAllLensesCut(markup) {
  return Boolean(markup?.plot?.cut && markup?.roles?.cut && markup?.psychotypes?.cut);
}

/** Чи йде розмітка у звіт. Тільки validated і тільки з хоча б однією лінзою. */
export function depthGoesToReport(markup) {
  return markup?.status === 'validated' && !depthAllLensesCut(markup);
}

