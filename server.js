const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

let restaurantesRouter = null;
let RestauranteConta = null;

try {
  restaurantesRouter = require("./src/restaurantes/routes");
  RestauranteConta = require("./src/restaurantes/models").RestauranteConta;
} catch (err) {
  console.warn("Modulo Cidio Restaurantes indisponivel:", err.message);
}

const app = express();
const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.MP_ACCESS_TOKEN ||
  "troque-este-segredo-em-producao";
const HASH_PREFIX = "pbkdf2";

function hashPassword(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto
    .pbkdf2Sync(String(senha), salt, iterations, 32, "sha256")
    .toString("hex");

  return `${HASH_PREFIX}$${iterations}$${salt}$${hash}`;
}

function verifyPassword(senha, saved) {
  if (!saved) return false;

  const parts = String(saved).split("$");

  if (parts[0] !== HASH_PREFIX || parts.length !== 4) {
    return String(senha) === String(saved);
  }

  const [, iterations, salt, expected] = parts;
  const hash = crypto
    .pbkdf2Sync(String(senha), salt, Number(iterations), 32, "sha256")
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

function passwordNeedsRehash(saved) {
  return !String(saved || "").startsWith(`${HASH_PREFIX}$`);
}

function createToken(id, tipo) {
  return jwt.sign({ sub: id.toString(), tipo }, JWT_SECRET, { expiresIn: "7d" });
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [tipo, token] = header.split(" ");

  return tipo === "Bearer" && token ? token : null;
}

function sanitizeAfiliado(afiliado) {
  if (!afiliado) return null;

  return {
    _id: afiliado._id,
    email: afiliado.email,
    telefone: afiliado.telefone,
    saldo: afiliado.saldo,
    pix: afiliado.pix,
    codigo: afiliado.codigo,
    status: afiliado.status
  };
}

app.use(express.json());
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "landing.html"));
});

app.get("/mercearias", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/restaurantes", (req, res) => {
  const file = path.join(__dirname, "public", "restaurantes", "index.html");

  if (!fs.existsSync(file)) {
    return res.status(503).send("Cidio Restaurantes nao esta disponivel neste deploy.");
  }

  res.sendFile(file);
});

app.get("/restaurantes/cardapio/:slug", (req, res) => {
  const file = path.join(__dirname, "public", "restaurantes", "cardapio.html");

  if (!fs.existsSync(file)) {
    return res.status(503).send("Cardapio do Cidio Restaurantes nao esta disponivel neste deploy.");
  }

  res.sendFile(file);
});

app.use("/restaurantes", express.static(path.join(__dirname, "public", "restaurantes")));

if (restaurantesRouter) {
  app.use("/restaurantes/api", restaurantesRouter);
} else {
  app.use("/restaurantes/api", (req, res) => {
    res.status(503).json({
      erro: "Modulo Cidio Restaurantes nao encontrado no deploy. Envie a pasta src/restaurantes."
    });
  });
}

// depois disso:
app.use(express.static(path.join(__dirname, "public")));

const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 8000
})
.then(() => console.log("ðŸŸ¢ Mongo conectado"))
.catch(err => console.log("âŒ Erro Mongo:", err));

/* =============================
   MODEL USER
============================= */

const User = mongoose.models.User || mongoose.model(
  "User",
  new mongoose.Schema({
    email: String,
    senha: String,

    afiliadoId: String, // ðŸ‘ˆ ADICIONA ISSO

    ultimoIP: String,
    cidade: String,
    pais: String,
    provedor: String,
    ultimoAcesso: Date,

    trialAtivo: Boolean,
    dataExpiracao: Date,
    primeiroPagamento: Boolean
  })
);

/* =============================
   MIDDLEWARE TENANT (CORRETO)
============================= */

