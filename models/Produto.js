const mongoose = require("mongoose");

const ProdutoSchema = new mongoose.Schema({
  nome: String,
  preco: Number,
  estoque: Number,
  codigo: String
});

module.exports = mongoose.model("Produto", ProdutoSchema);