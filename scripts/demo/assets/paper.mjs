import c from './colours.mjs';
import sheet from './sheet.mjs';

// An A4 document for page.pdf(): plain type, a letterhead, and any extra styles it needs.
export default function paper(body, css = '') {
  return sheet(
    `@page{size:A4;margin:22mm 20mm}
     body{color:${c.ink};font-size:11pt;line-height:1.5}
     header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #D8DBE0;padding-bottom:10px;margin-bottom:22px;font-size:9pt;color:${c.muted}}
     header b{color:${c.ink};font-size:12pt;letter-spacing:.3px}
     h1{font-size:22pt;letter-spacing:-.4px;margin:0 0 6px}
     h2{font-size:13pt;margin:22px 0 6px}
     table{border-collapse:collapse;width:100%;margin:10px 0}
     td,th{border-bottom:1px solid #E3E5E9;padding:7px 4px;text-align:left;vertical-align:top}
     th{font-size:9pt;color:${c.muted};text-transform:uppercase;letter-spacing:.6px}
     .muted{color:${c.muted}}
     .page{break-after:page}
     ${css}`,
    body,
  );
}
