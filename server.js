const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.json());
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
  req.path === "/webhook"
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

  // 🔥 LOGIN DA SUA MÃE
  if (email === "mwvariedades" && senha === "960080") {
    return res.json({ userId: "mae" });
  }

  const user = await User.findOne({ email });

  if (!user || user.senha !== senha) {
    return res.status(401).json({ erro: "Email ou senha incorretos" });
  }

  res.json({ userId: user._id });
});

app.post("/register", async (req, res) => {
  const { email, senha } = req.body;

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
    dataExpiracao: new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)
  });

  await user.save();

  res.json({ ok: true });
});

/* =============================
   ROTA USER (NOVO)
============================= */

app.get("/user", async (req, res) => {
  try {
    const user = await User.findById(req.tenantId);

    if (!user) {
      return res.status(404).json({ erro: "Usuário não encontrado" });
    }

    res.json({
  email: user.email,
  dataExpiracao: user.dataExpiracao,
  trialAtivo: user.trialAtivo
});
  } catch (err) {
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
  try {
    const { itens, cliente, data, desconto, pagamentos } = req.body;

    let totalCalculado = 0;

    for (const item of itens) {
      const produto = await Produto.findOne({
        codigo: item.cod,
        tenantId: req.tenantId
      });

      if (!produto) {
        return res.status(400).json({ erro: `Produto não encontrado: ${item.cod}` });
      }

      if (produto.estoque < item.qtd) {
        return res.status(400).json({
          erro: `Estoque insuficiente para ${produto.nome}`
        });
      }

      // soma total real
      totalCalculado += produto.preco * item.qtd;

      // 🔥 baixa estoque AQUI (CORRETO)
      produto.estoque -= item.qtd;
      await produto.save();
    }

    const venda = new Venda({
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

const axios = require("axios");

app.post("/criar-pix", async (req, res) => {
  try {
    const { valor, email } = req.body;

    const response = await axios.post(
      "https://api.mercadopago.com/v1/payments",
      {
        transaction_amount: valor,
        description: "Assinatura Sistema",
        payment_method_id: "pix",
        payer: {
          email: email
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    const dados = response.data.point_of_interaction.transaction_data;

    res.json({
      qr_code: dados.qr_code,
      qr_code_base64: dados.qr_code_base64
    });

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ erro: "Erro ao gerar PIX" });
  }
});
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (data.type === "payment") {
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

      if (pagamento.status === "approved") {
        const email = pagamento.payer.email;

        const user = await User.findOne({ email });

        if (user) {
          const hoje = new Date();

          user.dataExpiracao = new Date(
            hoje.getTime() + 30 * 24 * 60 * 60 * 1000
          );

          user.trialAtivo = false;
          user.primeiroPagamento = true;

          await user.save();

          console.log("✅ Usuário liberado:", email);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro webhook:", err);
    res.sendStatus(500);
  }
});

/* =============================
   FRONTEND
============================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* =============================
   SERVER
============================= */

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta " + PORT);
});