import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onReload: () => void;
  onBack: () => void;
}

// Keeps a doc that trips the editor from taking the rest of the app with it: the list and the
// other screens carry on, and the doc can be opened again or left.
export default class DocErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="doc-editor docs-locked" role="alert" aria-label="Doc">
        <p>This doc ran into a problem showing what’s in it. Anything already saved is safe.</p>
        <div className="doc-error-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              this.setState({ failed: false });
              this.props.onReload();
            }}
          >
            Open it again
          </button>
          <button type="button" className="btn" onClick={this.props.onBack}>
            Back to docs
          </button>
        </div>
      </section>
    );
  }
}
