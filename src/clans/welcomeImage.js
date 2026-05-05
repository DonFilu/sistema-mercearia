const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1200;
const HEIGHT = 520;
const FONT_FAMILY = "sans-serif";
const BLOCK_FONT = {
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  "J": ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
};

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

function displayText(value, fallback = "") {
  return safeText(value, fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function fontWeight(value) {
  return value === "normal" ? "normal" : "bold";
}

function canvasFont(size, weight = "bold") {
  return `${fontWeight(weight)} ${size}px ${FONT_FAMILY}`;
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
    ctx.font = canvasFont(size, weight);
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
    ctx.font = canvasFont(size, weight);
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
    ctx.font = canvasFont(finalSize, "bold");
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.lineWidth = Math.max(4, Math.round(finalSize / 10));
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

function drawBannerText(ctx, text, y, maxWidth, size) {
  try {
    const value = safeText(text);
    const finalSize = fitText(ctx, value, maxWidth, size, 16, "bold");

    ctx.save();
    ctx.font = canvasFont(finalSize, "bold");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.98)";
    ctx.lineWidth = Math.max(5, Math.round(finalSize / 8));
    ctx.strokeText(value, WIDTH / 2, y);
    ctx.fillStyle = "#FFFFFF";
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

function blockTextWidth(text, scale) {
  const value = safeText(text);
  if (!value) return 0;
  return value.split("").reduce((width, char, index) => {
    const glyph = BLOCK_FONT[char] || BLOCK_FONT[" "];
    const glyphWidth = glyph[0].length * scale;
    return width + glyphWidth + (index < value.length - 1 ? scale : 0);
  }, 0);
}

function fitBlockScale(text, maxWidth, startScale, minScale) {
  let scale = startScale;

  while (scale > minScale && blockTextWidth(text, scale) > maxWidth) {
    scale -= 1;
  }

  return Math.max(minScale, scale);
}

function drawBlockText(ctx, text, centerX, centerY, maxWidth, startScale, minScale = 3) {
  const value = displayText(text);
  const scale = fitBlockScale(value, maxWidth, startScale, minScale);
  const width = blockTextWidth(value, scale);
  const height = 7 * scale;
  let x = Math.round(centerX - width / 2);
  const y = Math.round(centerY - height / 2);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.95)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  for (const char of value) {
    const glyph = BLOCK_FONT[char] || BLOCK_FONT[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;

        ctx.fillStyle = "rgba(0,0,0,0.95)";
        ctx.fillRect(x + col * scale - 2, y + row * scale - 2, scale + 4, scale + 4);
      }
    }

    x += glyph[0].length * scale + scale;
  }

  x = Math.round(centerX - width / 2);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  for (const char of value) {
    const glyph = BLOCK_FONT[char] || BLOCK_FONT[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== "1") continue;

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }

    x += glyph[0].length * scale + scale;
  }

  ctx.restore();
  console.log("[Boas-vindas] texto desenhado em blocos", {
    texto: value,
    x: centerX,
    y: centerY,
    scale
  });
}

async function createWelcomeImageBuffer(member, config) {
  const user = member.user;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const [background, avatar] = await Promise.all([
    loadBackground(config.boasVindasBackgroundUrl),
    loadDiscordAvatar(user)
  ]);
  const title = displayText(config.boasVindasTitle, "BEM-VINDO(A)");
  const username = displayText(user.username || member.displayName, "novo membro");
  const message = displayText(
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

  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const bottomGradient = ctx.createLinearGradient(0, 175, 0, HEIGHT);
  bottomGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  bottomGradient.addColorStop(0.42, "rgba(0, 0, 0, 0.58)");
  bottomGradient.addColorStop(1, "rgba(0, 0, 0, 0.82)");
  ctx.fillStyle = bottomGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const textPanelGradient = ctx.createLinearGradient(0, 235, 0, 455);
  textPanelGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  textPanelGradient.addColorStop(0.28, "rgba(0, 0, 0, 0.58)");
  textPanelGradient.addColorStop(1, "rgba(0, 0, 0, 0.72)");
  ctx.fillStyle = textPanelGradient;
  roundRect(ctx, 84, 245, 1032, 190, 18);
  ctx.fill();

  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.beginPath();
  ctx.arc(600, 130, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(600, 130, 86, 0, Math.PI * 2);
  ctx.clip();
  drawCoverImage(ctx, avatar, 514, 44, 172, 172);
  ctx.restore();

  console.log("[Boas-vindas] posicoes do texto", {
    titulo: { x: canvas.width / 2, y: 270 },
    username: { x: canvas.width / 2, y: 328 },
    mensagem: { x: canvas.width / 2, y: 382 },
    data: { x: 80, y: 470 }
  });

  drawBlockText(ctx, title, WIDTH / 2, 270, 980, 13, 7);
  drawBlockText(ctx, username, WIDTH / 2, 328, 940, 8, 4);
  drawBlockText(ctx, message, WIDTH / 2, 382, 1060, 6, 3);

  const dateText = formatSaoPauloDate();
  drawBlockText(ctx, dateText, 190, 470, 260, 4, 3);
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