app.use(async (req, res, next) => {
  // libera login e registro
 if (
  req.path === "/login" ||
  req.path === "/register" ||
  req.path === "/webhook" ||
  req.path === "/criar-pix" ||
  req.path.startsWith("/restaurantes") ||
  req.path.startsWith("/afiliado")
) {
  return next();
}

  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ erro: "UsuÃ¡rio nÃ£o identificado" });
  }

  let payload;

  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ erro: "Sessao invalida" });
  }

  if (payload.tipo !== "user") {
    return res.status(401).json({ erro: "Sessao invalida" });
  }

  req.tenantId = payload.sub;
  const user = await User.findById(payload.sub);

  if (!user) {
    return res.status(401).json({ erro: "UsuÃ¡rio invÃ¡lido" });
  }

  const hoje = new Date();

  if (user.dataExpiracao && hoje > user.dataExpiracao) {
    return res.status(403).json({ erro: "Plano vencido" });
  }

  req.user = user;
  next();
  
});
/* =============================
   MODELS (COM TENANT)
============================= */

const Afiliado = mongoose.model("Afiliado", new mongoose.Schema({
  email: String,
  telefone: String,
  senha: String,

  saldo: { type: Number, default: 0 },
  pix: String,

  codigo: String,

  status: { type: String, default: "pendente" }
}));

const Comissao = mongoose.model("Comissao", new mongoose.Schema({
  afiliadoId: String,
  userId: String, // ðŸ‘ˆ NOVO
  valor: Number,
  descricao: String,
  data: Date
}));
const Saque = mongoose.model("Saque", new mongoose.Schema({
  afiliadoId: String,
  valor: Number,
  status: { type: String, default: "pendente" },
  data: Date
}));
const Produto = mongoose.models.Produto || mongoose.model(
  "Produto",
  new mongoose.Schema({
    tenantId: String,
    nome: String,
    preco: Number,
    estoque: Number,
    codigo: String,
    tipo: String
  })
);

const Cliente = mongoose.models.Cliente || mongoose.model(
  "Cliente",
  new mongoose.Schema({
    tenantId: String,
    nome: String,
    telefone: String,
    cpf: String, // ðŸ”¥ NOVO
    limiteFiado: { type: Number, default: 0 }, // ðŸ”¥ NOVO
    fiado: Number
  })
);

const Fiado = mongoose.models.Fiado || mongoose.model(
  "Fiado",
  new mongoose.Schema({
    tenantId: String,
    data: String,
    clienteId: String,
    valor: Number,
    metodo: String,
   itens: Array // ðŸ‘ˆ ADICIONA ISSO
  })
);

const Venda = mongoose.models.Venda || mongoose.model(
  "Venda",
  new mongoose.Schema({
    tenantId: String,
    vendaId: String, // ðŸ”¥ ADICIONA ISSO
    data: String,
    clienteId: String,
    itens: Array,
    total: Number,
    desconto: Number,
    pagamentos: Array
  })
);

/* =============================
   AUTH
============================= */

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  const user = await User.findOne({ email });

  if (!user || !verifyPassword(senha, user.senha)) {
    return res.status(401).json({ erro: "Email ou senha incorretos" });
  }

  if (passwordNeedsRehash(user.senha)) {
    user.senha = hashPassword(senha);
  }

  // ðŸ”¥ PEGAR IP REAL
  const ipRaw =
  (req.headers["x-forwarded-for"] || "").split(",")[0] ||
  req.socket.remoteAddress ||
  "";

const ip = ipRaw.replace("::ffff:", "").trim();

let cidade = "";
let pais = "";
let provedor = "";

try {
  const geo = await axios.get(`http://ip-api.com/json/${ip}`, {
    timeout: 2000
  });

  cidade = geo.data.city;
  pais = geo.data.country;
  provedor = geo.data.isp;

} catch (e) {
  console.log("IP API falhou, seguindo login...");
}

if (ip) user.ultimoIP = ip;
if (cidade) user.cidade = cidade;
if (pais) user.pais = pais;
if (provedor) user.provedor = provedor;

user.ultimoAcesso = new Date();

await user.save();


  res.json({
    userId: user._id,
    token: createToken(user._id, "user")
  });
});

app.post("/afiliado/register", async (req, res) => {
  const { email, telefone, senha } = req.body;

  const existe = await Afiliado.findOne({ email });

  if (existe) {
    return res.json({ erro: "Email jÃ¡ cadastrado" });
  }

  function gerarCodigo() {
    return Math.random().toString(36).substring(2, 8);
  }

  const afiliado = new Afiliado({
    email,
    telefone,
    senha: hashPassword(senha),
    codigo: gerarCodigo(),
    status: "pendente"
  });

  await afiliado.save();

  res.json({ ok: true });
});

