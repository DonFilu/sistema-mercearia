const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const { ClanAccount } = require("./models");
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

router.get("/clans/bot-invite", (req, res) => {
  const inviteUrl = process.env.DISCORD_BOT_INVITE_URL || "https://discord.com/developers/applications";
  return res.redirect(inviteUrl);
});

router.post("/clans/logout", (req, res) => {
  clearSession(res);
  return res.json({ ok: true });
});

module.exports = router;
