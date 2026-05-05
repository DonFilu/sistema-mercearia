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
const DEFAULT_MODO_TOSCO_MESSAGES = [
  "um pato entrou no server e saiu com admin kkkkk",
  "alguem viu meu controle? ele foi jogar sozinho",
  "isso ai me lembrou um pão olhando pro nada",
  "se isso fizer sentido eu sou uma geladeira",
  "acabou de passar um cachorro programador aqui",
  "o clima ta estranho parece segunda feira em sexta",
  "isso ai foi tão aleatório que o wifi caiu de vergonha",
  "parece cena cortada de filme que nunca existiu",
  "isso foi tão inesperado quanto abrir a geladeira e ter comida",
  "o cara digitou isso e o teclado pediu demissão",
  "se continuar assim o universo reinicia",
  "o chat virou episódio perdido",
  "alguem explica isso pro meu peixe pfv",
  "isso ai foi tão confuso que até o eco desistiu",
  "isso não faz sentido nem em sonho"
];
const DEFAULT_BOAS_VINDAS_TITLE = "BEM-VINDO(A)";
const DEFAULT_BOAS_VINDAS_MESSAGE = "Que você possa aproveitar ao máximo do nosso servidor!";
const DEFAULT_SAIDAS_MESSAGE = "{username} saiu do servidor";
const DEFAULT_MODERACAO_CONFIG = {
  moderacaoEnabled: false,
  moderacaoLogsEnabled: false,
  moderacaoLogsChannelId: null,
  warnEnabled: false,
  warnLogsChannelId: null,
  warnMessage: "{user} recebeu uma advertencia. Motivo: {motivo}",
  muteEnabled: false,
  muteLogsChannelId: null,
  muteMaxTime: 1440,
  muteMessage: "{user} foi silenciado por {tempo}. Motivo: {motivo}",
  unmuteMessage: "{user} teve o silencio removido. Motivo: {motivo}",
  antiSpamEnabled: false,
  antiSpamChannels: [],
  antiSpamIgnoredRoles: [],
  antiSpamMaxMessages: 5,
  antiSpamIntervalSeconds: 5,
  antiSpamAction: "delete",
  antiSpamTimeoutMinutes: 5,
  antiLinkEnabled: false,
  antiLinkChannels: [],
  antiLinkAllowedRoles: [],
  antiLinkAllowedDomains: [],
  antiLinkAction: "delete",
  antiLinkMessage: "{user}, links nao sao permitidos neste canal.",
  badWordsEnabled: false,
  badWordsChannels: [],
  badWordsIgnoredRoles: [],
  badWordsList: [],
  badWordsAction: "delete",
  badWordsMessage: "{user}, sua mensagem foi removida por conter palavra proibida.",
  autoRoleEnabled: false,
  autoRoleId: null,
  autoRoleRemoveOnLeave: false,
  verificationEnabled: false,
  verificationChannelId: null,
  verificationRoleId: null,
  verificationMessage: "Clique no botao abaixo para verificar sua conta e liberar acesso ao servidor.",
  moderationStaffRoles: []
};

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
        chamadasLastQuestion: null,
        modoToscoEnabled: false,
        modoToscoChannels: [],
        modoToscoFrequency: 5,
        modoToscoMessages: DEFAULT_MODO_TOSCO_MESSAGES,
        boasVindasEnabled: false,
        boasVindasChannelId: null,
        boasVindasBackgroundUrl: null,
        boasVindasTitle: DEFAULT_BOAS_VINDAS_TITLE,
        boasVindasMessage: DEFAULT_BOAS_VINDAS_MESSAGE,
        saidasEnabled: false,
        saidasChannelId: null,
        saidasMessage: DEFAULT_SAIDAS_MESSAGE,
        ...DEFAULT_MODERACAO_CONFIG
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
  const hasCustomModoToscoConfig = !!(
    config.modoToscoEnabled ||
    (Array.isArray(config.modoToscoChannels) && config.modoToscoChannels.length) ||
    config.modoToscoFrequency
  );
  const savedModoToscoMessages = Array.isArray(config.modoToscoMessages) ? config.modoToscoMessages : null;

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
    chamadasLastQuestion: config.chamadasLastQuestion || null,
    modoToscoEnabled: config.modoToscoEnabled === true,
    modoToscoChannels: Array.isArray(config.modoToscoChannels) ? config.modoToscoChannels : [],
    modoToscoFrequency: Math.max(1, Number(config.modoToscoFrequency || 5)),
    modoToscoMessages: savedModoToscoMessages && (savedModoToscoMessages.length || hasCustomModoToscoConfig)
      ? savedModoToscoMessages
      : DEFAULT_MODO_TOSCO_MESSAGES,
    boasVindasEnabled: config.boasVindasEnabled === true,
    boasVindasChannelId: config.boasVindasChannelId || null,
    boasVindasBackgroundUrl: config.boasVindasBackgroundUrl || null,
    boasVindasTitle: config.boasVindasTitle || DEFAULT_BOAS_VINDAS_TITLE,
    boasVindasMessage: config.boasVindasMessage || DEFAULT_BOAS_VINDAS_MESSAGE,
    saidasEnabled: config.saidasEnabled === true,
    saidasChannelId: config.saidasChannelId || null,
    saidasMessage: config.saidasMessage || DEFAULT_SAIDAS_MESSAGE,
    moderacaoEnabled: config.moderacaoEnabled === true,
    moderacaoLogsEnabled: config.moderacaoLogsEnabled === true,
    moderacaoLogsChannelId: config.moderacaoLogsChannelId || null,
    warnEnabled: config.warnEnabled === true,
    warnLogsChannelId: config.warnLogsChannelId || null,
    warnMessage: config.warnMessage || DEFAULT_MODERACAO_CONFIG.warnMessage,
    muteEnabled: config.muteEnabled === true,
    muteLogsChannelId: config.muteLogsChannelId || null,
    muteMaxTime: Math.max(1, Number(config.muteMaxTime || DEFAULT_MODERACAO_CONFIG.muteMaxTime)),
    muteMessage: config.muteMessage || DEFAULT_MODERACAO_CONFIG.muteMessage,
    unmuteMessage: config.unmuteMessage || DEFAULT_MODERACAO_CONFIG.unmuteMessage,
    antiSpamEnabled: config.antiSpamEnabled === true,
    antiSpamChannels: Array.isArray(config.antiSpamChannels) ? config.antiSpamChannels : [],
    antiSpamIgnoredRoles: Array.isArray(config.antiSpamIgnoredRoles) ? config.antiSpamIgnoredRoles : [],
    antiSpamMaxMessages: Math.max(1, Number(config.antiSpamMaxMessages || DEFAULT_MODERACAO_CONFIG.antiSpamMaxMessages)),
    antiSpamIntervalSeconds: Math.max(1, Number(config.antiSpamIntervalSeconds || DEFAULT_MODERACAO_CONFIG.antiSpamIntervalSeconds)),
    antiSpamAction: config.antiSpamAction || DEFAULT_MODERACAO_CONFIG.antiSpamAction,
    antiSpamTimeoutMinutes: Math.max(1, Number(config.antiSpamTimeoutMinutes || DEFAULT_MODERACAO_CONFIG.antiSpamTimeoutMinutes)),
    antiLinkEnabled: config.antiLinkEnabled === true,
    antiLinkChannels: Array.isArray(config.antiLinkChannels) ? config.antiLinkChannels : [],
    antiLinkAllowedRoles: Array.isArray(config.antiLinkAllowedRoles) ? config.antiLinkAllowedRoles : [],
    antiLinkAllowedDomains: Array.isArray(config.antiLinkAllowedDomains) ? config.antiLinkAllowedDomains : [],
    antiLinkAction: config.antiLinkAction || DEFAULT_MODERACAO_CONFIG.antiLinkAction,
    antiLinkMessage: config.antiLinkMessage || DEFAULT_MODERACAO_CONFIG.antiLinkMessage,
    badWordsEnabled: config.badWordsEnabled === true,
    badWordsChannels: Array.isArray(config.badWordsChannels) ? config.badWordsChannels : [],
    badWordsIgnoredRoles: Array.isArray(config.badWordsIgnoredRoles) ? config.badWordsIgnoredRoles : [],
    badWordsList: Array.isArray(config.badWordsList) ? config.badWordsList : [],
    badWordsAction: config.badWordsAction || DEFAULT_MODERACAO_CONFIG.badWordsAction,
    badWordsMessage: config.badWordsMessage || DEFAULT_MODERACAO_CONFIG.badWordsMessage,
    autoRoleEnabled: config.autoRoleEnabled === true,
    autoRoleId: config.autoRoleId || null,
    autoRoleRemoveOnLeave: config.autoRoleRemoveOnLeave === true,
    verificationEnabled: config.verificationEnabled === true,
    verificationChannelId: config.verificationChannelId || null,
    verificationRoleId: config.verificationRoleId || null,
    verificationMessage: config.verificationMessage || DEFAULT_MODERACAO_CONFIG.verificationMessage,
    moderationStaffRoles: Array.isArray(config.moderationStaffRoles) ? config.moderationStaffRoles : []
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