app.post("/afiliado/login", async (req, res) => {
  const { email, senha } = req.body;

  const afiliado = await Afiliado.findOne({ email });

  if (!afiliado || !verifyPassword(senha, afiliado.senha)) {
    return res.json({ erro: "Login invÃ¡lido" });
  }

  if (passwordNeedsRehash(afiliado.senha)) {
    afiliado.senha = hashPassword(senha);
    await afiliado.save();
  }

  if (afiliado.status !== "aprovado") {
    return res.json({ erro: "Conta em anÃ¡lise" });
  }

  res.json({
    afiliadoId: afiliado._id,
    token: createToken(afiliado._id, "afiliado")
  });
});

app.use("/afiliado", async (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ erro: "Afiliado nao identificado" });
  }

  let payload;

  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ erro: "Sessao invalida" });
  }

  if (payload.tipo !== "afiliado") {
    return res.status(401).json({ erro: "Sessao invalida" });
  }

  const afiliado = await Afiliado.findById(payload.sub);

  if (!afiliado || afiliado.status !== "aprovado") {
    return res.status(401).json({ erro: "Afiliado invalido" });
  }

  req.afiliado = afiliado;
  next();
});

app.get("/afiliado/dados", async (req, res) => {
  res.json(sanitizeAfiliado(req.afiliado));
});

app.get("/afiliado/comissoes", async (req, res) => {
  const id = req.afiliado._id.toString();

 const lista = await Comissao
  .find({ afiliadoId: id })
  .sort({ data: -1 });

  res.json(lista);
});

app.get("/afiliado/saques", async (req, res) => {
  const id = req.afiliado._id.toString();

  const lista = await Saque.find({ afiliadoId: id })
    .sort({ data: -1 });

  const totalSacado = lista
    .filter(s => s.status === "pago")
    .reduce((acc, s) => acc + s.valor, 0);

  res.json({
    saques: lista,
    totalSacado
  });
});
app.post("/afiliado/sacar", async (req, res) => {
  const id = req.afiliado._id.toString();
  const afiliado = req.afiliado;

  if (!afiliado || afiliado.saldo < 10) {
    return res.status(400).json({ erro: "MÃ­nimo R$10" });
  }

  const pendente = await Saque.findOne({
    afiliadoId: id,
    status: "pendente"
  });

  if (pendente) {
    return res.json({ erro: "JÃ¡ existe saque pendente" });
  }

  await Saque.create({
    afiliadoId: id,
    valor: afiliado.saldo,
    data: new Date()
  });

  res.json({ ok: true });
});
app.post("/afiliado/pix", async (req, res) => {
  const { pix } = req.body;

  const afiliado = req.afiliado;

  afiliado.pix = pix;
  await afiliado.save();

  res.json({ ok: true });
});

app.get("/admin/afiliados", async (req, res) => {
  const userId = req.user?._id;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const afiliados = await Afiliado.find().select("-senha");
  const hoje = new Date();

  const resultado = [];

  for (const a of afiliados) {
    const ativos = await User.countDocuments({
      afiliadoId: a._id.toString(),
      dataExpiracao: { $gt: hoje }
    });

    const pagos = await Saque.find({
      afiliadoId: a._id.toString(),
      status: "pago"
    });

    const totalPago = pagos.reduce((acc, s) => acc + s.valor, 0);

    resultado.push({
      ...a._doc,
      clientesAtivos: ativos,
      totalPago
    });
  }

  res.json(resultado);
});

app.post("/admin/aprovar-afiliado", async (req, res) => {
  const userId = req.user?._id;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const { id } = req.body;

  const afiliado = await Afiliado.findById(id);

  afiliado.status = "aprovado";

  await afiliado.save();

  res.json({ ok: true });
});

