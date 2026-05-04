const express = require("express");
const mongoose = require("mongoose");
const { ClanAccount } = require("./models");
const {
  hashPassword,
  verifyPassword,
  createClanToken,
  getBearerToken,
  verifyToken
} = require("./security");

const router = express.Router();

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function publicAccount(account) {
  return {
    id: account._id,
    email: account.email,
    tipoSistema: account.tipoSistema,
    discordId: account.discordId || null,
    discordUsername: account.discordUsername || null
  };
}

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      erro: "Banco de dados conectando. Tente novamente em alguns segundos."
    });
  }

  return next();
}

async function requireClanAuth(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ erro: "Sessao nao encontrada" });
  }

  try {
    const payload = verifyToken(token);

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

router.use(requireDatabase);

router.post("/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const senha = String(req.body.senha || "");

    if (!email || !senha) {
      return res.status(400).json({ erro: "Preencha todos os campos" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ erro: "Email invalido" });
    }

    const exists = await ClanAccount.findOne({ email });

    if (exists) {
      return res.status(400).json({ erro: "Email ja cadastrado" });
    }

    const account = await ClanAccount.create({
      email,
      senha: hashPassword(senha),
      tipoSistema: "clan"
    });

    return res.json({
      token: createClanToken(account._id),
      account: publicAccount(account)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro ao criar conta" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const senha = String(req.body.senha || "");

    if (!email || !senha) {
      return res.status(400).json({ erro: "Preencha todos os campos" });
    }

    const account = await ClanAccount.findOne({ email });

    if (!account || !verifyPassword(senha, account.senha)) {
      return res.status(401).json({ erro: "Email ou senha incorretos" });
    }

    return res.json({
      token: createClanToken(account._id),
      account: publicAccount(account)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro ao entrar" });
  }
});

router.get("/me", requireClanAuth, (req, res) => {
  return res.json({ account: publicAccount(req.clanAccount) });
});

module.exports = router;
