import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import suggestionPopup from './suggestionPopup';
import slashItems, { type SlashItem } from './slashItems';
import fuzzyScore from '../../../lib/fuzzyScore';

// Typing / at the start of a line, or after a space, lists blocks to add.
const SlashCommands = Extension.create<{ pick: (kind: 'image' | 'file') => void }>({
  name: 'slashCommands',

  addOptions() {
    return { pick: () => {} };
  },

  addProseMirrorPlugins() {
    const items = slashItems(this.options.pick);
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommands'),
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => (query ? items.map((i) => ({ i, s: fuzzyScore(`${i.label} ${i.keywords}`, query) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.i) : items),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: suggestionPopup('Blocks', 'No block by that name') as any,
      }),
    ];
  },
});

export default SlashCommands;
