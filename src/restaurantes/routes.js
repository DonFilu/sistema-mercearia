const express = require("express");
const mongoose = require("mongoose");
const { getBearerToken, verifyToken } = require("../shared/security");
const { RestauranteConta } = require("./models");
const controller = require("./controllers");

const router = express.Router();

function requireDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      erro: "Banco de dados conectando. Tente novamente em alguns segundos."
    });
  }

  return next();
}

async function authRestaurante(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ erro: "Restaurante nao autenticado" });
  }

  try {
    const payload = verifyToken(token);

    if (payload.tipoSistema !== "restaurante") {
      return res.status(401).json({ erro: "Sessao invalida" });
    }

    const restaurante = await RestauranteConta.findById(payload.sub);

    if (!restaurante || restaurante.tipoSistema !== "restaurante") {
      return res.status(401).json({ erro: "Restaurante invalido" });
    }

    req.restaurante = restaurante;
    req.restauranteId = restaurante._id.toString();
    return next();
  } catch (err) {
    return res.status(401).json({ erro: "Sessao invalida" });
  }
}

router.use(requireDatabase);

router.post("/auth/register", controller.register);
router.post("/auth/login", controller.login);

router.get("/public/cardapio/:slug", controller.publicCardapio);
router.post("/public/cardapio/:slug/pedidos", controller.criarPedidoPublico);

router.use(authRestaurante);

router.get("/auth/me", controller.me);
router.get("/dashboard", controller.getDashboard);
router.get("/config", controller.me);
router.put("/config", controller.updateConfig);

router.get("/categorias", controller.categorias.list);
router.post("/categorias", controller.categorias.create);
router.put("/categorias/:id", controller.categorias.update);
router.delete("/categorias/:id", controller.categorias.remove);

router.get("/produtos", controller.produtos.list);
router.post("/produtos", controller.produtos.create);
router.put("/produtos/:id", controller.produtos.update);
router.delete("/produtos/:id", controller.produtos.remove);

router.get("/bairros", controller.bairros.list);
router.post("/bairros", controller.bairros.create);
router.put("/bairros/:id", controller.bairros.update);
router.delete("/bairros/:id", controller.bairros.remove);

router.get("/pedidos", controller.listarPedidos);
router.patch("/pedidos/:id/status", controller.atualizarPedido);

router.post("/pdv/vendas", controller.finalizarPdv);

router.get("/estoque", controller.estoque);
router.post("/estoque/:id/ajuste", controller.ajustarEstoqueController);

router.post("/pagamento/criar-pix", controller.criarPix);

module.exports = router;