app.post("/admin/recusar-afiliado", async (req, res) => {
  const userId = req.user?._id;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const { id } = req.body;

  await Afiliado.findByIdAndDelete(id);

  res.json({ ok: true });
});
app.get("/admin/saques", async (req, res) => {
  const userId = req.user?._id;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const lista = await Saque.find().sort({ data: -1 });

  const resultado = [];

  for (const s of lista) {
    const afiliado = await Afiliado.findById(s.afiliadoId);

    resultado.push({
      ...s._doc,
      email: afiliado?.email,
      pix: afiliado?.pix
    });
  }

  res.json(resultado);
});
app.post("/admin/confirmar-saque", async (req, res) => {
  const userId = req.user?._id;

  if (!(await isAdmin(userId))) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const { id } = req.body;

  const saque = await Saque.findById(id);

  if (!saque || saque.status !== "pendente") return;

  const afiliado = await Afiliado.findById(saque.afiliadoId);

  if (afiliado) {
   afiliado.saldo = Math.max(0, afiliado.saldo - saque.valor);
    await afiliado.save();
  }

  saque.status = "pago";
  await saque.save();

  res.json({ ok: true });
});
app.get("/afiliado/stats", async (req, res) => {
  const id = req.afiliado._id.toString();

  const hoje = new Date();

  const ativos = await User.countDocuments({
    afiliadoId: id,
    dataExpiracao: { $gt: hoje }
  });

  const saques = await Saque.find({ afiliadoId: id });

  const totalSacado = saques
    .filter(s => s.status === "pago")
    .reduce((acc, s) => acc + s.valor, 0);

  res.json({
    clientesAtivos: ativos,
    totalSacado
  });
});

app.post("/register", async (req, res) => {
 const { email, senha, ref } = req.body;
 
 let afiliado = null;

if (ref) {
  afiliado = await Afiliado.findOne({ codigo: ref });
}

  const existe = await User.findOne({ email });

  if (existe) {
    return res.status(400).json({ erro: "UsuÃ¡rio jÃ¡ existe" });
  }

  const hoje = new Date();

  const user = new User({
    email,
    senha: hashPassword(senha),
    trialAtivo: true,
    primeiroPagamento: false,
    dataExpiracao: new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000),
    afiliadoId: afiliado ? afiliado._id : null
  });

  await user.save();

  res.json({ ok: true });
});

/* =============================
   ROTA USER (NOVO)
============================= */

app.get("/user", async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ erro: "Sem userId" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ erro: "UsuÃ¡rio nÃ£o encontrado" });
    }
    res.json({
      email: user.email,
      dataExpiracao: user.dataExpiracao,
      trialAtivo: user.trialAtivo
      
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar usuÃ¡rio" });
  }
});
/* =============================
   ROTAS PRODUTOS
============================= */

app.get("/produtos", async (req, res) => {
  const produtos = await Produto.find({ tenantId: req.tenantId });
  res.json(produtos);
});

app.post("/produtos", async (req, res) => {
  const produto = new Produto({
    ...req.body,
    tenantId: req.tenantId
  });

  await produto.save();
  res.json(produto);
});

app.delete("/produtos/:id", async (req, res) => {
  await Produto.deleteOne({
    _id: req.params.id,
    tenantId: req.tenantId
  });

  res.json({ status: "ok" });
});

/* =============================
   ROTAS CLIENTES
============================= */

app.get("/clientes", async (req, res) => {
  const clientes = await Cliente.find({ tenantId: req.tenantId });
  res.json(clientes);
});

app.post("/clientes", async (req, res) => {
  const cliente = new Cliente({
    ...req.body,
    tenantId: req.tenantId
  });

  await cliente.save();
  res.json(cliente);
});

app.delete("/clientes/:id", async (req, res) => {
  try {

    // ðŸ” busca cliente
    const cliente = await Cliente.findOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    if (!cliente) {
      return res.status(404).json({ erro: "Cliente nÃ£o encontrado" });
    }

    // ðŸ”¥ CALCULA DÃVIDA
    const divida = await Fiado.aggregate([
      {
        $match: {
          clienteId: cliente._id.toString(),
          tenantId: req.tenantId
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$valor" }
        }
      }
    ]);

    const totalDivida = divida[0]?.total || 0;

    // ðŸš« BLOQUEIA EXCLUSÃƒO
    if (totalDivida > 0) {
      return res.status(400).json({
        erro: "Cliente possui dÃ­vida e nÃ£o pode ser excluÃ­do"
      });
    }

    // ðŸ—‘ï¸ DELETE NORMAL
    await Cliente.deleteOne({
      _id: req.params.id,
      tenantId: req.tenantId
    });

    res.json({ status: "ok" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao excluir cliente" });
  }
});
app.put("/clientes/:id", async (req, res) => {
  try {

    const cliente = await Cliente.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.tenantId
      },
      {
        nome: req.body.nome,
        telefone: req.body.telefone,
        cpf: req.body.cpf,
        limiteFiado: req.body.limiteFiado
      },
      { new: true }
    );

    if (!cliente) {
      return res.status(404).json({ erro: "Cliente nÃ£o encontrado" });
    }

    res.json(cliente);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao atualizar cliente" });
  }
});

