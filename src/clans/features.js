const axios = require("axios");
const { ClanGuildConfig } = require("./models");

const DISCORD_API = "https://discord.com/api/v10";
const ADMINISTRATOR = 0x8n;
const MANAGE_GUILD = 0x20n;

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
        avatarRobloxChannelId: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function publicGuildConfig(config) {
  return {
    guildId: config.guildId,
    avatarRobloxEnabled: config.avatarRobloxEnabled === true,
    avatarRobloxChannelId: config.avatarRobloxChannelId || null
  };
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
  listTextChannels,
  findRobloxUser,
  findRobloxAvatar
};
