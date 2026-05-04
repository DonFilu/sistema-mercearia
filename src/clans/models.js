const mongoose = require("mongoose");

const ClanAccount = mongoose.models.ClanAccount || mongoose.model(
  "ClanAccount",
  new mongoose.Schema(
    {
      tipoSistema: { type: String, default: "clan", index: true },
      email: { type: String, required: true, unique: true, lowercase: true, trim: true },
      senha: { type: String, required: true },
      discordId: String,
      discordUsername: String
    },
    { timestamps: true }
  )
);

module.exports = {
  ClanAccount
};