/* =============================
   ROTAS FIADOS
============================= */

app.get("/fiados", async (req, res) => {
  const fichas = await Fiado.find({ tenantId: req.tenantId });
  res.json(fichas);
});

app.post("/fiados/compra", async (req, res) => {
 
const cliente = await Cliente.findOne({
  _id: req.body.clienteId,
  tenantId: req.tenantId
  
});
if (!cliente) {
  return res.status(404).json({ erro: "Cliente nÃ£o encontrado" });
}

const valorFiado = Number(req.body.valor);

if (!Number.isFinite(valorFiado) || valorFiado <= 0) {
  return res.status(400).json({ erro: "Valor invalido" });
}


const divida = await Fiado.aggregate([
  {
    $match: {
      clienteId: req.body.clienteId,
      tenantId: req.tenantId
    }
  },
  {
    $group: {
      _id: null,
      total: { $sum: "$valor" }
    }
  }
]);

const atual = divida[0]?.total || 0;
const limite = cliente.limiteFiado || 0;

if (atual + valorFiado > limite) {
  return res.status(400).json({
    erro: "Limite de fiado excedido"
  });
 
}
const registro = new Fiado({
  tenantId: req.tenantId,
  data: req.body.data || new Date().toLocaleString("pt-br"),
  clienteId: req.body.clienteId,
  valor: valorFiado,
  metodo: "Fiado",
  itens: req.body.itens || []
});
  await registro.save();
  res.json(registro);
});

app.post("/fiados/pagamento", async (req, res) => {
  const agora = new Date().toLocaleString("pt-br");
  const valorPagamento = Number(req.body.valor);

  // ðŸ”¥ valida cliente
  const cliente = await Cliente.findOne({
    _id: req.body.clienteId,
    tenantId: req.tenantId
  });

  if (!cliente) {
    return res.status(404).json({ erro: "Cliente nÃ£o encontrado" });
  }

  // ðŸ”¥ valida valor
  if (!Number.isFinite(valorPagamento) || valorPagamento <= 0) {
    return res.status(400).json({ erro: "Valor invÃ¡lido" });
  }

  // âœ… cria registro
  const registro = new Fiado({
    tenantId: req.tenantId,
    data: agora,
    clienteId: req.body.clienteId,
    valor: -valorPagamento,
    metodo: "Pagamento Parcial"
  });

  await registro.save();
  res.json(registro);
});

app.delete("/fiados", async (req, res) => {
  await Fiado.deleteMany({ tenantId: req.tenantId });
  res.json({ status: "ok" });
});

/* =============================
   ROTAS VENDAS
============================= */

app.get("/vendas", async (req, res) => {
  const vendas = await Venda.find({ tenantId: req.tenantId });
  res.json(vendas);
});

