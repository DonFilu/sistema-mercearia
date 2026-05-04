const mongoose = require("mongoose");

const ClanAccount = mongoose.models.ClanAccount || mongoose.model(
  "ClanAccount",
  new mongoose.Schema(
    {
      tipoSistema: { type: String, default: "clan", index: true },
      discordId: { type: String, required: true, unique: true, index: true },
      username: String,
      avatar: String,
      email: { type: String, lowercase: true, trim: true },
      guilds: [
        {
          id: String,
          name: String,
          icon: String,
          owner: Boolean,
          permissions: String
        }
      ],
      lastLoginAt: Date
    },
    { timestamps: true }
  )
);

module.exports = {
  ClanAccount
};
