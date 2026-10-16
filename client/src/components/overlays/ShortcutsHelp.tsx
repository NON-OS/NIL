import Modal from '../ui/Modal';
import ui from '../../actions/ui';
import router from '../../lib/router';

const GROUPS = [
  {
    title: 'Anywhere',
    keys: [
      ['C', 'New task'],
      ['⌘ K', 'Search and commands'],
      ['/', 'Search'],
      ['?', 'This help'],
      ['Esc', 'Close panels'],
    ],
  },
  {
    title: 'Jump to',
    keys: [
      ['G H', 'My work'],
      ['G I', 'Inbox'],
      ['G B', 'Board'],
      ['G L', 'All tasks'],
      ['G C', 'Calendar'],
      ['G G', 'Goals'],
      ['G S', 'Insights'],
      ['G D', 'Docs'],
      ['G M', 'Time'],
      ['G N', 'Bounties'],
      ['G V', 'Votes'],
      ['G P', 'Proof of work'],
      ['G T', 'Settings'],
    ],
  },
  {
    title: 'Lists',
    keys: [
      ['X', 'Select the focused task'],
      ['Shift click', 'Select a range'],
      ['Enter', 'Open the focused task'],
    ],
  },
  {
    title: 'Writing',
    keys: [
      ['⌘ Enter', 'Send comment / save description'],
      ['@', 'Mention a teammate'],
    ],
  },
];

export default function ShortcutsHelp() {
  return (
    <Modal
      title="Keyboard shortcuts"
      onClose={() => ui.shortcuts(false)}
      width={620}
      footer={
        <a
          className="btn btn-ghost btn-sm"
          href="/help/keyboard-shortcuts"
          onClick={(e) => {
            ui.shortcuts(false);
            router.link('/help/keyboard-shortcuts')(e);
          }}
        >
          More in Help
        </a>
      }
    >
      <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="eyebrow" style={{ marginBottom: 8 }}>
              {g.title}
            </h3>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', margin: 0 }}>
              {g.keys.map(([k, label]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ display: 'flex', gap: 4 }}>
                    {k.split(' ').map((part) => (
                      <span key={part} className="kbd">
                        {part}
                      </span>
                    ))}
                  </dt>
                  <dd style={{ margin: 0, color: 'var(--ink-2)' }}>{label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
