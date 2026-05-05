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
      modoToscoLastReplyAt: { type: Map, of: Date, default: {} },
      boasVindasEnabled: { type: Boolean, default: false },
      boasVindasChannelId: { type: String, default: null },
      boasVindasBackgroundUrl: { type: String, default: null },
      boasVindasTitle: { type: String, default: "BEM-VINDO(A)" },
      boasVindasMessage: { type: String, default: "Que você possa aproveitar ao máximo do nosso servidor!" },
      saidasEnabled: { type: Boolean, default: false },
      saidasChannelId: { type: String, default: null },
      saidasMessage: { type: String, default: "{username} saiu do servidor" },
      moderacaoEnabled: { type: Boolean, default: false },
      moderacaoLogsEnabled: { type: Boolean, default: false },
      moderacaoLogsChannelId: { type: String, default: null },
      warnEnabled: { type: Boolean, default: false },
      warnLogsChannelId: { type: String, default: null },
      warnMessage: { type: String, default: "{user} recebeu uma advertencia. Motivo: {motivo}" },
      muteEnabled: { type: Boolean, default: false },
      muteLogsChannelId: { type: String, default: null },
      muteMaxTime: { type: Number, default: 1440 },
      muteMessage: { type: String, default: "{user} foi silenciado por {tempo}. Motivo: {motivo}" },
      unmuteMessage: { type: String, default: "{user} teve o silencio removido. Motivo: {motivo}" },
      antiSpamEnabled: { type: Boolean, default: false },
      antiSpamChannels: [String],
      antiSpamIgnoredRoles: [String],
      antiSpamMaxMessages: { type: Number, default: 5 },
      antiSpamIntervalSeconds: { type: Number, default: 5 },
      antiSpamAction: { type: String, default: "delete" },
      antiSpamTimeoutMinutes: { type: Number, default: 5 },
      antiLinkEnabled: { type: Boolean, default: false },
      antiLinkChannels: [String],
      antiLinkAllowedRoles: [String],
      antiLinkAllowedDomains: [String],
      antiLinkAction: { type: String, default: "delete" },
      antiLinkMessage: { type: String, default: "{user}, links nao sao permitidos neste canal." },
      badWordsEnabled: { type: Boolean, default: false },
      badWordsChannels: [String],
      badWordsIgnoredRoles: [String],
      badWordsList: [String],
      badWordsAction: { type: String, default: "delete" },
      badWordsMessage: { type: String, default: "{user}, sua mensagem foi removida por conter palavra proibida." },
      autoRoleEnabled: { type: Boolean, default: false },
      autoRoleId: { type: String, default: null },
      autoRoleRemoveOnLeave: { type: Boolean, default: false },
      verificationEnabled: { type: Boolean, default: false },
      verificationChannelId: { type: String, default: null },
      verificationRoleId: { type: String, default: null },
      verificationMessage: { type: String, default: "Clique no botao abaixo para verificar sua conta e liberar acesso ao servidor." },
      moderationStaffRoles: [String]
    },
    { timestamps: true }
  )
);

const ClanWarn = mongoose.models.ClanWarn || mongoose.model(
  "ClanWarn",
  new mongoose.Schema(
    {
      guildId: { type: String, required: true, index: true },
      warnId: { type: String, required: true, index: true },
      userId: { type: String, required: true, index: true },
      moderatorId: { type: String, required: true },
      motivo: String,
      data: { type: Date, default: Date.now }
    },
    { timestamps: true }
  )
);

module.exports = {
  ClanAccount,
  ClanGuildConfig,
  ClanWarn
};
