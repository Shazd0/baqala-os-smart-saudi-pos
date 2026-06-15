const OASIS_DINE_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="96" y1="64" x2="416" y2="448" gradientUnits="userSpaceOnUse">
      <stop stop-color="#007AFF"/>
      <stop offset="1" stop-color="#34C759"/>
    </linearGradient>
    <linearGradient id="leaf" x1="175" y1="135" x2="341" y2="339" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#EAF4FF"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="#F2F2F7"/>
  <rect x="48" y="48" width="416" height="416" rx="96" fill="url(#bg)"/>
  <circle cx="256" cy="258" r="138" fill="rgba(255,255,255,0.14)"/>
  <path d="M337 142c-83 8-147 63-162 139-9 47 7 82 42 93 42 13 89-16 110-66 22-52 16-112 10-166Z" fill="url(#leaf)"/>
  <path d="M174 370c47-94 97-142 159-191" fill="none" stroke="#007AFF" stroke-width="22" stroke-linecap="round"/>
  <path d="M188 250c-18-29-48-51-82-61 1 68 40 116 94 125" fill="#FFFFFF" opacity=".92"/>
  <path d="M148 223c38 33 67 74 89 123" fill="none" stroke="#34C759" stroke-width="18" stroke-linecap="round" opacity=".95"/>
  <circle cx="340" cy="338" r="32" fill="#FFFFFF" opacity=".95"/>
</svg>
`.trim();

export const APP_LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(OASIS_DINE_LOGO_SVG)}`;
