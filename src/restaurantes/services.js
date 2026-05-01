const {
  ProdutoRestaurante,
  MovimentoEstoqueRestaurante,
  PedidoRestaurante
} = require("./models");

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function toMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function assertPositiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    const err = new Error(`${field} invalido`);
    err.status = 400;
    throw err;
  }
  return number;
}

async function nextPedidoNumero(restauranteId) {
  const ultimo = await PedidoRestaurante.findOne({ restauranteId }).sort({ numero: -1 });
  return (ultimo?.numero || 0) + 1;
}

async function resolveItens(restauranteId, itens) {
  if (!Array.isArray(itens) || itens.length === 0) {
    const err = new Error("Pedido sem itens");
    err.status = 400;
    throw err;
  }

  const resolvidos = [];

  for (const item of itens) {
    const qtd = assertPositiveNumber(item.qtd, "Quantidade");
    const produto = await ProdutoRestaurante.findOne({
      _id: item.produtoId,
      restauranteId,
      ativo: true
    });

    if (!produto) {
      const err = new Error("Produto nao encontrado");
      err.status = 404;
      throw err;
    }

    resolvidos.push({
      produto,
      item: {
        produtoId: produto._id.toString(),
        codigo: produto.codigo,
        nome: produto.nome,
        qtd,
        preco: toMoney(produto.preco),
        subtotal: toMoney(produto.preco * qtd)
      }
    });
  }

  return resolvidos;
}

async function baixarEstoque(restauranteId, itensResolvidos, origem, referenciaId) {
  for (const { produto, item } of itensResolvidos) {
    if (!produto.controlaEstoque) continue;

    if (produto.estoque < item.qtd) {
      const err = new Error(`Estoque insuficiente para ${produto.nome}`);
      err.status = 400;
      throw err;
    }

    const saldoAnterior = produto.estoque;
    produto.estoque = toMoney(produto.estoque - item.qtd);
    await produto.save();

    await MovimentoEstoqueRestaurante.create({
      restauranteId,
      produtoId: produto._id.toString(),
      tipo: "saida",
      quantidade: item.qtd,
      saldoAnterior,
      saldoAtual: produto.estoque,
      origem,
      referenciaId
    });
  }
}

async function ajustarEstoque(restauranteId, produtoId, quantidade, observacao) {
  const produto = await ProdutoRestaurante.findOne({ _id: produtoId, restauranteId });

  if (!produto) {
    const err = new Error("Produto nao encontrado");
    err.status = 404;
    throw err;
  }

  const novoSaldo = Number(quantidade);
  if (!Number.isFinite(novoSaldo) || novoSaldo < 0) {
    const err = new Error("Estoque invalido");
    err.status = 400;
    throw err;
  }

  const saldoAnterior = produto.estoque || 0;
  produto.estoque = toMoney(novoSaldo);
  produto.controlaEstoque = true;
  await produto.save();

  await MovimentoEstoqueRestaurante.create({
    restauranteId,
    produtoId: produto._id.toString(),
    tipo: "ajuste",
    quantidade: toMoney(novoSaldo - saldoAnterior),
    saldoAnterior,
    saldoAtual: produto.estoque,
    origem: "ajuste_manual",
    observacao
  });

  return produto;
}

async function dashboard(restauranteId) {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 1);

  const pedidosHoje = await PedidoRestaurante.find({
    restauranteId,
    createdAt: { $gte: inicio, $lt: fim }
  });

  const totalVendido = pedidosHoje
    .filter(p => p.status !== "Cancelado")
    .reduce((sum, p) => sum + Number(p.total || 0), 0);

  const contar = status => pedidosHoje.filter(p => p.status === status).length;

  return {
    pedidosHoje: pedidosHoje.length,
    totalVendido: toMoney(totalVendido),
    pendentes: contar("Novo"),
    emPreparo: contar("Em preparo"),
    entregues: contar("Entregue"),
    cancelados: contar("Cancelado")
  };
}

module.exports = {
  slugify,
  toMoney,
  assertPositiveNumber,
  nextPedidoNumero,
  resolveItens,
  baixarEstoque,
  ajustarEstoque,
  dashboard
};
