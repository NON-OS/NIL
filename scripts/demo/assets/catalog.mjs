import appIcons from './appIcons.mjs';
import brandGuidelines from './brandGuidelines.mjs';
import hero from './hero.mjs';
import nda from './nda.mjs';
import onboarding from './onboarding.mjs';
import palette from './palette.mjs';
import venue from './venue.mjs';
import venueProposal from './venueProposal.mjs';
import walkthrough from './walkthrough.mjs';

const CSV = `country,testers
Portugal,82
Germany,74
Brazil,61
United Kingdom,58
Spain,47
India,46
Nigeria,44
`;

// Every file the seed uploads into Files, and how each is made. Images are screenshots of a
// small HTML scene at `size` CSS pixels and `scale` device pixels each.
export default [
  { file: 'Homepage hero v3.png', image: hero, size: [1200, 675], scale: 2 },
  { file: 'Palette 2.0.png', image: palette, size: [800, 450], scale: 2 },
  ...onboarding.map(({ file, html }) => ({ file, image: html, size: [390, 844], scale: 3 })),
  ...appIcons.map(({ file, html }) => ({ file, image: html, size: [512, 512], scale: 2, clear: true })),
  { file: 'Venue - Palácio courtyard.jpg', image: venue, size: [1000, 667], scale: 2 },
  { file: 'Atlas 2.0 brand guidelines.pdf', pdf: brandGuidelines },
  { file: 'Mutual NDA - Helix Labs (signed).pdf', pdf: nda },
  { file: 'Venue proposal - Lisbon.pdf', pdf: venueProposal },
  { file: 'Beta testers by country.csv', text: CSV },
  { file: 'Offer letter - senior mobile engineer.docx', word: true },
  { file: 'Walkthrough draft.webm', video: walkthrough, ms: 5500 },
];
