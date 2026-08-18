const BAQALA_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="118" fill="#F3F5F2"/>
  <rect x="40" y="40" width="432" height="432" rx="104" fill="#1E6B48"/>
  <path d="M118 214h276v168c0 22-18 40-40 40H158c-22 0-40-18-40-40V214Z" fill="#FFFFFF"/>
  <path d="M96 176c0-16 13-28 28-28h264c15 0 28 12 28 28v46H96v-46Z" fill="#C4A35A"/>
  <rect x="236" y="268" width="40" height="114" rx="10" fill="#1E6B48"/>
  <rect x="148" y="248" width="72" height="56" rx="10" fill="#E7EEE9"/>
  <rect x="292" y="248" width="72" height="56" rx="10" fill="#E7EEE9"/>
  <path d="M352 132c-46 22-72 70-64 118" fill="none" stroke="#F3F5F2" stroke-width="20" stroke-linecap="round"/>
  <path d="M328 148c28 18 48 48 54 84" fill="none" stroke="#C4A35A" stroke-width="14" stroke-linecap="round"/>
</svg>
`.trim();

export const APP_LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BAQALA_LOGO_SVG)}`;
