const axios = require("axios");
const {
  hashPassword,
  verifyPassword,
  passwordNeedsRehash,
  createToken
} = require("../shared/security");
const {
  RestauranteConta,
  CategoriaRestaurante,
  ProdutoRestaurante,
  BairroEntregaRestaurante,
  PedidoRestaurante,
  VendaRestaurante,
  MovimentoEstoqueRestaurante
} = require("./models");
const {
  slugify,
  toMoney,
  nextPedidoNumero,
  resolveItens,
  baixarEstoque,
  ajustarEstoque,
  dashboard
} = require("./services");

const RESTAURANTE_PRECO_PADRAO = Number(process.env.RESTAURANTE_PLANO_VALOR || 49);

function ok(res, data) {
  return res.json(data);
}

function handleError(res, err) {
  console.error(err);
  return res.status(err.status || 500).json({ erro: err.message || "Erro interno" });
}

function restauranteView(restaurante) {
  return {
    _id: restaurante._id,
    tipoSistema: restaurante.tipoSistema,
    email: restaurante.email,
    nomeRestaurante: restaurante.nomeRestaurante,
    slug: restaurante.slug,
    telefone: restaurante.telefone,
    whatsapp: restaurante.whatsapp,
    logo: restaurante.logo,
    horarioFuncionamento: restaurante.horarioFuncionamento,
    tempoMedioPreparo: restaurante.tempoMedioPreparo,
    pedidoMinimo: restaurante.pedidoMinimo,
    formasPagamento: restaurante.formasPagamento,
    chavePix: restaurante.chavePix,
    mensagemPedidoRecebido: restaurante.mensagemPedidoRecebido,
    aberto: restaurante.aberto,
    planoAtivo: restaurante.planoAtivo,
    dataExpiracao: restaurante.dataExpiracao,
    linkPublico: `/restaurantes/cardapio/${restaurante.slug}`
  };
}

