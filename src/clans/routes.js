const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const { ClanAccount, ClanGuildConfig } = require("./models");
const {
  findManageableGuild,
  getGuildConfig,
  publicGuildConfig,
  listTextChannels,
  findRobloxUser,
  findRobloxAvatar
} = require("./features");
const {
  randomState,
  getState,
  getSessionToken,
  setOAuthState,
  clearOAuthState,
  setSession,
  clearSession,
  verifyToken
} = require("./security");
const { registerGuildAvatarCommand } = require("./registerCommands");

const router = express.Router();
let indexesChecked = false;
const INTERACTION_RESPONSE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;
const EPHEMERAL = 64;

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      erro: "Banco de dados conectando. Tente novamente em alguns segundos."
    });
  }

  return next();
}

function requireDiscordConfig(req, res, next) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_REDIRECT_URI) {
    return res.status(500).send("Discord OAuth nao configurado no servidor.");
  }

  return next();
}

function publicAccount(account) {
  return {
    id: account._id,
    tipoSistema: account.tipoSistema,
    discordId: account.discordId,
    username: account.username,
    avatar: account.avatar,
    email: account.email,
    guilds: account.guilds || []
  };
}

async function prepareClanIndexes() {
  if (indexesChecked) return;
  indexesChecked = true;

  try {
    await ClanAccount.collection.dropIndex("email_1");
    console.log("Indice antigo email_1 do Clan Cidio removido.");
  } catch (err) {
    if (err.codeName !== "IndexNotFound" && err.code !== 27) {
      console.warn("Nao foi possivel remover indice antigo email_1 do Clan:", err.message);
    }
  }
}

async function requireClanAuth(req, res, next) {
  try {
    const payload = verifyToken(getSessionToken(req));

    if (payload.tipoSistema !== "clan") {
      return res.status(401).json({ erro: "Sessao invalida" });
    }

    const account = await ClanAccount.findById(payload.sub);

    if (!account) {
      return res.status(401).json({ erro: "Conta nao encontrada" });
    }

    req.clanAccount = account;
    return next();
  } catch (err) {
    return res.status(401).json({ erro: "Sessao invalida" });
  }
}

function discordAvatarUrl(user) {
  if (!user.avatar) return "";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}

function guildIconUrl(guild) {
  if (!guild.icon) return "";
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
}

function interactionResponse(content, ephemeral = true) {
  return {
    type: INTERACTION_RESPONSE,
    data: {
      content,
      flags: ephemeral ? EPHEMERAL : undefined
    }
  };
}

