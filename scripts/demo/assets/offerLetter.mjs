// Writes the offer letter as a Word file with the web app's own Word export, the one behind a
// doc's download. That code is TypeScript, so this runs in a Node of its own with the loader the
// tests use; makeAssets starts it.
//
//   node --experimental-strip-types --import ./scripts/test/registerTs.mjs scripts/demo/assets/offerLetter.mjs <file.docx>
import fs from 'node:fs';

const LETTER = `Dear Priya,

We would like to offer you the role of senior mobile engineer at Atlas Labs. You would work on the Atlas wallet with Cleo, Ben and Dev, and report to me.

## The role

- Start date: Monday 4 January
- Remote, with the team together in Lisbon three times a year
- On call one week in six, with a day off after each week

## Pay and benefits

| What | Terms |
| --- | --- |
| Salary | €96,000 a year, reviewed every January |
| Equity | 0.25%, vesting over four years with a one-year cliff |
| Holiday | 30 days, plus public holidays where you live |
| Equipment | A laptop and the test phones you need |

## Next steps

If you are happy with this, reply by Friday 6 November and we will send the contract to sign. Questions about any of it are welcome, on a call or by email.

We all enjoyed the system design conversation, and hope you say yes.

Ada Okafor
Product lead, Atlas Labs
`;

const lib = new URL('../../../client/src/lib/docConvert/', import.meta.url);
const { default: importMarkdown } = await import(new URL('importMarkdown.ts', lib).href);
const { default: exportDocx } = await import(new URL('exportDocx.ts', lib).href);
const options = {
  readImage: async () => {
    throw new Error('The letter has no pictures');
  },
  people: () => '',
};
const blob = await exportDocx({ title: 'Offer letter: senior mobile engineer', content: importMarkdown(LETTER) }, options);
fs.writeFileSync(process.argv[2], Buffer.from(await blob.arrayBuffer()));
