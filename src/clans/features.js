const axios = require("axios");
const { ClanGuildConfig } = require("./models");

const DISCORD_API = "https://discord.com/api/v10";
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;
const DEFAULT_CHAMADAS_MESSAGE = `𝘉𝘖𝘔 𝘋𝘐𝘈𝘈, clã!
🔥 CHAMADA DE HOJE 🔥

Mais um dia começou…

🌼 Lembretes rápidos:
🔹 Marcar presença respondendo à chamada é obrigatório
🔹 Fiquem atentos aos canais #avisos e #anuncios
🔹 Vai sumir? Avisa no #inatividade

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📣 CHAMADA INTERATIVA:`;
const DEFAULT_CHAMADAS_QUESTIONS = [
  "🍕 Pizza fria ou esquentada?",
  "😴 Dormir cedo ou virar a noite?",
  "🎧 Música alta ou baixinha?",
  "🍟 Batata frita ou hambúrguer?",
  "🐱 Gato ou cachorro?",
  "🌧️ Chuva ou sol?",
  "🎮 Jogo competitivo ou casual?",
  "☕ Café ou energético?",
  "📱 Android ou iPhone?",
  "🍫 Chocolate branco ou preto?",
  "👀 Qual assunto sempre vira debate no clã?",
  "🐺 Qual membro do clã mais aparece do nada?",
  "😂 Qual foi a coisa mais engraçada que aconteceu no servidor?",
  "🔥 Qual jogo vocês querem jogar hoje?",
  "🎵 Qual música combina com o clã hoje?"
];
const DEFAULT_CHAMADAS_END_MESSAGE = "📌 Chamada de hoje encerrada, obrigado a todos!";

function hasGuildAdminPermission(guild) {
  if (!guild) return false;
  if (guild.owner) return true;

  try {
    const permissions = BigInt(guild.permissions || "0");
    return (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
      (permissions & MANAGE_GUILD) === MANAGE_GUILD;
  } catch (err) {
    return false;
  }
}

function findManageableGuild(account, guildId) {
  const guild = (account.guilds || []).find(item => item.id === guildId);
  return hasGuildAdminPermission(guild) ? guild : null;
}

async function getGuildConfig(guildId) {
  return ClanGuildConfig.findOneAndUpdate(
    { guildId },
    {
      $setOnInsert: {
        guildId,
        avatarRobloxEnabled: false,
        avatarRobloxChannelId: null,
        chamadasEnabled: false,
        chamadasChannelId: null,
        chamadasTimeStart: "05:00",
        chamadasTimeEnd: "05:30",
        chamadasMessage: DEFAULT_CHAMADAS_MESSAGE,
        chamadasQuestions: DEFAULT_CHAMADAS_QUESTIONS,
        chamadasEndMessage: DEFAULT_CHAMADAS_END_MESSAGE,
        chamadasLastQuestion: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function publicGuildConfig(config) {
  const hasCustomChamadasConfig = !!(
    config.chamadasMessage ||
    config.chamadasEndMessage ||
    config.chamadasChannelId ||
    config.chamadasEnabled ||
    config.chamadasLastQuestion
  );
  const savedQuestions = Array.isArray(config.chamadasQuestions) ? config.chamadasQuestions : null;

  return {
    guildId: config.guildId,
    avatarRobloxEnabled: config.avatarRobloxEnabled === true,
    avatarRobloxChannelId: config.avatarRobloxChannelId || null,
    chamadasEnabled: config.chamadasEnabled === true,
    chamadasChannelId: config.chamadasChannelId || null,
    chamadasTimeStart: config.chamadasTimeStart || "05:00",
    chamadasTimeEnd: config.chamadasTimeEnd || "05:30",
    chamadasMessage: config.chamadasMessage || DEFAULT_CHAMADAS_MESSAGE,
    chamadasQuestions: savedQuestions && (savedQuestions.length || hasCustomChamadasConfig)
      ? savedQuestions
      : DEFAULT_CHAMADAS_QUESTIONS,
    chamadasEndMessage: config.chamadasEndMessage || DEFAULT_CHAMADAS_END_MESSAGE,
    chamadasLastQuestion: config.chamadasLastQuestion || null
  };
}

function normalizeQuestions(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

function chooseDailyQuestion(questions, lastQuestion) {
  const cleanQuestions = normalizeQuestions(questions);

  if (!cleanQuestions.length) return "";
  if (cleanQuestions.length === 1) return cleanQuestions[0];

  const available = cleanQuestions.filter(question => question !== lastQuestion);
  const pool = available.length ? available : cleanQuestions;

  return pool[Math.floor(Math.random() * pool.length)];
}

async function listTextChannels(guildId) {
  if (!process.env.DISCORD_BOT_TOKEN) {
    const err = new Error("Token do bot nao configurado. Configure DISCORD_BOT_TOKEN no deploy.");
    err.status = 500;
    throw err;
  }

  let response;

  try {
    response = await axios.get(`${DISCORD_API}/guilds/${guildId}/channels`, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
      }
    });
  } catch (err) {
    const status = err.response?.status;
    const apiMessage = err.response?.data?.message;
    const friendly = new Error(
      status === 403 || status === 404
        ? "Nao consegui acessar os canais desse servidor. Convide o bot para esse servidor e garanta permissao para ver canais."
        : apiMessage || "Erro ao consultar canais no Discord."
    );

    friendly.status = status || 500;
    throw friendly;
  }

  return (response.data || [])
    .filter(channel => Number(channel.type) === 0)
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map(channel => ({
      id: channel.id,
      name: channel.name
    }));
}

async function findRobloxUser(username) {
  const response = await axios.post(
    "https://users.roblox.com/v1/usernames/users",
    {
      usernames: [username],
      excludeBannedUsers: false
    },
    { timeout: 5000 }
  );

  return response.data?.data?.[0] || null;
}

async function findRobloxAvatar(userId) {
  const response = await axios.get("https://thumbnails.roblox.com/v1/users/avatar", {
    timeout: 5000,
    params: {
      userIds: userId,
      size: "420x420",
      format: "Png",
      isCircular: false
    }
  });

  return response.data?.data?.[0]?.imageUrl || "";
}

module.exports = {
  hasGuildAdminPermission,
  findManageableGuild,
  getGuildConfig,
  publicGuildConfig,
  normalizeQuestions,
  chooseDailyQuestion,
  DEFAULT_CHAMADAS_MESSAGE,
  DEFAULT_CHAMADAS_QUESTIONS,
  DEFAULT_CHAMADAS_END_MESSAGE,
  listTextChannels,
  findRobloxUser,
  findRobloxAvatar
};
