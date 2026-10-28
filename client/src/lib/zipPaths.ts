import stripBidi from './stripBidi';
import type FolderItem from '../types/FolderItem';

export interface ZipEntry {
  path: string;
  // null for an empty folder
  item: FolderItem | null;
}

const LONGEST = 180;

// A name that unpacks safely anywhere: no slashes or characters Windows refuses, no control or
// direction characters, no "." or ".." and no trailing dots or spaces. Names come from teammates,
// so one can't reach outside the folder it's unpacked into.
function safe(name: string) {
  const plain = stripBidi(name)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, LONGEST);
  return plain && plain !== '.' && plain !== '..' ? plain : 'Untitled';
}

// "name (2).ext" for the second of a name in the same folder, ignoring case as Windows and macOS do.
function unique(name: string, taken: Set<string>) {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let out = name;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${stem} (${n})${ext}`;
  taken.add(out.toLowerCase());
  return out;
}

// What goes in a zip of `picked`: each file under its own name, each folder with everything in
// it, empty folders kept, as paths inside the archive. Locked files and folders, which can't be
// opened, are left out and counted.
export default function zipPaths(picked: FolderItem[], all: FolderItem[]) {
  const entries: ZipEntry[] = [];
  const names = new Map<string, Set<string>>();
  let locked = 0;
  const place = (dir: string, item: FolderItem) => {
    if (!names.has(dir)) names.set(dir, new Set());
    return `${dir}${unique(safe(item.name), names.get(dir)!)}`;
  };
  const walk = (item: FolderItem, dir: string) => {
    if (item.locked) {
      locked++;
      return;
    }
    const path = place(dir, item);
    if (item.kind === 'file') {
      entries.push({ path, item });
      return;
    }
    const inside = all.filter((i) => i.parentId === item.id);
    if (!inside.length) entries.push({ path: `${path}/`, item: null });
    for (const child of inside) walk(child, `${path}/`);
  };
  for (const item of picked) walk(item, '');
  return { entries, locked, bytes: entries.reduce((n, e) => n + (e.item?.size ?? 0), 0) };
}
