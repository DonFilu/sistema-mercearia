const mongoose = require("mongoose");

const RestauranteConta = mongoose.models.RestauranteConta || mongoose.model(
  "RestauranteConta",
  new mongoose.Schema(
    {
      tipoSistema: { type: String, default: "restaurante", index: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      senha: { type: String, required: true },
      nomeRestaurante: { type: String, required: true },
      slug: { type: String, required: true, unique: true, index: true },
      telefone: String,
      whatsapp: String,
      logo: String,
      horarioFuncionamento: String,
      tempoMedioPreparo: { type: Number, default: 30 },
      pedidoMinimo: { type: Number, default: 0 },
      formasPagamento: { type: [String], default: ["Dinheiro", "Pix", "Cartao"] },
      chavePix: String,
      mensagemPedidoRecebido: {
        type: String,
        default: "Recebemos seu pedido e vamos iniciar o preparo."
      },
      aberto: { type: Boolean, default: true },
      planoAtivo: { type: Boolean, default: true },
      dataExpiracao: Date,
      primeiroPagamento: { type: Boolean, default: false }
    },
    { timestamps: true }
  )
);

const CategoriaRestaurante = mongoose.models.CategoriaRestaurante || mongoose.model(
  "CategoriaRestaurante",
  new mongoose.Schema(
    {
      restauranteId: { type: String, required: true, index: true },
      nome: { type: String, required: true },
      ordem: { type: Number, default: 0 },
      ativo: { type: Boolean, default: true }
    },
    { timestamps: true }
  )
);

const ProdutoRestaurante = mongoose.models.ProdutoRestaurante || mongoose.model(
  "ProdutoRestaurante",
  new mongoose.Schema(
    {
      restauranteId: { type: String, required: true, index: true },
      nome: { type: String, required: true },
      descricao: String,
      categoriaId: String,
      codigo: String,
      preco: { type: Number, required: true },
      foto: String,
      ativo: { type: Boolean, default: true },
      controlaEstoque: { type: Boolean, default: false },
      estoque: { type: Number, default: 0 },
      estoqueMinimo: { type: Number, default: 0 }
    },
    { timestamps: true }
  )
);

const BairroEntregaRestaurante = mongoose.models.BairroEntregaRestaurante || mongoose.model(
  "BairroEntregaRestaurante",
  new mongoose.Schema(
    {
      restauranteId: { type: String, required: true, index: true },
      nome: { type: String, required: true },
      valorEntrega: { type: Number, default: 0 },
      tempoEstimado: String,
      ativo: { type: Boolean, default: true }
    },
    { timestamps: true }
  )
);

const PedidoRestaurante = mongoose.models.PedidoRestaurante || mongoose.model(
  "PedidoRestaurante",
  new mongoose.Schema(
    {
      restauranteId: { type: String, required: true, index: true },
      numero: { type: Number, required: true },
      origem: { type: String, enum: ["online", "pdv"], default: "online" },
      status: {
        type: String,
        enum: ["Novo", "Aceito", "Em preparo", "Saiu para entrega", "Entregue", "Cancelado"],
        default: "Novo"
      },
      cliente: {
        nome: String,
        telefone: String,
        endereco: String,
        bairroId: String,
        bairroNome: String
      },
      itens: [
        {
          produtoId: String,
          codigo: String,
          nome: String,
          qtd: Number,
          preco: Number,
          subtotal: Number
        }
      ],
      subtotal: { type: Number, default: 0 },
      taxaEntrega: { type: Number, default: 0 },
      desconto: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      formaPagamento: String,
      observacao: String
    },
    { timestamps: true }
  )
);

const VendaRestaurante = mongoose.models.VendaRestaurante || mongoose.model(
  "VendaRestaurante",
  new mongoose.Schema(
    {
      restauranteId: { type: String, required: true, index: true },
      vendaId: String,
      origem: { type: String, default: "pdv" },
      itens: Array,
      subtotal: Number,
      desconto: Number,
      total: Number,
      formaPagamento: String,
      comprovante: String
    },
    { timestamps: true }
  )
);

const MovimentoEstoqueRestaurante = mongoose.models.MovimentoEstoqueRestaurante || mongoose.model(
  "MovimentoEstoqueRestaurante",
  new mongoose.Schema(
    {
      restauranteId: { type: String, required: true, index: true },
      produtoId: { type: String, required: true },
      tipo: { type: String, enum: ["entrada", "saida", "ajuste"], required: true },
      quantidade: { type: Number, required: true },
      saldoAnterior: Number,
      saldoAtual: Number,
      origem: String,
      referenciaId: String,
      observacao: String
    },
    { timestamps: true }
  )
);

module.exports = {
  RestauranteConta,
  CategoriaRestaurante,
  ProdutoRestaurante,
  BairroEntregaRestaurante,
  PedidoRestaurante,
  VendaRestaurante,
  MovimentoEstoqueRestaurante
};
