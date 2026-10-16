import Spinner from '../ui/Spinner';

// Holds the place of the notes and checklist while they load: boards only carry the card.
export default function WordsLoading() {
  return (
    <section className="drawer-section" aria-busy="true">
      <div className="section-head">
        <h3>Description</h3>
      </div>
      <p className="placeholder-text words-loading">
        <Spinner size={13} /> Loading notes and checklist…
      </p>
    </section>
  );
}
