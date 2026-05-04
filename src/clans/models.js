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

const ClanGuildConfig = mongoose.models.ClanGuildConfig || mongoose.model(
  "ClanGuildConfig",
  new mongoose.Schema(
    {
      guildId: { type: String, required: true, unique: true, index: true },
      avatarRobloxEnabled: { type: Boolean, default: false },
      avatarRobloxChannelId: { type: String, default: null },
      chamadasEnabled: { type: Boolean, default: false },
      chamadasChannelId: { type: String, default: null },
      chamadasTimeStart: { type: String, default: "05:00" },
      chamadasTimeEnd: { type: String, default: "05:30" },
      chamadasMessage: String,
      chamadasQuestions: [String],
      chamadasEndMessage: String,
      chamadasLastQuestion: String,
      chamadasLastStartDate: String,
      chamadasLastEndDate: String,
      modoToscoEnabled: { type: Boolean, default: false },
      modoToscoChannels: [String],
      modoToscoFrequency: { type: Number, default: 5 },
      modoToscoMessages: [String],
      modoToscoMessageCounter: { type: Map, of: Number, default: {} },
      modoToscoLastUsers: { type: Map, of: [String], default: {} },
      modoToscoLastReplyAt: { type: Map, of: Date, default: {} }
    },
    { timestamps: true }
  )
);

module.exports = {
  ClanAccount,
  ClanGuildConfig
};