app.post("/vendas", async (req, res) => {
  const { vendaId } = req.body;

if (vendaId) {
  const existente = await Venda.findOne({
    tenantId: req.tenantId,
    vendaId: vendaId
  });

  if (existente) {
    return res.status(409).json({ 
      erro: "Venda duplicada" 
    });
  }
}

  try {
    const { itens, clienteId, data, desconto, pagamentos } = req.body;
    const cliente = clienteId || req.body.cliente;

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Venda sem itens" });
    }

    let totalCalculado = 0;

    const estoqueAtivado = req.headers["x-estoque"] === "true";
    const pagamentoFiado = (pagamentos || []).find(p => p.tipo === "fiado" || p.metodo === "Fiado");
    const valorFiadoVenda = pagamentoFiado ? Number(pagamentoFiado.valor) : 0;

    if (pagamentoFiado && (!Number.isFinite(valorFiadoVenda) || valorFiadoVenda <= 0)) {
      return res.status(400).json({ erro: "Valor de fiado invalido" });
    }

    if (pagamentoFiado && valorFiadoVenda > 0) {
      if (!cliente || cliente === "Consumidor Final") {
        return res.status(400).json({
          erro: "Cliente obrigatorio para venda fiado"
        });
      }

      const clienteFiado = await Cliente.findOne({
        _id: cliente,
        tenantId: req.tenantId
      });

      if (!clienteFiado) {
        return res.status(404).json({ erro: "Cliente nao encontrado" });
      }

      const divida = await Fiado.aggregate([
        {
          $match: {
            clienteId: cliente,
            tenantId: req.tenantId
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$valor" }
          }
        }
      ]);

      const atual = divida[0]?.total || 0;
      const limite = clienteFiado.limiteFiado || 0;

      if (atual + valorFiadoVenda > limite) {
        return res.status(400).json({
          erro: "Limite de fiado excedido"
        });
      }
    }

for (const item of itens) {
  const qtd = Number(item.qtd);

  if (!item.cod || !Number.isFinite(qtd) || qtd <= 0) {
    return res.status(400).json({
      erro: "Item invalido na venda"
    });
  }

  item.qtd = qtd;

  let produto;

  if (estoqueAtivado) {

    produto = await Produto.findOneAndUpdate(
      {
        codigo: item.cod,
        tenantId: req.tenantId,
        estoque: { $gte: qtd }
      },
      {
        $inc: { estoque: -qtd }
      },
      { new: true }
    );

    if (!produto) {
      return res.status(400).json({
        erro: `Estoque insuficiente para produto ${item.cod}`
      });
    }

  } else {

    produto = await Produto.findOne({
      codigo: item.cod,
      tenantId: req.tenantId
    });

    if (!produto) {
      return res.status(400).json({
        erro: `Produto nÃ£o encontrado ${item.cod}`
      });
    }

  }

  totalCalculado += produto.preco * qtd;
}

    const venda = new Venda({
      vendaId: req.body.vendaId,
      tenantId: req.tenantId,
      data,
      clienteId: cliente,
      itens,
      total: totalCalculado,
      desconto: desconto || 0,
      pagamentos: pagamentos || []
    });

    await venda.save();
if (pagamentoFiado && valorFiadoVenda > 0) {


  await Fiado.create({
    tenantId: req.tenantId,
    clienteId: cliente, // precisa ser ID
    valor: valorFiadoVenda,
    metodo: "Fiado",
    data: new Date().toLocaleString("pt-br"),
    itens: itens
  });


}

    res.json(venda);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao processar venda" });
  }
});
app.delete("/vendas", async (req, res) => {
  await Venda.deleteMany({ tenantId: req.tenantId });
  res.json({ status: "ok" });
});

app.post("/criar-pix", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ erro: "Email obrigatÃ³rio" });
    }

    // ðŸ”¥ BUSCA USUÃRIO
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ erro: "UsuÃ¡rio nÃ£o encontrado" });
    }

    // ðŸ§  REGRA DE PREÃ‡O
    let valor = 29;

    if (!user.primeiroPagamento) {
      valor = 19;
    }

    console.log("ðŸ’° VALOR COBRADO:", valor);

    const response = await axios.post(
  "https://api.mercadopago.com/v1/payments",
  {
    transaction_amount: Number(valor),
    description: "Assinatura Sistema",
    payment_method_id: "pix",

    payer: {
      email: email,
      first_name: "Cliente",
      last_name: "Sistema",
      identification: {
        type: "CPF",
        number: "19119119100"
      }
    },

    // ðŸ”¥ ESSENCIAL
    notification_url: "https://www.cidio.com.br/webhook",
    external_reference: user._id.toString(),
    
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": Date.now().toString()
    }
  }
);

    const pagamento = response.data;

    console.log("RESPOSTA MP:", JSON.stringify(pagamento, null, 2));

    const dados = pagamento.point_of_interaction?.transaction_data;

    if (!dados || !dados.qr_code || !dados.qr_code_base64) {
      console.log("ERRO MP COMPLETO:", pagamento);

      return res.status(500).json({
        erro: "Mercado Pago nÃ£o retornou QR completo",
        detalhes: pagamento
      });
    }

    res.json({
      qr_code: dados.qr_code,
      qr_code_base64: dados.qr_code_base64,
      valor // ðŸ‘ˆ ENVIA PRO FRONT
    });

  } catch (err) {
    console.error("ERRO PIX:", err.response?.data || err);
    res.status(500).json({ erro: "Erro ao gerar PIX" });
  }
});

