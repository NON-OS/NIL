import { ReactRenderer } from '@tiptap/react';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import SuggestionList, { type SuggestionItem, type SuggestionListHandle } from './SuggestionList';

// Shows a suggestion list next to the text being typed and keeps it there as the text moves.
export default function suggestionPopup(label: string, empty: string) {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, any> | null = null;

    const place = (props: SuggestionProps<SuggestionItem>) => {
      const rect = props.clientRect?.();
      const el = renderer?.element as HTMLElement | undefined;
      if (!rect || !el) return;
      void computePosition({ getBoundingClientRect: () => rect }, el, { placement: 'bottom-start', strategy: 'fixed', middleware: [offset(6), flip(), shift({ padding: 8 })] }).then(({ x, y }) => {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      });
    };

    return {
      onStart(props: SuggestionProps<SuggestionItem>) {
        renderer = new ReactRenderer(SuggestionList, { editor: props.editor, props: { ...props, label, empty } });
        const el = renderer.element as HTMLElement;
        el.classList.add('doc-suggest-host');
        document.body.append(el);
        place(props);
      },
      onUpdate(props: SuggestionProps<SuggestionItem>) {
        renderer?.updateProps({ ...props, label, empty });
        place(props);
      },
      onKeyDown({ event }: SuggestionKeyDownProps) {
        if (event.key === 'Escape') {
          renderer?.destroy();
          renderer?.element.remove();
          renderer = null;
          return true;
        }
        return renderer?.ref?.onKeyDown(event) ?? false;
      },
      onExit() {
        renderer?.destroy();
        renderer?.element.remove();
        renderer = null;
      },
    };
  };
}
