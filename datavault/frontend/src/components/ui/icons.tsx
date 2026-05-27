// Iconos de línea (stroke) finos, estilo Linear/Lucide. Tamaño por defecto 16,
// heredan `currentColor`. Uso: <IcSearch />, <IcSearch size={14} />.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export const IcSearch = (p: IconProps) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
export const IcBuilding = (p: IconProps) => (
  <svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h6" /></svg>
);
export const IcLink = (p: IconProps) => (
  <svg {...base(p)}><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></svg>
);
export const IcUser = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
);
export const IcGrid = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
);
export const IcTable = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 10h18M9 4v16" /></svg>
);
export const IcLock = (p: IconProps) => (
  <svg {...base(p)}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
);
export const IcArrowRight = (p: IconProps) => (
  <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const IcUsers = (p: IconProps) => (
  <svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M21 20c0-2.6-1.6-4.8-4-5.6" /></svg>
);
export const IcShield = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></svg>
);
export const IcBridge = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 9v8M21 9v8M3 13c3-4 15-4 18 0M7 14v3M17 14v3M12 12v5" /></svg>
);
export const IcFunction = (p: IconProps) => (
  <svg {...base(p)}><path d="M15 5c-2 0-3 1-3 4v2c0 3-1 5-4 5M9 9h7" /></svg>
);
export const IcInbox = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 13l2.5-7h11L20 13" /><path d="M4 13h5l1.5 3h3L14 13h6v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /></svg>
);
export const IcSettings = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.92 1.06V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-2.92-1.06l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);
export const IcPlus = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IcExternalLink = (p: IconProps) => (
  <svg {...base(p)}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
);
export const IcCrown = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 7l4 5 5-7 5 7 4-5v11H3z" /></svg>
);
export const IcTrash = (p: IconProps) => (
  <svg {...base(p)}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6M9 6V4h6v2" /></svg>
);
export const IcDownload = (p: IconProps) => (
  <svg {...base(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
);
export const IcFile = (p: IconProps) => (
  <svg {...base(p)}><path d="M14 3v5h5" /><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /></svg>
);
export const IcList = (p: IconProps) => (
  <svg {...base(p)}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
);
export const IcMail = (p: IconProps) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);
export const IcKey = (p: IconProps) => (
  <svg {...base(p)}><circle cx="8" cy="15" r="5" /><path d="m12.5 11.5 8.5-8.5M18 5l2 2M15 8l2 2" /></svg>
);
export const IcEye = (p: IconProps) => (
  <svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IcPalette = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-3.9-4-7.3-9-7.3z" /><circle cx="7.5" cy="11.5" r="1" /><circle cx="11.5" cy="7.5" r="1" /><circle cx="16" cy="10" r="1" /></svg>
);
export const IcBell = (p: IconProps) => (
  <svg {...base(p)}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
);
export const IcClock = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IcTag = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>
);
export const IcDollar = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 2v20M17 6.5C17 4.5 14.8 4 12 4S7 4.7 7 7s2.5 3 5 3.5 5 1 5 3.5-2.2 3-5 3-5-.5-5-2.5" /></svg>
);
export const IcPackage = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></svg>
);
export const IcBroom = (p: IconProps) => (
  <svg {...base(p)}><path d="M14 3 21 10M10 7l7 7M11 13l-5 5a3 3 0 0 1-3-3l5-5M5 21l1-3M9 21l1-3" /></svg>
);
export const IcSparkles = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
);
export const IcRecycle = (p: IconProps) => (
  <svg {...base(p)}><path d="M7 19h10M5 13l3-5 3 5M19 13l-3 5M9 8l3-5 3 5" /></svg>
);
export const IcUpload = (p: IconProps) => (
  <svg {...base(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 8 12 3 17 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
);
export const IcBarChart = (p: IconProps) => (
  <svg {...base(p)}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
);
export const IcEdit = (p: IconProps) => (
  <svg {...base(p)}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
);
export const IcCopy = (p: IconProps) => (
  <svg {...base(p)}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
export const IcMap = (p: IconProps) => (
  <svg {...base(p)}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></svg>
);
export const IcMegaphone = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M14 8a4 4 0 0 1 0 8" /></svg>
);
export const IcCheck = (p: IconProps) => (
  <svg {...base(p)}><polyline points="20 6 9 17 4 12" /></svg>
);
export const IcCreditCard = (p: IconProps) => (
  <svg {...base(p)}><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
);
export const IcBank = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 10l9-6 9 6" /><path d="M5 10v8M19 10v8M9 10v8M15 10v8M3 21h18" /></svg>
);