async function uniqueSlug(nome, currentId) {
  const base = slugify(nome) || "restaurante";
  let slug = base;
  let suffix = 1;

  while (true) {
    const existing = await RestauranteConta.findOne({ slug });
    if (!existing || String(existing._id) === String(currentId)) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

async function register(req, res) {
  try {
    const { email, senha, nomeRestaurante, telefone } = req.body;

    if (!email || !senha || !nomeRestaurante) {
      return res.status(400).json({ erro: "Email, senha e nome do restaurante sao obrigatorios" });
    }

    const exists = await RestauranteConta.findOne({ email: String(email).toLowerCase().trim() });
    if (exists) return res.status(400).json({ erro: "Restaurante ja cadastrado" });

    const hoje = new Date();
    const restaurante = await RestauranteConta.create({
      email,
      senha: hashPassword(senha),
      nomeRestaurante,
      telefone,
      whatsapp: telefone,
      slug: await uniqueSlug(nomeRestaurante),
      tipoSistema: "restaurante",
      planoAtivo: true,
      dataExpiracao: new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000)
    });

    return ok(res, {
      restaurante: restauranteView(restaurante),
      token: createToken(restaurante._id, "restaurante")
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function login(req, res) {
  try {
    const { email, senha } = req.body;
    const restaurante = await RestauranteConta.findOne({ email: String(email || "").toLowerCase().trim() });

    if (!restaurante || !verifyPassword(senha, restaurante.senha)) {
      return res.status(401).json({ erro: "Login invalido" });
    }

    if (passwordNeedsRehash(restaurante.senha)) {
      restaurante.senha = hashPassword(senha);
      await restaurante.save();
    }

    return ok(res, {
      restaurante: restauranteView(restaurante),
      token: createToken(restaurante._id, "restaurante")
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function me(req, res) {
  return ok(res, restauranteView(req.restaurante));
}

async function getDashboard(req, res) {
  try {
    return ok(res, await dashboard(req.restauranteId));
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateConfig(req, res) {
  try {
    const allowed = [
      "nomeRestaurante",
      "telefone",
      "whatsapp",
      "logo",
      "horarioFuncionamento",
      "tempoMedioPreparo",
      "pedidoMinimo",
      "formasPagamento",
      "chavePix",
      "mensagemPedidoRecebido",
      "aberto"
    ];

    for (const field of allowed) {
      if (req.body[field] !== undefined) req.restaurante[field] = req.body[field];
    }

    if (req.body.nomeRestaurante) {
      req.restaurante.slug = await uniqueSlug(req.body.nomeRestaurante, req.restaurante._id);
    }

    await req.restaurante.save();
    return ok(res, restauranteView(req.restaurante));
  } catch (err) {
    return handleError(res, err);
  }
}

function crud(Model, fields) {
  return {
    async list(req, res) {
      try {
        const sort = Model.modelName === "CategoriaRestaurante" ? { ordem: 1, nome: 1 } : { createdAt: -1 };
        return ok(res, await Model.find({ restauranteId: req.restauranteId }).sort(sort));
      } catch (err) {
        return handleError(res, err);
      }
    },
    async create(req, res) {
      try {
        const data = { restauranteId: req.restauranteId };
        for (const field of fields) if (req.body[field] !== undefined) data[field] = req.body[field];
        return ok(res, await Model.create(data));
      } catch (err) {
        return handleError(res, err);
      }
    },
    async update(req, res) {
      try {
        const data = {};
        for (const field of fields) if (req.body[field] !== undefined) data[field] = req.body[field];
        const updated = await Model.findOneAndUpdate(
          { _id: req.params.id, restauranteId: req.restauranteId },
          data,
          { new: true }
        );
        if (!updated) return res.status(404).json({ erro: "Registro nao encontrado" });
        return ok(res, updated);
      } catch (err) {
        return handleError(res, err);
      }
    },
    async remove(req, res) {
      try {
        await Model.deleteOne({ _id: req.params.id, restauranteId: req.restauranteId });
        return ok(res, { ok: true });
      } catch (err) {
        return handleError(res, err);
      }
    }
  };
}

const categorias = crud(CategoriaRestaurante, ["nome", "ordem", "ativo"]);
const produtos = crud(ProdutoRestaurante, [
  "nome",
  "descricao",
  "categoriaId",
  "codigo",
  "preco",
  "foto",
  "ativo",
  "controlaEstoque",
  "estoque",
  "estoqueMinimo"
]);
const bairros = crud(BairroEntregaRestaurante, ["nome", "valorEntrega", "tempoEstimado", "ativo"]);

async function estoque(req, res) {
  try {
    const produtosEstoque = await ProdutoRestaurante.find({
      restauranteId: req.restauranteId,
      controlaEstoque: true
    }).sort({ nome: 1 });
    const movimentos = await MovimentoEstoqueRestaurante.find({ restauranteId: req.restauranteId })
      .sort({ createdAt: -1 })
      .limit(100);
    return ok(res, { produtos: produtosEstoque, movimentos });
  } catch (err) {
    return handleError(res, err);
  }
}

async function ajustarEstoqueController(req, res) {
  try {
    const produto = await ajustarEstoque(
      req.restauranteId,
      req.params.id,
      req.body.estoque,
      req.body.observacao
    );
    return ok(res, produto);
  } catch (err) {
    return handleError(res, err);
  }
}

async function finalizarPdv(req, res) {
  try {
    const itensResolvidos = await resolveItens(req.restauranteId, req.body.itens);
    const subtotal = toMoney(itensResolvidos.reduce((sum, x) => sum + x.item.subtotal, 0));
    const desconto = Math.min(toMoney(req.body.desconto || 0), subtotal);
    const total = toMoney(subtotal - desconto);

    if (total <= 0) return res.status(400).json({ erro: "Total invalido" });

    const venda = await VendaRestaurante.create({
      restauranteId: req.restauranteId,
      vendaId: req.body.vendaId,
      origem: "pdv",
      itens: itensResolvidos.map(x => x.item),
      subtotal,
      desconto,
      total,
      formaPagamento: req.body.formaPagamento || "Dinheiro",
      comprovante: `CIDIO-${Date.now()}`
    });

    await baixarEstoque(req.restauranteId, itensResolvidos, "pdv", venda._id.toString());

    const pedido = await PedidoRestaurante.create({
      restauranteId: req.restauranteId,
      numero: await nextPedidoNumero(req.restauranteId),
      origem: "pdv",
      status: "Entregue",
      cliente: { nome: "Balcao" },
      itens: itensResolvidos.map(x => x.item),
      subtotal,
      desconto,
      total,
      formaPagamento: req.body.formaPagamento || "Dinheiro"
    });

    return ok(res, { venda, pedido });
  } catch (err) {
    return handleError(res, err);
  }
}

async function listarPedidos(req, res) {
  try {
    return ok(res, await PedidoRestaurante.find({ restauranteId: req.restauranteId }).sort({ createdAt: -1 }));
  } catch (err) {
    return handleError(res, err);
  }
}

async function atualizarPedido(req, res) {
  try {
    const allowed = ["Novo", "Aceito", "Em preparo", "Saiu para entrega", "Entregue", "Cancelado"];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ erro: "Status invalido" });

    const pedido = await PedidoRestaurante.findOneAndUpdate(
      { _id: req.params.id, restauranteId: req.restauranteId },
      { status: req.body.status },
      { new: true }
    );

    if (!pedido) return res.status(404).json({ erro: "Pedido nao encontrado" });
    return ok(res, pedido);
  } catch (err) {
    return handleError(res, err);
  }
}

async function publicCardapio(req, res) {
  try {
    const restaurante = await RestauranteConta.findOne({ slug: req.params.slug, tipoSistema: "restaurante" });
    if (!restaurante) return res.status(404).json({ erro: "Restaurante nao encontrado" });

    const restauranteId = restaurante._id.toString();
    const [categoriasLista, produtosLista, bairrosLista] = await Promise.all([
      CategoriaRestaurante.find({ restauranteId, ativo: true }).sort({ ordem: 1, nome: 1 }),
      ProdutoRestaurante.find({ restauranteId, ativo: true }).sort({ nome: 1 }),
      BairroEntregaRestaurante.find({ restauranteId, ativo: true }).sort({ nome: 1 })
    ]);

    return ok(res, {
      restaurante: restauranteView(restaurante),
      categorias: categoriasLista,
      produtos: produtosLista,
      bairros: bairrosLista
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarPedidoPublico(req, res) {
  try {
    const restaurante = await RestauranteConta.findOne({ slug: req.params.slug, tipoSistema: "restaurante" });
    if (!restaurante) return res.status(404).json({ erro: "Restaurante nao encontrado" });
    if (!restaurante.aberto) return res.status(400).json({ erro: "Restaurante fechado" });

    const restauranteId = restaurante._id.toString();
    const { cliente, bairroId, formaPagamento, observacao } = req.body;

    if (!cliente?.nome || !cliente?.telefone || !cliente?.endereco) {
      return res.status(400).json({ erro: "Dados do cliente incompletos" });
    }

    const bairro = await BairroEntregaRestaurante.findOne({
      _id: bairroId,
      restauranteId,
      ativo: true
    });
    if (!bairro) return res.status(400).json({ erro: "Bairro nao atendido" });

    const itensResolvidos = await resolveItens(restauranteId, req.body.itens);
    const subtotal = toMoney(itensResolvidos.reduce((sum, x) => sum + x.item.subtotal, 0));
    const taxaEntrega = toMoney(bairro.valorEntrega);
    const total = toMoney(subtotal + taxaEntrega);

    if (restaurante.pedidoMinimo && subtotal < restaurante.pedidoMinimo) {
      return res.status(400).json({ erro: "Pedido abaixo do minimo" });
    }

    const pedido = await PedidoRestaurante.create({
      restauranteId,
      numero: await nextPedidoNumero(restauranteId),
      origem: "online",
      status: "Novo",
      cliente: {
        nome: cliente.nome,
        telefone: cliente.telefone,
        endereco: cliente.endereco,
        bairroId: bairro._id.toString(),
        bairroNome: bairro.nome
      },
      itens: itensResolvidos.map(x => x.item),
      subtotal,
      taxaEntrega,
      total,
      formaPagamento,
      observacao
    });

    await baixarEstoque(restauranteId, itensResolvidos, "pedido_online", pedido._id.toString());
    return ok(res, { pedido });
  } catch (err) {
    return handleError(res, err);
  }
}

async function criarPix(req, res) {
  try {
    const valor = Number(process.env.RESTAURANTE_PLANO_VALOR || RESTAURANTE_PRECO_PADRAO);

    if (!process.env.MP_ACCESS_TOKEN) {
      return ok(res, {
        modo: "manual",
        valor,
        mensagem: "Configure MP_ACCESS_TOKEN para gerar QR Code automaticamente."
      });
    }

    const response = await axios.post(
      "https://api.mercadopago.com/v1/payments",
      {
        transaction_amount: valor,
        description: "Assinatura Cidio Restaurantes",
        payment_method_id: "pix",
        payer: {
          email: req.restaurante.email,
          first_name: req.restaurante.nomeRestaurante,
          identification: { type: "CPF", number: "19119119100" }
        },
        external_reference: `restaurante:${req.restaurante._id}`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `restaurante-${req.restaurante._id}-${Date.now()}`
        }
      }
    );

    const dados = response.data.point_of_interaction?.transaction_data;
    return ok(res, {
      valor,
      qr_code: dados?.qr_code,
      qr_code_base64: dados?.qr_code_base64
    });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  register,
  login,
  me,
  getDashboard,
  updateConfig,
  categorias,
  produtos,
  bairros,
  estoque,
  ajustarEstoqueController,
  finalizarPdv,
  listarPedidos,
  atualizarPedido,
  publicCardapio,
  criarPedidoPublico,
  criarPix
};
