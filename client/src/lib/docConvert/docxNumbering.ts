import type * as Docx from 'docx';

const BULLETS = ['•', '◦', '▪'];
const LEVELS = 9;

// Word's list definitions for a doc. Bullets share one, and so do task lists, whose items carry
// their own ☐ or ☑; every ordered list gets one of its own, so it counts from its own start.
export default function docxNumbering(d: typeof Docx) {
  const levels = (format: Docx.ILevelsOptions['format'], text: (level: number) => string, start = 1): Docx.ILevelsOptions[] =>
    Array.from({ length: LEVELS }, (_, level) => ({ level, format, text: text(level), start, alignment: d.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } }));
  const formats: Record<string, Docx.ILevelsOptions['format']> = { a: d.LevelFormat.LOWER_LETTER, A: d.LevelFormat.UPPER_LETTER, i: d.LevelFormat.LOWER_ROMAN, I: d.LevelFormat.UPPER_ROMAN };
  const config: { reference: string; levels: Docx.ILevelsOptions[] }[] = [
    { reference: 'bullets', levels: levels(d.LevelFormat.BULLET, (level) => BULLETS[level % BULLETS.length]) },
    { reference: 'tasks', levels: levels(d.LevelFormat.BULLET, () => '') },
  ];
  return {
    config,
    ordered(start: unknown, type: unknown) {
      const reference = `ordered-${config.length}`;
      const from = Number.isInteger(start) && (start as number) >= 0 ? (start as number) : 1;
      config.push({ reference, levels: levels(formats[String(type)] ?? d.LevelFormat.DECIMAL, (level) => `%${level + 1}.`, from) });
      return reference;
    },
  };
}
