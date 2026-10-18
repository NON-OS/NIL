// Media queries that change what a component renders, not just how it looks. The CSS for
// those components repeats the same breakpoints.
const media = {
  phone: '(max-width: 599px)',
  // where icon-only buttons can't lean on hover tooltips: phones and any touch screen
  touchOrNarrow: '(max-width: 599px), (pointer: coarse)',
  // where the sidebar folds away behind the menu button
  sidebarFolds: '(max-width: 900px)',
};

export default media;
