import landmarks from '../../lib/landmarks';

// The first thing Tab reaches on every page: it jumps past the sidebar to the page itself.
export default function SkipLink() {
  return (
    <a
      className="skip-link"
      href={`#${landmarks.content}`}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(landmarks.content)?.focus();
      }}
    >
      Skip to content
    </a>
  );
}
