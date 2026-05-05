const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1200;
const HEIGHT = 520;

function isPublicImageUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (err) {
    return false;
  }
}

function defaultAvatarUrl(discriminator = 0) {
  return `https://cdn.discordapp.com/embed/avatars/${Number(discriminator || 0) % 5}.png`;
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

function safeText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fontWeight(value) {
  return value === "normal" ? "normal" : "bold";
}

async function loadImageFromUrl(url, label) {
  if (!isPublicImageUrl(url)) {
    throw new Error(`${label} sem URL publica valida.`);
  }

  console.log(`[Boas-vindas] URL do ${label}:`, url);

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 8000,
    headers: {
      "User-Agent": "ClanCidioBot/1.0"
    }
  });
  const contentType = response.headers["content-type"] || "";

  if (!contentType.startsWith("image/")) {
    throw new Error(`${label} retornou content-type invalido: ${contentType}`);
  }

  return loadImage(Buffer.from(response.data));
}

async function loadDiscordAvatar(user) {
  const avatarUrl = user.displayAvatarURL
    ? user.displayAvatarURL({ extension: "png", size: 256 })
    : defaultAvatarUrl(user.discriminator);

  try {
    return await loadImageFromUrl(avatarUrl, "avatar");
  } catch (err) {
    console.warn("[Boas-vindas] erro ao carregar avatar:", {
      url: avatarUrl,
      erro: err.message
    });
  }

  const fallbackUrl = defaultAvatarUrl(user.discriminator);

  try {
    return await loadImageFromUrl(fallbackUrl, "avatar padrao");
  } catch (err) {
    console.warn("[Boas-vindas] erro ao carregar avatar padrao:", {
      url: fallbackUrl,
      erro: err.message
    });
    throw err;
  }
}

async function loadBackground(backgroundUrl) {
  if (!backgroundUrl) return null;

  try {
    console.log("[Boas-vindas] URL do fundo:", backgroundUrl);
    return await loadImageFromUrl(backgroundUrl, "fundo");
  } catch (err) {
    console.warn("[Boas-vindas] erro ao carregar fundo:", {
      url: backgroundUrl,
      erro: err.message
    });
    return null;
  }
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawFallbackBackground(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(0.45, "#5865f2");
  gradient.addColorStop(1, "#0f172a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function fitText(ctx, text, maxWidth, startSize, minSize, weight = "bold") {
  let size = startSize;

  while (size > minSize) {
    ctx.font = `${fontWeight(weight)} ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }

  return size;
}

function drawCenteredText(ctx, text, y, maxWidth, startSize, minSize, color, weight = "bold") {
  try {
    const value = safeText(text);
    const size = fitText(ctx, value, maxWidth, startSize, minSize, weight);
    ctx.save();
    ctx.font = `${fontWeight(weight)} ${size}px Arial`;
    ctx.fillStyle = color || "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(value, WIDTH / 2, y);
    console.log("[Boas-vindas] texto desenhado", {
      texto: value,
      x: WIDTH / 2,
      y,
      font: ctx.font
    });
    ctx.restore();
  } catch (err) {
    console.warn("[Boas-vindas] erro ao desenhar texto:", {
      texto: text,
      erro: err.message
    });
  }
}

function drawVisibleText(ctx, text, y, maxWidth, size) {
  try {
    const value = safeText(text);
    const finalSize = fitText(ctx, value, maxWidth, size, 18, "bold");

    ctx.save();
    ctx.font = `bold ${finalSize}px Arial`;
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = Math.max(3, Math.round(finalSize / 12));
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(value, WIDTH / 2, y);
    ctx.fillText(value, WIDTH / 2, y);
    console.log("[Boas-vindas] texto desenhado", {
      texto: value,
      x: WIDTH / 2,
      y,
      font: ctx.font
    });
    ctx.restore();
  } catch (err) {
    console.warn("[Boas-vindas] erro ao desenhar texto:", {
      texto: text,
      erro: err.message
    });
  }
}

async function createWelcomeImageBuffer(member, config) {
  const user = member.user;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const [background, avatar] = await Promise.all([
    loadBackground(config.boasVindasBackgroundUrl),
    loadDiscordAvatar(user)
  ]);
  const title = safeText(config.boasVindasTitle, "BEM-VINDO(A)");
  const username = safeText(user.username || member.displayName, "novo membro");
  const message = safeText(
    config.boasVindasMessage,
    "QUE VOC\u00ca POSSA APROVEITAR AO M\u00c1XIMO A ALCATEIA!"
  );
  console.log("[Boas-vindas] dados de texto", {
    title,
    username,
    message
  });

  if (background) {
    drawCoverImage(ctx, background, 0, 0, WIDTH, HEIGHT);
  } else {
    drawFallbackBackground(ctx);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.52)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "rgba(11, 18, 32, 0.62)";
  roundRect(ctx, 70, 54, 1060, 412, 34);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(600, 145, 94, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(600, 145, 86, 0, Math.PI * 2);
  ctx.clip();
  drawCoverImage(ctx, avatar, 514, 59, 172, 172);
  ctx.restore();

  console.log("[Boas-vindas] posicoes do texto", {
    titulo: { x: canvas.width / 2, y: 250 },
    username: { x: canvas.width / 2, y: 310 },
    mensagem: { x: canvas.width / 2, y: 365 },
    data: { x: canvas.width / 2, y: 430 }
  });

  drawVisibleText(ctx, title, 250, 940, 52);
  drawVisibleText(ctx, `@${username}`, 310, 940, 38);
  drawVisibleText(ctx, message, 365, 980, 32);

  const dateText = formatSaoPauloDate();
  ctx.save();
  ctx.font = "bold 20px Arial";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(dateText, canvas.width / 2, 430);
  console.log("[Boas-vindas] texto desenhado", {
    texto: dateText,
    x: canvas.width / 2,
    y: 430,
    font: ctx.font
  });
  ctx.restore();
  const buffer = canvas.toBuffer("image/png");
  console.log("[Boas-vindas] buffer PNG gerado com sucesso:", {
    bytes: buffer.length
  });

  return buffer;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

module.exports = {
  createWelcomeImageBuffer,
  isPublicImageUrl
};