app.get("/webhook", (req, res) => {
  res.send("Webhook ativo ðŸš€");
});

app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (!data || !data.data || !data.data.id) {
      return res.sendStatus(200);
    }

    const paymentId = data.data.id;

    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    const pagamento = response.data;

    console.log("ðŸ”¥ WEBHOOK:", pagamento.status);

    if (
      pagamento.status === "approved" &&
      pagamento.payment_method_id === "pix"
    ) {
      const userId = pagamento.external_reference;

      if (String(userId || "").startsWith("restaurante:")) {
        if (!RestauranteConta) {
          console.warn("Pagamento restaurante recebido, mas modulo Restaurantes nao esta disponivel.");
          return res.sendStatus(200);
        }

        const restauranteId = String(userId).replace("restaurante:", "");
        const restaurante = await RestauranteConta.findById(restauranteId);

        if (restaurante) {
          const hoje = new Date();
          const base = restaurante.dataExpiracao && restaurante.dataExpiracao > hoje
            ? restaurante.dataExpiracao
            : hoje;

          restaurante.dataExpiracao = new Date(
            base.getTime() + 30 * 24 * 60 * 60 * 1000
          );
          restaurante.planoAtivo = true;
          restaurante.primeiroPagamento = true;
          await restaurante.save();
          console.log("Plano restaurante atualizado:", restaurante.nomeRestaurante);
        }

        return res.sendStatus(200);
      }

      const user = await User.findById(userId);

      if (user) {
        const hoje = new Date();

        // ðŸ”¥ SOMA (PROFISSIONAL)
        const base = user.dataExpiracao && user.dataExpiracao > hoje
          ? user.dataExpiracao
          : hoje;

        user.dataExpiracao = new Date(
          base.getTime() + 30 * 24 * 60 * 60 * 1000
        );

        user.trialAtivo = false;
        user.primeiroPagamento = true;

        await user.save();
        if (user.afiliadoId) {
  const afiliado = await Afiliado.findById(user.afiliadoId);

  if (afiliado) {

    const jaExiste = await Comissao.findOne({
      afiliadoId: afiliado._id,
      userId: user._id
    });

    if (!jaExiste) {
      afiliado.saldo += 5;

      await afiliado.save();

      await Comissao.create({
        afiliadoId: afiliado._id,
        userId: user._id,
        valor: 5,
        descricao: "Cliente pagou plano",
        data: new Date()
      });
    }
  }
}

        console.log("âœ… Plano atualizado:", user.dataExpiracao);
      } else {
        console.log("âŒ UsuÃ¡rio nÃ£o encontrado:", userId);
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("Erro webhook:", err);
    res.sendStatus(500);
  }
});
async function isAdmin(userId) {
  const user = await User.findById(userId);
  return user && user.email === process.env.ADMIN_EMAIL;
}
app.get("/admin/users", async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!(await isAdmin(userId))) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    const users = await User.find().select("-senha");

    res.json(users);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar usuÃ¡rios" });
  }
});
app.post("/admin/liberar", async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!(await isAdmin(userId))) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    const { id } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ erro: "UsuÃ¡rio nÃ£o encontrado" });
    }

    const hoje = new Date();

    const base = user.dataExpiracao && user.dataExpiracao > hoje
      ? user.dataExpiracao
      : hoje;

    user.dataExpiracao = new Date(
      base.getTime() + 30 * 24 * 60 * 60 * 1000
    );

    await user.save();

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao liberar plano" });
  }
});

/* =============================
   SERVER
============================= */

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("ðŸš€ Servidor rodando na porta " + PORT);
});