async function updateDeferredInteraction(interaction, data) {
  const applicationId = interaction.application_id;
  const token = interaction.token;

  if (!applicationId || !token) {
    console.warn("Nao foi possivel responder interacao: application_id/token ausente.");
    return;
  }

  await axios.patch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`,
    data
  );
}

function verifyDiscordInteraction(req) {
  if (!process.env.DISCORD_PUBLIC_KEY) return false;

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];
  const rawBody = req.rawBody;

  if (!signature || !timestamp || !rawBody) return false;

  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(`302a300506032b6570032100${process.env.DISCORD_PUBLIC_KEY}`, "hex"),
      format: "der",
      type: "spki"
    });

    const bodyBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(String(rawBody), "utf8");
    const signedPayload = Buffer.concat([
      Buffer.from(String(timestamp), "utf8"),
      bodyBuffer
    ]);

    return crypto.verify(
      null,
      signedPayload,
      publicKey,
      Buffer.from(signature, "hex")
    );
  } catch (err) {
    console.warn("Falha ao validar assinatura Discord:", err.message);
    return false;
  }
}

function getInteractionOption(interaction, name) {
  return (interaction.data?.options || []).find(option => option.name === name)?.value;
}

async function sendAvatarRobloxEmbed(interaction, username) {
  try {
    const user = await findRobloxUser(username);

    if (!user) {
      await updateDeferredInteraction(interaction, {
        content: "Usuário Roblox não encontrado.",
        embeds: []
      });
      return;
    }

    const avatarUrl = await findRobloxAvatar(user.id);
    const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;

    await updateDeferredInteraction(interaction, {
      content: "",
      embeds: [
        {
          title: "Avatar Roblox",
          description: `Avatar de ${user.name}`,
          url: profileUrl,
          color: 5793266,
          fields: [
            {
              name: "Nome",
              value: user.name,
              inline: true
            },
            {
              name: "ID",
              value: String(user.id),
              inline: true
            }
          ],
          image: avatarUrl ? { url: avatarUrl } : undefined,
          footer: { text: "Clan Cidio" }
        }
      ]
    });
  } catch (err) {
    console.error("Erro no comando /avatar:", err.response?.data || err);
    await updateDeferredInteraction(interaction, {
      content: "Erro ao buscar avatar, tente novamente.",
      embeds: []
    });
  }
}

router.get("/auth/discord", requireDiscordConfig, (req, res) => {
  const state = randomState();
  setOAuthState(res, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    scope: "identify email guilds",
    state
  });

  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

router.get("/auth/discord/callback", requireDatabase, requireDiscordConfig, async (req, res) => {
  try {
    await prepareClanIndexes();

    const { code, state } = req.query;

    if (!code || !state || state !== getState(req)) {
      clearOAuthState(res);
      return res.status(400).send("Login com Discord invalido. Tente novamente.");
    }

    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;
    const headers = { Authorization: `Bearer ${accessToken}` };

    const [userResponse, guildsResponse] = await Promise.all([
      axios.get("https://discord.com/api/users/@me", { headers }),
      axios.get("https://discord.com/api/users/@me/guilds", { headers })
    ]);

    const user = userResponse.data;
    const email = user.email ? String(user.email).toLowerCase().trim() : undefined;
    const guilds = (guildsResponse.data || []).map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guildIconUrl(guild),
      owner: !!guild.owner,
      permissions: String(guild.permissions || "")
    }));

    const existingAccount = await ClanAccount.findOne({
      $or: [
        { discordId: user.id },
        ...(email ? [{ email }] : [])
      ]
    });

    const update = {
      $set: {
        tipoSistema: "clan",
        discordId: user.id,
        username: user.global_name || user.username,
        avatar: discordAvatarUrl(user),
        guilds,
        lastLoginAt: new Date()
      },
      $unset: {
        senha: ""
      }
    };

    if (email) update.$set.email = email;

    const account = await ClanAccount.findOneAndUpdate(
      existingAccount ? { _id: existingAccount._id } : { discordId: user.id },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    clearOAuthState(res);
    setSession(res, account._id);
    return res.redirect("/clans/home");
  } catch (err) {
    const details = err.response?.data || {
      message: err.message,
      code: err.code,
      codeName: err.codeName,
      keyPattern: err.keyPattern
    };
    console.error("Erro no Discord OAuth:", details);
    clearOAuthState(res);
    return res.status(500).send("Nao foi possivel concluir o login com Discord.");
  }
});

router.get("/clans/me", requireDatabase, requireClanAuth, (req, res) => {
  return res.json({ account: publicAccount(req.clanAccount) });
});

router.get("/clans/guilds", requireDatabase, requireClanAuth, async (req, res) => {
  const manageable = (req.clanAccount.guilds || [])
    .filter(guild => findManageableGuild(req.clanAccount, guild.id))
    .map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      permissions: guild.permissions
    }));

  const configs = await Promise.all(manageable.map(guild => getGuildConfig(guild.id)));
  const configsByGuild = Object.fromEntries(configs.map(config => [config.guildId, publicGuildConfig(config)]));
  console.log("Configs Avatar Roblox retornadas para o painel:", configs.map(config => ({
    guildId: config.guildId,
    avatarRobloxEnabled: config.avatarRobloxEnabled === true,
    avatarRobloxChannelId: config.avatarRobloxChannelId || null
  })));

  return res.json({
    guilds: manageable.map(guild => ({
      ...guild,
      config: configsByGuild[guild.id] || {
        guildId: guild.id,
        avatarRobloxEnabled: false,
        avatarRobloxChannelId: ""
      }
    }))
  });
});

router.get("/clans/guilds/:guildId/channels", requireDatabase, requireClanAuth, async (req, res) => {
  try {
    const guild = findManageableGuild(req.clanAccount, req.params.guildId);

    if (!guild) {
      return res.status(403).json({ erro: "Voce nao tem permissao para configurar este servidor." });
    }

    const channels = await listTextChannels(req.params.guildId);
    return res.json({
      channels,
      mensagem: channels.length
        ? ""
        : "Nenhum canal de texto foi encontrado nesse servidor."
    });
  } catch (err) {
    console.error(err.response?.data || err);
    return res.status(err.status || 500).json({ erro: err.message || "Erro ao listar canais" });
  }
});

router.get("/clans/guilds/:guildId/config", requireDatabase, requireClanAuth, async (req, res) => {
  const guild = findManageableGuild(req.clanAccount, req.params.guildId);

  if (!guild) {
    return res.status(403).json({ erro: "Voce nao tem permissao para configurar este servidor." });
  }

  const config = await getGuildConfig(req.params.guildId);
  console.log("Config Avatar Roblox carregada no painel:", {
    guildId: config.guildId,
    avatarRobloxEnabled: config.avatarRobloxEnabled,
    avatarRobloxChannelId: config.avatarRobloxChannelId || ""
  });

  return res.json({ config: publicGuildConfig(config) });
});

router.put("/clans/guilds/:guildId/config/avatar-roblox", requireDatabase, requireClanAuth, async (req, res) => {
  console.log("GuildId recebido em Configuracoes Avatar Roblox:", req.params.guildId);
  const guild = findManageableGuild(req.clanAccount, req.params.guildId);

  if (!guild) {
    return res.status(403).json({ erro: "Voce nao tem permissao para configurar este servidor." });
  }

  const enabled = req.body.avatarRobloxEnabled === true;
  const channelId = req.body.avatarRobloxChannelId ? String(req.body.avatarRobloxChannelId) : null;

  if (channelId) {
    const channels = await listTextChannels(req.params.guildId);
    const exists = channels.some(channel => channel.id === channelId);

    if (!exists) {
      return res.status(400).json({ erro: "Canal invalido para este servidor." });
    }
  }

  const config = await ClanGuildConfig.findOneAndUpdate(
    { guildId: req.params.guildId },
    {
      $set: {
        guildId: req.params.guildId,
        avatarRobloxEnabled: enabled,
        avatarRobloxChannelId: channelId
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log("Config Avatar Roblox salva:", {
    guildId: config.guildId,
    avatarRobloxEnabled: config.avatarRobloxEnabled === true,
    avatarRobloxChannelId: config.avatarRobloxChannelId || null,
    canalSalvo: !!channelId
  });

  if (enabled) {
    registerGuildAvatarCommand(req.params.guildId).catch(err => {
      console.error("Erro ao registrar /avatar no servidor:", err.response?.data || err.message);
    });
  }

  return res.json({
    ok: true,
    mensagem: "Canal salvo com sucesso.",
    config: publicGuildConfig(config)
  });
});

router.get("/clans/bot-invite", (req, res) => {
  const inviteUrl = process.env.DISCORD_BOT_INVITE_URL || "https://discord.com/developers/applications";
  return res.redirect(inviteUrl);
});

router.post("/clans/logout", (req, res) => {
  clearSession(res);
  return res.json({ ok: true });
});

router.post("/discord/interactions", async (req, res) => {
  if (!verifyDiscordInteraction(req)) {
    console.warn("Interacao Discord recusada: assinatura invalida ou DISCORD_PUBLIC_KEY ausente.");
    return res.status(401).send("invalid request signature");
  }

  const interaction = req.body;

  if (interaction.type === 1) {
    return res.json({ type: 1 });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.json(interactionResponse("Banco de dados conectando. Tente novamente em alguns segundos."));
  }

  if (interaction.type !== 2 || interaction.data?.name !== "avatar") {
    return res.json(interactionResponse("Comando nao reconhecido."));
  }

  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  const username = String(getInteractionOption(interaction, "username") || "").trim();
  console.log("Comando /avatar recebido:", { guildId, channelId, username });

  if (!guildId) {
    console.log("Comando /avatar bloqueado: sem guildId.");
    return res.json(interactionResponse("Este comando so pode ser usado em servidores."));
  }

  const config = await ClanGuildConfig.findOne({ guildId });
  console.log("Config Avatar Roblox:", config ? {
    guildId: config.guildId,
    avatarRobloxEnabled: config.avatarRobloxEnabled,
    avatarRobloxChannelId: config.avatarRobloxChannelId
  } : null);

  if (!config || !config.avatarRobloxEnabled) {
    console.log("Comando /avatar bloqueado: Avatar Roblox desativado.", { guildId, channelId });
    return res.json(interactionResponse("Avatar Roblox está desativado neste servidor."));
  }

  if (!config.avatarRobloxChannelId) {
    console.log("Comando /avatar bloqueado: canal nao configurado.", { guildId, channelId });
    return res.json(interactionResponse("O canal do Avatar Roblox ainda não foi configurado no painel."));
  }

  if (config.avatarRobloxChannelId !== channelId) {
    console.log("Comando /avatar bloqueado: canal errado.", {
      guildId,
      channelId,
      avatarRobloxChannelId: config.avatarRobloxChannelId
    });
    return res.json(interactionResponse("Este comando só pode ser usado no canal configurado para Avatar Roblox."));
  }

  if (!username) {
    return res.json(interactionResponse("O nome de usuário é obrigatório."));
  }

  sendAvatarRobloxEmbed(interaction, username).catch(err => {
    console.error("Erro ao finalizar resposta /avatar:", err.response?.data || err);
  });

  return res.json({ type: DEFERRED_CHANNEL_MESSAGE });
});

module.exports = router;
