require("dotenv").config();
const axios = require("axios");

const AVATAR_COMMAND = {
  name: "avatar",
  description: "Mostra o avatar Roblox de um usuário",
  options: [
    {
      name: "username",
      description: "Username do Roblox",
      type: 3,
      required: true
    }
  ]
};
const TESTAR_BOAS_VINDAS_COMMAND = {
  name: "testar-boasvindas",
  description: "Testa a mensagem de boas-vindas no canal configurado."
};
const USER_OPTION = {
  name: "usuario",
  description: "Usuario alvo",
  type: 6,
  required: true
};
const MOTIVO_OPTION = {
  name: "motivo",
  description: "Motivo",
  type: 3,
  required: true
};
const WARN_COMMAND = {
  name: "warn",
  description: "Aplica uma advertencia em um usuario",
  options: [USER_OPTION, MOTIVO_OPTION]
};
const WARNINGS_COMMAND = {
  name: "warnings",
  description: "Mostra advertencias de um usuario",
  options: [USER_OPTION]
};
const CLEARWARNS_COMMAND = {
  name: "clearwarns",
  description: "Remove todas as advertencias de um usuario",
  options: [USER_OPTION]
};
const REMOVEWARN_COMMAND = {
  name: "removewarn",
  description: "Remove uma advertencia pelo ID",
  options: [
    USER_OPTION,
    {
      name: "id",
      description: "ID da advertencia",
      type: 3,
      required: true
    }
  ]
};
const MUTE_COMMAND = {
  name: "mute",
  description: "Silencia um usuario com timeout",
  options: [
    USER_OPTION,
    {
      name: "tempo",
      description: "Tempo em minutos",
      type: 4,
      required: true
    },
    MOTIVO_OPTION
  ]
};
const UNMUTE_COMMAND = {
  name: "unmute",
  description: "Remove o silencio de um usuario",
  options: [USER_OPTION, MOTIVO_OPTION]
};
const BAN_COMMAND = {
  name: "ban",
  description: "Bane um usuario do servidor",
  options: [USER_OPTION, MOTIVO_OPTION]
};
const CLAN_COMMANDS = [
  AVATAR_COMMAND,
  TESTAR_BOAS_VINDAS_COMMAND,
  WARN_COMMAND,
  WARNINGS_COMMAND,
  CLEARWARNS_COMMAND,
  REMOVEWARN_COMMAND,
  MUTE_COMMAND,
  UNMUTE_COMMAND,
  BAN_COMMAND
];

function discordCommandConfig() {
  const applicationId = process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!applicationId || !token) {
    throw new Error("Configure DISCORD_APPLICATION_ID ou DISCORD_CLIENT_ID e DISCORD_BOT_TOKEN.");
  }

  return { applicationId, token };
}

function commandHeaders(token) {
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json"
  };
}

async function registerGlobalAvatarCommand() {
  const { applicationId, token } = discordCommandConfig();
  await axios.put(
    `https://discord.com/api/v10/applications/${applicationId}/commands`,
    CLAN_COMMANDS,
    { headers: commandHeaders(token), timeout: 10000 }
  );

  console.log("Comandos Clan Cidio registrados globalmente.");
}

async function deleteGlobalClanCommands() {
  const { applicationId, token } = discordCommandConfig();
  const names = new Set(CLAN_COMMANDS.map(command => command.name));
  const response = await axios.get(
    `https://discord.com/api/v10/applications/${applicationId}/commands`,
    { headers: commandHeaders(token), timeout: 10000 }
  );
  const commands = Array.isArray(response.data) ? response.data : [];
  const clanCommands = commands.filter(command => names.has(command.name));

  for (const command of clanCommands) {
    await axios.delete(
      `https://discord.com/api/v10/applications/${applicationId}/commands/${command.id}`,
      { headers: commandHeaders(token), timeout: 10000 }
    );
    console.log("Comando global antigo removido:", command.name);
  }
}

async function registerGuildAvatarCommand(guildId) {
  if (!guildId) return;

  const { applicationId, token } = discordCommandConfig();
  await axios.put(
    `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
    CLAN_COMMANDS,
    { headers: commandHeaders(token), timeout: 10000 }
  );

  console.log("Comandos Clan Cidio registrados no servidor:", guildId);
}

function envGuildIds() {
  const raw = process.env.DISCORD_GUILD_IDS || process.env.DISCORD_GUILD_ID || "";
  return raw
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

async function registerAvatarCommands(guildIds = []) {
  const uniqueGuildIds = [...new Set([...envGuildIds(), ...guildIds].filter(Boolean))];

  if (process.env.DISCORD_KEEP_GLOBAL_COMMANDS !== "true") {
    await deleteGlobalClanCommands();
  }

  for (const guildId of uniqueGuildIds) {
    await registerGuildAvatarCommand(guildId);
  }

  if (process.env.DISCORD_REGISTER_GLOBAL_COMMANDS === "true") {
    await registerGlobalAvatarCommand();
  }
}

async function registerConfiguredGuildCommands() {
  const { ClanGuildConfig } = require("./models");
  const guildIds = await ClanGuildConfig.distinct("guildId");

  await registerAvatarCommands(guildIds);
}

if (require.main === module) {
  registerAvatarCommands().catch(err => {
    console.error("Erro ao registrar comandos:", err.response?.data || err.message);
    process.exit(1);
  });
}

module.exports = {
  AVATAR_COMMAND,
  TESTAR_BOAS_VINDAS_COMMAND,
  CLAN_COMMANDS,
  registerAvatarCommands,
  registerConfiguredGuildCommands,
  registerGuildAvatarCommand,
  deleteGlobalClanCommands
};
