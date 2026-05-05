const sharp = require("sharp");

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isPublicImageUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (err) {
    return false;
  }
}

function formatSaoPauloDate(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function defaultAvatarUrl(discriminator = 0) {
  return `https://cdn.discordapp.com/embed/avatars/${Number(discriminator || 0) % 5}.png`;
}

function buildWelcomeSvg({
  backgroundUrl,
  avatarUrl,
  title,
  username,
  message,
  dateText
}) {
  const safeBackground = isPublicImageUrl(backgroundUrl) ? backgroundUrl : "";
  const background = safeBackground
    ? `<image href="${escapeXml(safeBackground)}" x="0" y="0" width="1200" height="520" preserveAspectRatio="xMidYMid slice"/>`
    : `<linearGradient id="fallbackBg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#111827"/>
        <stop offset="45%" stop-color="#5865f2"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
      <rect width="1200" height="520" fill="url(#fallbackBg)"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520">
  <defs>
    <clipPath id="avatarClip">
      <circle cx="600" cy="145" r="86"/>
    </clipPath>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000" flood-opacity="0.42"/>
    </filter>
  </defs>
  ${background}
  <rect width="1200" height="520" fill="#000" opacity="0.52"/>
  <rect x="70" y="54" width="1060" height="412" rx="34" fill="#0b1220" opacity="0.58" filter="url(#shadow)"/>
  <circle cx="600" cy="145" r="94" fill="#fff" opacity="0.95"/>
  <image href="${escapeXml(avatarUrl)}" x="514" y="59" width="172" height="172" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>
  <text x="600" y="288" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="900" fill="#ffffff">${escapeXml(title)}</text>
  <text x="600" y="344" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#dbe4ff">@${escapeXml(username)}</text>
  <text x="600" y="398" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${escapeXml(message)}</text>
  <text x="1100" y="444" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="#cbd5e1">${escapeXml(dateText)}</text>
</svg>`;
}

async function createWelcomeImageBuffer(member, config) {
  const user = member.user;
  const avatarUrl = user.displayAvatarURL
    ? user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true })
    : defaultAvatarUrl(user.discriminator);

  const svg = buildWelcomeSvg({
    backgroundUrl: config.boasVindasBackgroundUrl,
    avatarUrl,
    title: config.boasVindasTitle || "BEM-VINDO(A)",
    username: user.username || member.displayName || "novo membro",
    message: config.boasVindasMessage || "Que você possa aproveitar ao máximo do nosso servidor!",
    dateText: formatSaoPauloDate()
  });

  return sharp(Buffer.from(svg, "utf8"), {
    density: 144
  })
    .png()
    .toBuffer();
}

module.exports = {
  createWelcomeImageBuffer,
  isPublicImageUrl
};
