const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
const axios = require("axios");

const app = express();

app.use(express.json());
// 🔥 FORÇA IR PRO LOGIN
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// depois disso:
app.use(express.static(path.join(__dirname, "public")));

const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
.then(() => console.log("🟢 Mongo conectado"))
.catch(err => console.log("❌ Erro Mongo:", err));

/* =============================
   MODEL USER
============================= */

const User = mongoose.models.User || mongoose.model(
  "User",
  new mongoose.Schema({
    email: String,
    senha: String,

    afiliadoId: String, // 👈 ADICIONA ISSO

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
  req.path === "/user" ||
  req.path.startsWith("/afiliado")
) {
  return next();
}

  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(401).json({ erro: "Usuário não identificado" });
  }

  req.tenantId = userId;
  const user = await User.findById(userId);

  if (!user) {
    return res.status(401).json({ erro: "Usuário inválido" });
  }

  const hoje = new Date();

  if (user.dataExpiracao && hoje > user.dataExpiracao) {
    return res.status(403).json({ erro: "Plano vencido" });
  }

  
  
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
  userId: String, // 👈 NOVO
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
    cpf: String, // 🔥 NOVO
    limiteFiado: { type: Number, default: 0 }, // 🔥 NOVO
    fiado: Number
  })
);

const Fiado = mongoose.models.Fiado || mongoose.model(
  "Fiado",
  new mongoose.Schema({
    tenantId: String,
    data: String,
    cliente: String,
    valor: Number,
    metodo: String,
   itens: Array // 👈 ADICIONA ISSO
  })
);

