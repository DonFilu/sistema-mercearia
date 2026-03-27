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
   MIDDLEWARE TENANT (BASE)
============================= */

// ⚠️ IMPORTANTE
// (apague daqui até aqui depois quando tiver login real)
app.use((req, res, next) => {
  req.tenantId = "default";
  next();
});
// (apague daqui até aqui depois quando tiver login real)

/* =============================
   MODELS (COM TENANT)
============================= */

const Produto = mongoose.model(
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

const Cliente = mongoose.model(
  "Cliente",
  new mongoose.Schema({
    tenantId: String,
    nome: String,
    telefone: String,
    fiado: Number
  })
);

const Fiado = mongoose.model(
  "Fiado",
  new mongoose.Schema({
    tenantId: String,
    data: String,
    cliente: String,
    valor: Number,
    metodo: String
  })
);

const Venda = mongoose.model(
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
    metodo: "Fiado"
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
  const venda = new Venda({
    tenantId: req.tenantId,
    data: req.body.data,
    cliente: req.body.cliente,
    itens: req.body.itens || [],
    total: req.body.total || 0,
    desconto: req.body.desconto || 0,
    pagamentos: req.body.pagamentos || []
  });

  await venda.save();
  res.json(venda);
});

app.delete("/vendas", async (req, res) => {
  await Venda.deleteMany({ tenantId: req.tenantId });
  res.json({ status: "ok" });
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