async function listGuildRoles(guildId) {
  if (!process.env.DISCORD_BOT_TOKEN) {
    const err = new Error("Token do bot nao configurado. Configure DISCORD_BOT_TOKEN no deploy.");
    err.status = 500;
    throw err;
  }

  try {
    const response = await axios.get(`${DISCORD_API}/guilds/${guildId}/roles`, {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
      }
    });

    return (response.data || [])
      .filter(role => role.name !== "@everyone")
      .sort((a, b) => (b.position || 0) - (a.position || 0))
      .map(role => ({
        id: role.id,
        name: role.name,
        position: role.position || 0
      }));
  } catch (err) {
    const friendly = new Error(err.response?.data?.message || "Erro ao consultar cargos no Discord.");
    friendly.status = err.response?.status || 500;
    throw friendly;
  }
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

  const imageUrl = response.data?.data?.[0]?.imageUrl || "";
  console.log("Roblox avatar imageUrl retornada:", { userId, imageUrl });
  return imageUrl;
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
  DEFAULT_MODO_TOSCO_MESSAGES,
  DEFAULT_BOAS_VINDAS_TITLE,
  DEFAULT_BOAS_VINDAS_MESSAGE,
  DEFAULT_SAIDAS_MESSAGE,
  DEFAULT_MODERACAO_CONFIG,
  listTextChannels,
  listGuildRoles,
  findRobloxUser,
  findRobloxAvatar
};