const Venda = mongoose.models.Venda || mongoose.model(
  "Venda",
  new mongoose.Schema({
    tenantId: String,
    vendaId: String, // 🔥 ADICIONA ISSO
    data: String,
    cliente: String,
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

  if (!user || user.senha !== senha) {
    return res.status(401).json({ erro: "Email ou senha incorretos" });
  }

  // 🔥 PEGAR IP REAL
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


  res.json({ userId: user._id });
});

app.post("/afiliado/register", async (req, res) => {
  const { email, telefone, senha } = req.body;

  const existe = await Afiliado.findOne({ email });

  if (existe) {
    return res.json({ erro: "Email já cadastrado" });
  }

  function gerarCodigo() {
    return Math.random().toString(36).substring(2, 8);
  }

  const afiliado = new Afiliado({
    email,
    telefone,
    senha,
    codigo: gerarCodigo(),
    status: "pendente"
  });

  await afiliado.save();

  res.json({ ok: true });
});

app.post("/afiliado/login", async (req, res) => {
  const { email, senha } = req.body;

  const afiliado = await Afiliado.findOne({ email });

  if (!afiliado || afiliado.senha !== senha) {
    return res.json({ erro: "Login inválido" });
  }

  if (afiliado.status !== "aprovado") {
    return res.json({ erro: "Conta em análise" });
  }

  res.json({ afiliadoId: afiliado._id });
});

app.get("/afiliado/dados", async (req, res) => {
  const id = req.headers["x-afiliado-id"];

  const afiliado = await Afiliado.findById(id);

  res.json(afiliado);
});

app.get("/afiliado/comissoes", async (req, res) => {
  const id = req.headers["x-afiliado-id"];

 const lista = await Comissao
  .find({ afiliadoId: id })
  .sort({ data: -1 });

  res.json(lista);
});

app.get("/afiliado/saques", async (req, res) => {
  const id = req.headers["x-afiliado-id"];

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
  const id = req.headers["x-afiliado-id"];

  const afiliado = await Afiliado.findById(id);

  if (!afiliado || afiliado.saldo < 10) {
    return res.status(400).json({ erro: "Mínimo R$10" });
  }

  const pendente = await Saque.findOne({
    afiliadoId: id,
    status: "pendente"
  });

  if (pendente) {
    return res.json({ erro: "Já existe saque pendente" });
  }

  await Saque.create({
    afiliadoId: id,
    valor: afiliado.saldo,
    data: new Date()
  });

  res.json({ ok: true });
});
app.post("/afiliado/pix", async (req, res) => {
  const id = req.headers["x-afiliado-id"];
  const { pix } = req.body;

  const afiliado = await Afiliado.findById(id);

  afiliado.pix = pix;
  await afiliado.save();

  res.json({ ok: true });
});

app.get("/admin/afiliados", async (req, res) => {
  const userId = req.headers["x-user-id"];

  if (!(await isAdmin(userId))) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const afiliados = await Afiliado.find();
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
  const userId = req.headers["x-user-id"];

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
  const userId = req.headers["x-user-id"];

  if (!(await isAdmin(userId))) {
    return res.status(403).json({ erro: "Acesso negado" });
  }

  const { id } = req.body;

  await Afiliado.findByIdAndDelete(id);

  res.json({ ok: true });
});
app.get("/admin/saques", async (req, res) => {
  const userId = req.headers["x-user-id"];

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
  const userId = req.headers["x-user-id"];

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
  const id = req.headers["x-afiliado-id"];

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
    return res.status(400).json({ erro: "Usuário já existe" });
  }

  const hoje = new Date();

  const user = new User({
    email,
    senha,
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
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res.status(401).json({ erro: "Sem userId" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }
    console.log("USER ENVIADO:", user);

    res.json({
      email: user.email,
      dataExpiracao: user.dataExpiracao,
      trialAtivo: user.trialAtivo
      
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar usuário" });
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
  await Cliente.deleteOne({
    _id: req.params.id,
    tenantId: req.tenantId
  });

  res.json({ status: "ok" });
});

/* =============================
   ROTAS FIADOS
============================= */

app.get("/fiados", async (req, res) => {
  const fichas = await Fiado.find({ tenantId: req.tenantId });
  res.json(fichas);
});

app.post("/fiados/compra", async (req, res) => {
  const registro = new Fiado({
    tenantId: req.tenantId,
    data: req.body.data || new Date().toLocaleString("pt-br"),
    cliente: req.body.cliente,
    valor: req.body.valor,
    metodo: "Fiado",
    itens: req.body.itens || [] // 👈 AQUI
  });

  await registro.save();
  res.json(registro);
});

app.post("/fiados/pagamento", async (req, res) => {
  const agora = new Date().toLocaleString("pt-br");

  const registro = new Fiado({
    tenantId: req.tenantId,
    data: agora,
    cliente: req.body.cliente,
    valor: req.body.valor,
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
    const { itens, cliente, data, desconto, pagamentos } = req.body;

    let totalCalculado = 0;

    for (const item of itens) {

  const produto = await Produto.findOneAndUpdate(
    {
      codigo: item.cod,
      tenantId: req.tenantId,
      estoque: { $gte: item.qtd } // 🔥 garante estoque suficiente
    },
    {
      $inc: { estoque: -item.qtd }
    },
    { new: true }
  );

  if (!produto) {
    return res.status(400).json({
      erro: `Estoque insuficiente para produto ${item.cod}`
    });
  }

  totalCalculado += produto.preco * item.qtd;
}

    const venda = new Venda({
      vendaId: req.body.vendaId,
      tenantId: req.tenantId,
      data,
      cliente,
      itens,
      total: totalCalculado,
      desconto: desconto || 0,
      pagamentos: pagamentos || []
    });

    await venda.save();

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
      return res.status(400).json({ erro: "Email obrigatório" });
    }

    // 🔥 BUSCA USUÁRIO
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    // 🧠 REGRA DE PREÇO
    let valor = 29;

    if (!user.primeiroPagamento) {
      valor = 19;
    }

    console.log("💰 VALOR COBRADO:", valor);

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

    // 🔥 ESSENCIAL
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
        erro: "Mercado Pago não retornou QR completo",
        detalhes: pagamento
      });
    }

    res.json({
      qr_code: dados.qr_code,
      qr_code_base64: dados.qr_code_base64,
      valor // 👈 ENVIA PRO FRONT
    });

  } catch (err) {
    console.error("ERRO PIX:", err.response?.data || err);
    res.status(500).json({ erro: "Erro ao gerar PIX" });
  }
});

app.get("/webhook", (req, res) => {
  res.send("Webhook ativo 🚀");
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

    console.log("🔥 WEBHOOK:", pagamento.status);

    if (
      pagamento.status === "approved" &&
      pagamento.payment_method_id === "pix"
    ) {
      const userId = pagamento.external_reference;

      const user = await User.findById(userId);

      if (user) {
        const hoje = new Date();

        // 🔥 SOMA (PROFISSIONAL)
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

        console.log("✅ Plano atualizado:", user.dataExpiracao);
      } else {
        console.log("❌ Usuário não encontrado:", userId);
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
    const userId = req.headers["x-user-id"];

    if (!(await isAdmin(userId))) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    const users = await User.find().select("-senha");

    res.json(users);

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: "Erro ao buscar usuários" });
  }
});
app.post("/admin/liberar", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];

    if (!(await isAdmin(userId))) {
      return res.status(403).json({ erro: "Acesso negado" });
    }

    const { id } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
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
  console.log("🚀 Servidor rodando na porta " + PORT);
});