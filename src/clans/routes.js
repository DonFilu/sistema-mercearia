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

const router = express.Router();
let indexesChecked = false;
const INTERACTION_RESPONSE = 4;
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

    return crypto.verify(
      null,
      Buffer.from(`${timestamp}${rawBody}`),
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

  const configs = await ClanGuildConfig.find({
    guildId: { $in: manageable.map(guild => guild.id) }
  });
  const configsByGuild = Object.fromEntries(configs.map(config => [config.guildId, publicGuildConfig(config)]));

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
  return res.json({ config: publicGuildConfig(config) });
});

router.put("/clans/guilds/:guildId/config/avatar-roblox", requireDatabase, requireClanAuth, async (req, res) => {
  const guild = findManageableGuild(req.clanAccount, req.params.guildId);

  if (!guild) {
    return res.status(403).json({ erro: "Voce nao tem permissao para configurar este servidor." });
  }

  const enabled = !!req.body.avatarRobloxEnabled;
  const channelId = String(req.body.avatarRobloxChannelId || "");

  if (enabled && !channelId) {
    return res.status(400).json({ erro: "Escolha um canal para ativar Avatar Roblox." });
  }

  if (enabled) {
    const channels = await listTextChannels(req.params.guildId);
    const exists = channels.some(channel => channel.id === channelId);

    if (!exists) {
      return res.status(400).json({ erro: "Canal invalido para este servidor." });
    }
  }

  const config = await ClanGuildConfig.findOneAndUpdate(
    { guildId: req.params.guildId },
    {
      guildId: req.params.guildId,
      avatarRobloxEnabled: enabled,
      avatarRobloxChannelId: enabled ? channelId : ""
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

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
    return res.json(interactionResponse("Este comando so pode ser usado em servidores."));
  }

  const config = await ClanGuildConfig.findOne({ guildId });
  console.log("Config Avatar Roblox:", config ? {
    guildId: config.guildId,
    avatarRobloxEnabled: config.avatarRobloxEnabled,
    avatarRobloxChannelId: config.avatarRobloxChannelId
  } : null);

  if (!config || !config.avatarRobloxEnabled) {
    return res.json(interactionResponse("Avatar Roblox esta desativado neste servidor."));
  }

  if (!config.avatarRobloxChannelId) {
    return res.json(interactionResponse("O canal do Avatar Roblox ainda nao foi configurado no painel."));
  }

  if (config.avatarRobloxChannelId !== channelId) {
    return res.json(interactionResponse("Este comando so pode ser usado no canal configurado para Avatar Roblox."));
  }

  if (!username) {
    return res.json(interactionResponse("Informe um username Roblox."));
  }

  try {
    const user = await findRobloxUser(username);

    if (!user) {
      return res.json(interactionResponse("Usuario Roblox nao encontrado."));
    }

    const avatarUrl = await findRobloxAvatar(user.id);
    const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;

    return res.json({
      type: INTERACTION_RESPONSE,
      data: {
        embeds: [
          {
            title: `Avatar Roblox de ${user.name}`,
            description: `[Abrir perfil Roblox](${profileUrl})`,
            url: profileUrl,
            color: 5793266,
            image: avatarUrl ? { url: avatarUrl } : undefined,
            footer: { text: "Clan Cidio" }
          }
        ]
      }
    });
  } catch (err) {
    console.error("Erro no comando /avatar:", err.response?.data || err);
    return res.json(interactionResponse("Nao foi possivel buscar o avatar Roblox agora."));
  }
});

module.exports = router;
