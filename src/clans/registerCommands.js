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
const CLAN_COMMANDS = [
  AVATAR_COMMAND,
  TESTAR_BOAS_VINDAS_COMMAND
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

  for (const guildId of uniqueGuildIds) {
    await registerGuildAvatarCommand(guildId);
  }

  if (process.env.DISCORD_SKIP_GLOBAL_COMMANDS !== "true") {
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
  registerGuildAvatarCommand
};
