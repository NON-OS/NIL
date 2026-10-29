// A whole HTML page around a scene, with the system sans-serif so nothing is fetched.
export default function sheet(css, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    html,body{margin:0;height:100%}
    body{font-family:system-ui,'DejaVu Sans','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased}
    ${css}
  </style></head><body>${body}</body></html>`;
}
