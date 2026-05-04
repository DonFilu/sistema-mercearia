const mongoose = require("mongoose");

const ClienteSchema = new mongoose.Schema({
  nome: String,
  telefone: String,
  fiado: Number
});

module.exports = mongoose.model("Cliente", ClienteSchema);