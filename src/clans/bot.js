require("dotenv").config();
const mongoose = require("mongoose");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { ClanGuildConfig, ClanWarn } = require("./models");
const {
  findRobloxUser,
  findRobloxAvatar,
  chooseDailyQuestion,
  DEFAULT_CHAMADAS_MESSAGE,
  DEFAULT_CHAMADAS_END_MESSAGE,
  DEFAULT_SAIDAS_MESSAGE
} = require("./features");
const { registerConfiguredGuildCommands } = require("./registerCommands");
const { createWelcomeImageBuffer } = require("./welcomeImage");

let client = null;
let starting = false;
let chamadasTimer = null;
const modoToscoRuntimeState = new Map();
const moderationSpamState = new Map();

async function ensureDatabaseConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI nao configurado.");
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8000
  });
}

async function safeEditReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return;
    }

    await interaction.reply({
      ...payload,
      ephemeral: true
    });
  } catch (err) {
    console.error("Erro ao responder interaction /avatar:", err);
  }
}

async function handleAvatarCommand(interaction) {
  console.log("interactionCreate recebido");
  console.log("commandName:", interaction.commandName);
  console.log("guildId:", interaction.guildId);
  console.log("channelId:", interaction.channelId);

  try {
    await interaction.deferReply();
    console.log("deferReply enviado");
  } catch (err) {
    console.error("Erro ao enviar deferReply:", err);
    return;
  }

  try {
    const username = String(interaction.options.getString("username") || "").trim();
    console.log("username recebido:", username);

    if (!username) {
      await interaction.editReply({ content: "O nome de usuário é obrigatório." });
      return;
    }

    const config = await ClanGuildConfig.findOne({ guildId: interaction.guildId });
    console.log("config carregada:", config ? {
      guildId: config.guildId,
      avatarRobloxEnabled: config.avatarRobloxEnabled === true,
      avatarRobloxChannelId: config.avatarRobloxChannelId || null
    } : null);

    if (!config || config.avatarRobloxEnabled !== true) {
      await interaction.editReply({ content: "Avatar Roblox está desativado neste servidor." });
      return;
    }

    if (!config.avatarRobloxChannelId) {
      await interaction.editReply({ content: "O canal do Avatar Roblox ainda não foi configurado no painel." });
      return;
    }

    if (config.avatarRobloxChannelId !== interaction.channelId) {
      await interaction.editReply({
        content: "Este comando só pode ser usado no canal configurado para Avatar Roblox."
      });
      return;
    }

    console.log("buscando Roblox");
    const user = await findRobloxUser(username);

    if (!user) {
      await interaction.editReply({ content: "Usuário Roblox não encontrado." });
      return;
    }

    console.log("Roblox userId encontrado:", { username: user.name, userId: user.id });
    const avatarUrl = await findRobloxAvatar(user.id);

    if (!avatarUrl) {
      console.log("Avatar Roblox sem imageUrl:", { username: user.name, userId: user.id });
      await interaction.editReply({ content: "Não consegui carregar o avatar do usuário." });
      return;
    }

    const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;
    const embed = new EmbedBuilder()
      .setTitle("Avatar Roblox")
      .setDescription(`Avatar de ${user.name}`)
      .setURL(profileUrl)
      .setColor(0x5865f2)
      .addFields(
        { name: "Nome", value: user.name, inline: true },
        { name: "ID", value: String(user.id), inline: true }
      )
      .setFooter({ text: "Clan Cidio" });

    embed.setImage(avatarUrl);

    await interaction.editReply({ embeds: [embed] });
    console.log("editReply enviado");
  } catch (err) {
    console.error("Erro completo no /avatar:", err);
    await safeEditReply(interaction, {
      content: "Erro ao buscar avatar, tente novamente."
    });
  }
}

async function handleTestarBoasVindasCommand(interaction) {
  console.log("[Boas-vindas] /testar-boasvindas recebido", {
    guildId: interaction.guildId,
    userId: interaction.user?.id || null,
    username: interaction.user?.username || null
  });

  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    console.error("[Boas-vindas] erro ao deferir /testar-boasvindas:", err);
    return;
  }

  try {
    if (!interaction.guild) {
      await interaction.editReply("Use este comando dentro de um servidor.");
      return;
    }

    const member = interaction.member?.user
      ? interaction.member
      : await interaction.guild.members.fetch(interaction.user.id);
    const result = await sendBoasVindasForMember(member, "slash-test");

    if (result.ok) {
      await interaction.editReply(`Teste enviado no canal configurado: <#${result.channelId}>.`);
      return;
    }

    await interaction.editReply(`Boas-vindas não foi enviada. Motivo: ${result.reason || "erro"}. Veja os logs do bot.`);
  } catch (err) {
    console.error("[Boas-vindas] erro completo no /testar-boasvindas:", err);
    await interaction.editReply("Erro ao testar Boas-vindas. Veja os logs do bot.");
  }
}

async function handleWarnCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = await loadModerationConfig(interaction.guildId);
  if (!config || config.warnEnabled !== true) return interaction.editReply("Sistema de warns esta desativado neste servidor.");
  const moderator = interaction.member;
  if (!hasModerationStaffPermission(moderator, config, [PermissionFlagsBits.ManageMessages])) {
    return interaction.editReply("Voce nao tem permissao para usar este comando.");
  }

  const user = interaction.options.getUser("usuario");
  const motivo = interaction.options.getString("motivo") || "Sem motivo informado";
  const warnId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await ClanWarn.create({
    guildId: interaction.guildId,
    warnId,
    userId: user.id,
    moderatorId: interaction.user.id,
    motivo,
    data: new Date()
  });

  const content = replaceTemplate(config.warnMessage, {
    user: `<@${user.id}>`,
    motivo,
    warnId
  });
  await interaction.editReply(content);
  await sendModerationLog(interaction.guild, config, "Advertencia aplicada", [
    { name: "Usuario", value: `<@${user.id}>`, inline: true },
    { name: "Moderador", value: `<@${interaction.user.id}>`, inline: true },
    { name: "Motivo", value: motivo },
    { name: "Warn ID", value: warnId }
  ], config.warnLogsChannelId || config.moderacaoLogsChannelId);
  console.log("[Moderacao] warn aplicado", { guildId: interaction.guildId, userId: user.id, warnId });
}

async function handleWarningsCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = await loadModerationConfig(interaction.guildId);
  if (!config || config.warnEnabled !== true) return interaction.editReply("Sistema de warns esta desativado neste servidor.");
  const member = interaction.member;
  if (!hasModerationStaffPermission(member, config, [PermissionFlagsBits.ManageMessages])) {
    return interaction.editReply("Voce nao tem permissao para usar este comando.");
  }

  const user = interaction.options.getUser("usuario");
  const warns = await ClanWarn.find({ guildId: interaction.guildId, userId: user.id }).sort({ createdAt: -1 }).limit(10);
  if (!warns.length) return interaction.editReply(`${user.username} nao tem advertencias.`);
  return interaction.editReply(warns.map(warn => `ID ${warn.warnId}: ${warn.motivo || "Sem motivo"} (${formatDateTime(warn.data)})`).join("\n"));
}

async function handleClearWarnsCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = await loadModerationConfig(interaction.guildId);
  if (!config || config.warnEnabled !== true) return interaction.editReply("Sistema de warns esta desativado neste servidor.");
  if (!hasModerationStaffPermission(interaction.member, config, [PermissionFlagsBits.ManageMessages])) {
    return interaction.editReply("Voce nao tem permissao para usar este comando.");
  }

  const user = interaction.options.getUser("usuario");
  const result = await ClanWarn.deleteMany({ guildId: interaction.guildId, userId: user.id });
  await interaction.editReply(`${result.deletedCount || 0} advertencias removidas de ${user.username}.`);
}

async function handleRemoveWarnCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = await loadModerationConfig(interaction.guildId);
  if (!config || config.warnEnabled !== true) return interaction.editReply("Sistema de warns esta desativado neste servidor.");
  if (!hasModerationStaffPermission(interaction.member, config, [PermissionFlagsBits.ManageMessages])) {
    return interaction.editReply("Voce nao tem permissao para usar este comando.");
  }

  const user = interaction.options.getUser("usuario");
  const warnId = interaction.options.getString("id");
  const result = await ClanWarn.deleteOne({ guildId: interaction.guildId, userId: user.id, warnId });
  await interaction.editReply(result.deletedCount ? `Warn ${warnId} removido.` : "Warn nao encontrado.");
}

async function handleMuteCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = await loadModerationConfig(interaction.guildId);
  if (!config || config.muteEnabled !== true) return interaction.editReply("Sistema de mute esta desativado neste servidor.");
  if (!hasModerationStaffPermission(interaction.member, config, [PermissionFlagsBits.ModerateMembers])) {
    return interaction.editReply("Voce nao tem permissao para usar este comando.");
  }

  const user = interaction.options.getUser("usuario");
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!target) return interaction.editReply("Usuario nao encontrado no servidor.");

  const motivo = interaction.options.getString("motivo") || "Sem motivo informado";
  const requestedMinutes = Math.max(1, interaction.options.getInteger("tempo") || 1);
  const minutes = Math.min(requestedMinutes, Math.max(1, Number(config.muteMaxTime || 1440)));
  await target.timeout(minutes * 60 * 1000, motivo);
  const content = replaceTemplate(config.muteMessage, {
    user: `<@${user.id}>`,
    tempo: durationLabel(minutes),
    motivo
  });
  await interaction.editReply(content);
  await sendModerationLog(interaction.guild, config, "Usuario silenciado", [
    { name: "Usuario", value: `<@${user.id}>`, inline: true },
    { name: "Moderador", value: `<@${interaction.user.id}>`, inline: true },
    { name: "Tempo", value: durationLabel(minutes), inline: true },
    { name: "Motivo", value: motivo }
  ], config.muteLogsChannelId || config.moderacaoLogsChannelId);
}

async function handleUnmuteCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const config = await loadModerationConfig(interaction.guildId);
  if (!config || config.muteEnabled !== true) return interaction.editReply("Sistema de mute esta desativado neste servidor.");
  if (!hasModerationStaffPermission(interaction.member, config, [PermissionFlagsBits.ModerateMembers])) {
    return interaction.editReply("Voce nao tem permissao para usar este comando.");
  }

  const user = interaction.options.getUser("usuario");
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!target) return interaction.editReply("Usuario nao encontrado no servidor.");

  const motivo = interaction.options.getString("motivo") || "Sem motivo informado";
  await target.timeout(null, motivo);
  await interaction.editReply(replaceTemplate(config.unmuteMessage, {
    user: `<@${user.id}>`,
    motivo
  }));
}

function mapGet(map, key, fallback) {
  if (!map) return fallback;
  return typeof map.get === "function" ? map.get(key) ?? fallback : map[key] ?? fallback;
}

function mapSet(map, key, value) {
  if (typeof map.set === "function") {
    map.set(key, value);
  } else {
    map[key] = value;
  }
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function replaceTemplate(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function hasAnyRole(member, roleIds = []) {
  if (!member || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roleIds.some(roleId => member.roles?.cache?.has(roleId));
}

function isAdmin(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function hasModerationStaffPermission(member, config, requiredPermissions = []) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  if (hasAnyRole(member, config.moderationStaffRoles || [])) return true;
  return requiredPermissions.some(permission => member.permissions?.has(permission));
}

function channelAllowed(channelId, configuredChannels = []) {
  return !Array.isArray(configuredChannels) || !configuredChannels.length || configuredChannels.includes(channelId);
}

function durationLabel(minutes) {
  const value = Math.max(1, Number(minutes || 1));
  return value >= 60 ? `${Math.round(value / 60)}h` : `${value}min`;
}

async function sendModerationLog(guild, config, title, fields = [], explicitChannelId = null) {
  try {
    const channelId = explicitChannelId || config.moderacaoLogsChannelId;
    if (!channelId) return;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.send !== "function") return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(0xef4444)
      .setTimestamp(new Date())
      .setFooter({ text: "Clan Cidio Moderacao" });

    const safeFields = fields
      .filter(field => field?.name)
      .map(field => ({
        name: field.name,
        value: String(field.value || "Conteudo indisponivel").slice(0, 1024),
        inline: field.inline === true
      }));

    if (safeFields.length) embed.addFields(safeFields);
    await channel.send({ embeds: [embed] });
    console.log("[Moderacao] log enviado", { guildId: guild.id, channelId, title });
  } catch (err) {
    console.error("[Moderacao] erro ao enviar log:", err);
  }
}

async function loadModerationConfig(guildId) {
  if (mongoose.connection.readyState !== 1) return null;
  const config = await ClanGuildConfig.findOne({ guildId });
  return config?.moderacaoEnabled === true ? config : null;
}

function modoToscoStateKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function getModoToscoRuntimeState(guildId, channelId) {
  const key = modoToscoStateKey(guildId, channelId);

  if (!modoToscoRuntimeState.has(key)) {
    modoToscoRuntimeState.set(key, {
      counter: 0,
      users: [],
      lastReplyAt: 0
    });
  }

  return modoToscoRuntimeState.get(key);
}

function ensureModoToscoRuntimeMaps(config) {
  if (!config.modoToscoMessageCounter) config.modoToscoMessageCounter = new Map();
  if (!config.modoToscoLastUsers) config.modoToscoLastUsers = new Map();
  if (!config.modoToscoLastReplyAt) config.modoToscoLastReplyAt = new Map();
}

async function handleModoToscoMessage(message) {
  console.log("Modo Tosco mensagem recebida:", {
    guildId: message.guildId || null,
    channelId: message.channelId || null,
    authorId: message.author?.id || null,
    bot: !!message.author?.bot
  });

  if (!message.guildId) {
    console.log("Modo Tosco ignorado: mensagem fora de servidor.");
    return;
  }

  if (message.author?.bot) {
    console.log("Modo Tosco ignorado: autor e bot.");
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    console.log("Modo Tosco ignorado: banco desconectado.");
    return;
  }

  try {
    const config = await ClanGuildConfig.findOne({ guildId: message.guildId });

    if (!config) {
      console.log("Modo Tosco ignorado: config inexistente.", {
        guildId: message.guildId,
        channelId: message.channelId
      });
      return;
    }

    const allowedChannels = Array.isArray(config.modoToscoChannels) ? config.modoToscoChannels : [];
    console.log("Modo Tosco config carregada:", {
      guildId: message.guildId,
      channelId: message.channelId,
      modoToscoEnabled: config.modoToscoEnabled === true,
      canaisPermitidos: allowedChannels,
      frequencia: config.modoToscoFrequency,
      mensagens: config.modoToscoMessages?.length || 0
    });

    if (config.modoToscoEnabled !== true) {
      console.log("Modo Tosco ignorado: funcao desativada.");
      return;
    }

    if (!allowedChannels.length) {
      console.log("Modo Tosco ignorado: modoToscoChannels vazio.");
      return;
    }

    if (!allowedChannels.includes(message.channelId)) {
      console.log("Modo Tosco ignorado: canal nao permitido.", {
        channelId: message.channelId,
        canaisPermitidos: allowedChannels
      });
      return;
    }

    const responses = Array.isArray(config.modoToscoMessages) && config.modoToscoMessages.length
      ? config.modoToscoMessages
      : [];

    console.log("Modo Tosco mensagens disponiveis:", {
      total: responses.length
    });

    if (!responses.length) {
      console.log("Modo Tosco ignorado: lista de mensagens vazia.");
      return;
    }

    ensureModoToscoRuntimeMaps(config);

    const now = new Date();
    const runtimeState = getModoToscoRuntimeState(message.guildId, message.channelId);
    const savedLastReplyAt = mapGet(config.modoToscoLastReplyAt, message.channelId, null);
    const lastReplyAt = runtimeState.lastReplyAt || (savedLastReplyAt ? new Date(savedLastReplyAt).getTime() : 0);

    if (lastReplyAt && now.getTime() - lastReplyAt < 5000) {
      console.log("Modo Tosco ignorado: cooldown ativo.", {
        channelId: message.channelId,
        lastReplyAt
      });
      return;
    }

    const savedUsers = mapGet(config.modoToscoLastUsers, message.channelId, []);
    const recentUsers = (runtimeState.users.length ? runtimeState.users : savedUsers)
      .filter(userId => userId !== message.author.id);
    const updatedUsers = [message.author.id, ...recentUsers.filter(userId => userId !== message.author.id)].slice(0, 10);
    const savedCounter = Number(mapGet(config.modoToscoMessageCounter, message.channelId, 0));
    const currentCounter = (runtimeState.counter || savedCounter) + 1;
    const frequency = Math.max(1, Number(config.modoToscoFrequency || 5));
    const target = frequency;

    console.log("Modo Tosco contador:", {
      channelId: message.channelId,
      contadorAtual: currentCounter,
      frequencia: frequency
    });

    mapSet(config.modoToscoLastUsers, message.channelId, updatedUsers);
    runtimeState.users = updatedUsers;

    if (currentCounter < target) {
      mapSet(config.modoToscoMessageCounter, message.channelId, currentCounter);
      runtimeState.counter = currentCounter;
      config.markModified("modoToscoLastUsers");
      config.markModified("modoToscoMessageCounter");
      await config.save();
      return;
    }

    mapSet(config.modoToscoMessageCounter, message.channelId, 0);
    mapSet(config.modoToscoLastReplyAt, message.channelId, now);
    runtimeState.counter = 0;
    runtimeState.lastReplyAt = now.getTime();
    config.markModified("modoToscoLastUsers");
    config.markModified("modoToscoMessageCounter");
    config.markModified("modoToscoLastReplyAt");
    await config.save();

    const selectedUserId = pickRandom(updatedUsers);
    const selectedMessage = pickRandom(responses);
    console.log("Modo Tosco enviando mensagem:", {
      guildId: message.guildId,
      channelId: message.channelId,
      selectedUserId,
      frequency
    });

    await message.channel.send({
      content: `<@${selectedUserId}> ${selectedMessage}`
    });
    console.log("Modo Tosco resposta enviada:", {
      guildId: message.guildId,
      channelId: message.channelId,
      selectedUserId
    });
  } catch (err) {
    console.error("Erro no Modo Tosco:", {
      guildId: message.guildId,
      channelId: message.channelId,
      erro: err.message
    });
  }
}

async function applyModerationMessageAction(message, config, action, reason, userMessage) {
  try {
    if (message.deletable) await message.delete().catch(() => null);
    if (userMessage) {
      const notice = await message.channel.send({ content: userMessage }).catch(() => null);
      if (notice) setTimeout(() => notice.delete().catch(() => null), 6000);
    }

    if (action === "warn") {
      await ClanWarn.create({
        guildId: message.guildId,
        warnId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        userId: message.author.id,
        moderatorId: message.client.user.id,
        motivo: reason,
        data: new Date()
      });
    }

    if (action === "timeout") {
      const minutes = Math.max(1, Number(config.antiSpamTimeoutMinutes || 5));
      await message.member?.timeout(minutes * 60 * 1000, reason).catch(err => {
        console.error("[Moderacao] erro ao aplicar timeout automatico:", err);
      });
    }

    await sendModerationLog(message.guild, config, "Acao automatica aplicada", [
      { name: "Usuario", value: `<@${message.author.id}>`, inline: true },
      { name: "Canal", value: `<#${message.channelId}>`, inline: true },
      { name: "Acao", value: action },
      { name: "Motivo", value: reason }
    ]);
    console.log("[Moderacao] acao automatica aplicada", { guildId: message.guildId, userId: message.author.id, action, reason });
  } catch (err) {
    console.error("[Moderacao] erro completo na acao automatica:", err);
  }
}

function containsBlockedLink(content, allowedDomains = []) {
  const matches = String(content || "").match(/https?:\/\/[^\s]+|(?:www\.)[^\s]+/gi) || [];
  if (!matches.length) return false;
  const allowed = new Set((allowedDomains || []).map(domain => String(domain).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "")));
  return matches.some(raw => {
    try {
      const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      return ![...allowed].some(domain => host === domain || host.endsWith(`.${domain}`));
    } catch (err) {
      return true;
    }
  });
}

async function handleModerationMessage(message) {
  if (!message.guildId || message.author?.bot) return;
  const config = await loadModerationConfig(message.guildId);
  if (!config) return;
  if (isAdmin(message.member)) return;

  if (config.antiSpamEnabled === true && channelAllowed(message.channelId, config.antiSpamChannels)) {
    if (!hasAnyRole(message.member, config.antiSpamIgnoredRoles || [])) {
      const key = `${message.guildId}:${message.channelId}:${message.author.id}`;
      const now = Date.now();
      const interval = Math.max(1, Number(config.antiSpamIntervalSeconds || 5)) * 1000;
      const current = (moderationSpamState.get(key) || []).filter(time => now - time <= interval);
      current.push(now);
      moderationSpamState.set(key, current);
      console.log("[Moderacao] anti-spam checado", {
        guildId: message.guildId,
        channelId: message.channelId,
        userId: message.author.id,
        total: current.length
      });

      if (current.length >= Math.max(1, Number(config.antiSpamMaxMessages || 5))) {
        moderationSpamState.set(key, []);
        await applyModerationMessageAction(message, config, config.antiSpamAction || "delete", "Anti-spam", null);
        return;
      }
    }
  }

  if (config.antiLinkEnabled === true && channelAllowed(message.channelId, config.antiLinkChannels)) {
    if (!hasAnyRole(message.member, config.antiLinkAllowedRoles || []) && containsBlockedLink(message.content, config.antiLinkAllowedDomains || [])) {
      await applyModerationMessageAction(
        message,
        config,
        config.antiLinkAction || "delete",
        "Anti-link",
        replaceTemplate(config.antiLinkMessage, { user: `<@${message.author.id}>` })
      );
      return;
    }
  }

  if (config.badWordsEnabled === true && channelAllowed(message.channelId, config.badWordsChannels)) {
    if (!hasAnyRole(message.member, config.badWordsIgnoredRoles || [])) {
      const content = String(message.content || "").toLowerCase();
      const found = (config.badWordsList || []).find(word => word && content.includes(String(word).toLowerCase()));
      if (found) {
        await applyModerationMessageAction(
          message,
          config,
          config.badWordsAction || "delete",
          `Palavra proibida: ${found}`,
          replaceTemplate(config.badWordsMessage, { user: `<@${message.author.id}>` })
        );
      }
    }
  }
}

async function handleGuildMemberAdd(member) {
  console.log("[Boas-vindas] EVENTO RECEBIDO", member.guild?.id || null, member.user?.id || null);
  console.log("[Boas-vindas] guildMemberAdd recebido", {
    guildId: member.guild?.id || null,
    userId: member.user?.id || null,
    username: member.user?.username || null
  });

  await sendBoasVindasForMember(member, "guildMemberAdd");

  try {
    const config = await loadModerationConfig(member.guild.id);
    if (!config || config.autoRoleEnabled !== true || !config.autoRoleId) return;
    await member.roles.add(config.autoRoleId, "Clan Cidio auto-role");
    await sendModerationLog(member.guild, config, "Cargo automatico adicionado", [
      { name: "Usuario", value: `<@${member.user.id}>`, inline: true },
      { name: "Cargo", value: `<@&${config.autoRoleId}>`, inline: true }
    ]);
    console.log("[Moderacao] cargo automatico adicionado", { guildId: member.guild.id, userId: member.user.id, roleId: config.autoRoleId });
  } catch (err) {
    console.error("[Moderacao] erro ao adicionar cargo automatico:", err);
  }
}

async function sendBoasVindasForMember(member, source = "manual") {
  console.log("[Boas-vindas] fluxo iniciado", {
    source,
    guildId: member.guild?.id || null,
    userId: member.user?.id || null,
    username: member.user?.username || null
  });

  if (!member.guild?.id) {
    console.log("[Boas-vindas] ignorado: membro sem guildId.");
    return { ok: false, reason: "sem_guild" };
  }

  if (mongoose.connection.readyState !== 1) {
    console.log("[Boas-vindas] ignorado: banco desconectado.");
    return { ok: false, reason: "banco_desconectado" };
  }

  try {
    const config = await ClanGuildConfig.findOne({ guildId: member.guild.id });
    console.log("[Boas-vindas] config carregada", config ? {
      guildId: config.guildId,
      boasVindasEnabled: config.boasVindasEnabled === true,
      boasVindasChannelId: config.boasVindasChannelId ? String(config.boasVindasChannelId) : null,
      temFundo: !!config.boasVindasBackgroundUrl
    } : null);
    console.log("[Boas-vindas] titulo/mensagem", config ? {
      title: config.boasVindasTitle || "BEM-VINDO(A)",
      message: config.boasVindasMessage || "QUE VOCE POSSA APROVEITAR AO MAXIMO A ALCATEIA!"
    } : null);

    if (!config || config.boasVindasEnabled !== true) {
      console.log("[Boas-vindas] ignorado: funcao desativada ou sem config.", {
        guildId: member.guild.id
      });
      return { ok: false, reason: "desativado" };
    }

    const channelId = config.boasVindasChannelId ? String(config.boasVindasChannelId) : null;

    if (!channelId) {
      console.log("[Boas-vindas] ignorado: canal nao configurado.", {
        guildId: member.guild.id
      });
      return { ok: false, reason: "sem_canal" };
    }

    const channel = await member.guild.channels.fetch(channelId);
    console.log("[Boas-vindas] canal encontrado", {
      guildId: member.guild.id,
      channelId,
      found: !!channel,
      sendFunction: typeof channel?.send === "function"
    });

    if (!channel || typeof channel.send !== "function") {
      console.log("[Boas-vindas] erro: canal invalido ou sem envio.", {
        guildId: member.guild.id,
        channelId
      });
      return { ok: false, reason: "canal_invalido" };
    }

    const me = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
    const permissions = me ? channel.permissionsFor(me) : null;
    const requiredPermissions = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks
    ];
    const missing = permissions
      ? requiredPermissions.filter(permission => !permissions.has(permission))
      : requiredPermissions;

    if (missing.length) {
      console.log("[Boas-vindas] erro: permissoes ausentes.", {
        guildId: member.guild.id,
        channelId,
        missing: missing.map(permission => permission.toString())
      });
      return { ok: false, reason: "sem_permissao" };
    }

    console.log("[Boas-vindas] fundo carregado", {
      guildId: member.guild.id,
      temFundo: !!config.boasVindasBackgroundUrl
    });

    let files = [];

    try {
      const imageBuffer = await createWelcomeImageBuffer(member, config);
      files = [
        new AttachmentBuilder(imageBuffer, {
          name: "boas-vindas.png"
        })
      ];
      console.log("[Boas-vindas] imagem gerada", {
        guildId: member.guild.id,
        userId: member.user.id
      });
    } catch (imageErr) {
      console.error("[Boas-vindas] erro ao gerar imagem, usando fallback texto:", imageErr);
    }

    await channel.send({
      content: files.length
        ? "Seja bem-vindo(a)!!"
        : `Seja bem-vindo(a), ${member}!`,
      files
    });
    console.log("[Boas-vindas] mensagem enviada", {
      guildId: member.guild.id,
      channelId,
      userId: member.user.id,
      comImagem: files.length > 0
    });
    return { ok: true, channelId, comImagem: files.length > 0 };
  } catch (err) {
    console.error("[Boas-vindas] erro completo:", err);
    console.error("[Boas-vindas] erro resumido:", {
      guildId: member.guild?.id || null,
      userId: member.user?.id || null,
      erro: err.message
    });
    return { ok: false, reason: "erro", error: err.message };
  }
}

function buildSaidasMessage(template, member) {
  const username = member.user?.username || member.displayName || "Usuario";
  return String(template || DEFAULT_SAIDAS_MESSAGE)
    .replaceAll("{username}", username)
    .trim() || DEFAULT_SAIDAS_MESSAGE.replaceAll("{username}", username);
}

async function handleGuildMemberRemove(member) {
  console.log("[Saidas] membro saiu", {
    guildId: member.guild?.id || null,
    userId: member.user?.id || null,
    username: member.user?.username || null
  });

  if (!member.guild?.id) {
    console.log("[Saidas] ignorado: membro sem guildId.");
    return;
  }

  if (mongoose.connection.readyState !== 1) {
    console.log("[Saidas] ignorado: banco desconectado.");
    return;
  }

  try {
    const config = await ClanGuildConfig.findOne({ guildId: member.guild.id });
    console.log("[Saidas] config carregada", config ? {
      guildId: config.guildId,
      saidasEnabled: config.saidasEnabled === true,
      saidasChannelId: config.saidasChannelId || null,
      saidasMessage: config.saidasMessage || null
    } : null);

    if (!config || config.saidasEnabled !== true) {
      console.log("[Saidas] ignorado: funcao desativada ou sem config.", {
        guildId: member.guild.id
      });
      return;
    }

    const channelId = config.saidasChannelId ? String(config.saidasChannelId) : null;

    if (!channelId) {
      console.log("[Saidas] ignorado: canal nao configurado.", {
        guildId: member.guild.id
      });
      return;
    }

    const channel = await member.guild.channels.fetch(channelId);
    console.log("[Saidas] canal encontrado", {
      guildId: member.guild.id,
      channelId,
      found: !!channel,
      sendFunction: typeof channel?.send === "function"
    });

    if (!channel || typeof channel.send !== "function") {
      console.log("[Saidas] erro: canal invalido ou sem envio.", {
        guildId: member.guild.id,
        channelId
      });
      return;
    }

    const content = buildSaidasMessage(config.saidasMessage, member);
    await channel.send({ content });
    console.log("[Saidas] mensagem enviada", {
      guildId: member.guild.id,
      channelId,
      userId: member.user?.id || null,
      content
    });
  } catch (err) {
    console.error("[Saidas] erro completo:", err);
    console.error("[Saidas] erro resumido:", {
      guildId: member.guild?.id || null,
      userId: member.user?.id || null,
      erro: err.message
    });
  }
}

function saoPauloNowParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    timeKey: `${values.hour}:${values.minute}`
  };
}

function normalizeTimeKey(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

async function sendChannelMessage(discordClient, channelId, content) {
  const channel = await discordClient.channels.fetch(channelId);

  if (!channel || typeof channel.send !== "function") {
    throw new Error("Canal nao encontrado ou sem suporte a envio.");
  }

  await channel.send({ content });
}

function buildChamadaMessage(config, question) {
  const message = config.chamadasMessage || DEFAULT_CHAMADAS_MESSAGE;
  return question ? `${message}\n\n${question}` : message;
}

async function runChamadasTick(discordClient) {
  if (mongoose.connection.readyState !== 1) {
    console.log("[Chamadas] checagem ignorada: banco desconectado.", {
      readyState: mongoose.connection.readyState
    });
    return;
  }

  const { dateKey, timeKey } = saoPauloNowParts();
  console.log("[Chamadas] checando chamadas", {
    dataAtual: dateKey,
    horaAtual: timeKey
  });

  const configs = await ClanGuildConfig.find({
    chamadasEnabled: true
  });
  console.log("[Chamadas] configs ativas encontradas", {
    total: configs.length
  });

  for (const config of configs) {
    try {
      const startTime = normalizeTimeKey(config.chamadasTimeStart);
      const endTime = normalizeTimeKey(config.chamadasTimeEnd);

      console.log("[Chamadas] config carregada", {
        guildId: config.guildId,
        chamadasEnabled: config.chamadasEnabled === true,
        chamadasChannelId: config.chamadasChannelId || null,
        horaAtual: timeKey,
        horaConfiguradaInicio: startTime,
        horaConfiguradaFim: endTime,
        lastStartDate: config.chamadasLastStartDate || null,
        lastEndDate: config.chamadasLastEndDate || null
      });

      if (!config.chamadasChannelId) {
        console.log("[Chamadas] ignorada: canal nao configurado.", {
          guildId: config.guildId
        });
        continue;
      }

      if (startTime === timeKey && config.chamadasLastStartDate !== dateKey) {
        const question = chooseDailyQuestion(config.chamadasQuestions || [], config.chamadasLastQuestion);
        console.log("[Chamadas] pergunta escolhida", {
          guildId: config.guildId,
          question: question || null
        });

        await sendChannelMessage(discordClient, config.chamadasChannelId, buildChamadaMessage(config, question));
        config.chamadasLastQuestion = question || config.chamadasLastQuestion || null;
        config.chamadasLastStartDate = dateKey;
        await config.save();
        console.log("[Chamadas] chamada enviada", {
          guildId: config.guildId,
          channelId: config.chamadasChannelId
        });
      }

      if (endTime === timeKey && config.chamadasLastEndDate !== dateKey) {
        const endMessage = config.chamadasEndMessage || DEFAULT_CHAMADAS_END_MESSAGE;
        await sendChannelMessage(discordClient, config.chamadasChannelId, endMessage);
        config.chamadasLastEndDate = dateKey;
        await config.save();
        console.log("[Chamadas] encerramento enviado", {
          guildId: config.guildId,
          channelId: config.chamadasChannelId
        });
      }
    } catch (err) {
      console.error("[Chamadas] erro completo no agendamento:", err);
      console.error("[Chamadas] erro resumido no agendamento:", {
        guildId: config.guildId,
        channelId: config.chamadasChannelId,
        erro: err.message
      });
    }
  }
}

function startChamadasScheduler(discordClient) {
  if (chamadasTimer) {
    console.log("[Chamadas] scheduler ja estava iniciado.");
    return;
  }

  console.log("[Chamadas] scheduler iniciado.");
  setTimeout(() => runChamadasTick(discordClient).catch(err => {
    console.error("[Chamadas] erro no primeiro tick:", err);
  }), 5000);

  chamadasTimer = setInterval(() => {
    runChamadasTick(discordClient).catch(err => {
      console.error("[Chamadas] erro no tick:", err);
    });
  }, 30000);
}

function createClanClient() {
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ];

  console.log("Iniciando bot Clan Cidio com intents:", {
    Guilds: true,
    GuildMessages: true,
    MessageContent: true,
    GuildMembers: true,
    GuildModeration: true
  });

  return new Client({ intents });
}

async function startClanDiscordBot() {
  if (client || starting) return client;

  if (!process.env.DISCORD_BOT_TOKEN) {
    console.warn("Bot Clan Cidio nao iniciado: DISCORD_BOT_TOKEN ausente.");
    return null;
  }

  starting = true;

  try {
    await ensureDatabaseConnection();

    try {
      await registerConfiguredGuildCommands();
    } catch (err) {
      console.warn("Falha ao registrar comandos Clan Cidio; bot vai iniciar mesmo assim:", err.response?.data || err.message);
    }

    client = createClanClient();

    client.once("ready", () => {
      console.log(`Bot Clan Cidio online como ${client.user.tag}`);
      console.log("Listeners Clan Cidio registrados.");
      startChamadasScheduler(client);
    });

    client.on("interactionCreate", async interaction => {
      if (interaction.isButton?.() && interaction.customId === "clan_verify") {
        const config = await loadModerationConfig(interaction.guildId);
        if (!config || config.verificationEnabled !== true || !config.verificationRoleId) {
          await interaction.reply({ content: "Verificacao indisponivel neste servidor.", ephemeral: true });
          return;
        }
        await interaction.member.roles.add(config.verificationRoleId, "Clan Cidio verificacao");
        await interaction.reply({ content: "Conta verificada com sucesso.", ephemeral: true });
        await sendModerationLog(interaction.guild, config, "Usuario verificado", [
          { name: "Usuario", value: `<@${interaction.user.id}>`, inline: true },
          { name: "Cargo", value: `<@&${config.verificationRoleId}>`, inline: true }
        ]);
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === "avatar") {
        await handleAvatarCommand(interaction);
        return;
      }

      if (interaction.commandName === "testar-boasvindas") {
        await handleTestarBoasVindasCommand(interaction);
        return;
      }

      if (interaction.commandName === "warn") {
        await handleWarnCommand(interaction);
        return;
      }

      if (interaction.commandName === "warnings") {
        await handleWarningsCommand(interaction);
        return;
      }

      if (interaction.commandName === "clearwarns") {
        await handleClearWarnsCommand(interaction);
        return;
      }

      if (interaction.commandName === "removewarn") {
        await handleRemoveWarnCommand(interaction);
        return;
      }

      if (interaction.commandName === "mute") {
        await handleMuteCommand(interaction);
        return;
      }

      if (interaction.commandName === "unmute") {
        await handleUnmuteCommand(interaction);
      }
    });

    client.on("messageCreate", async message => {
      console.log("messageCreate recebido pelo bot Clan Cidio.");
      await handleModerationMessage(message);
      await handleModoToscoMessage(message);
    });

    client.on("messageDelete", async message => {
      if (!message.guildId || message.author?.bot) return;
      const config = await loadModerationConfig(message.guildId);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      await sendModerationLog(message.guild, config, "Mensagem deletada", [
        { name: "Usuario", value: message.author ? `<@${message.author.id}>` : "Conteudo indisponivel", inline: true },
        { name: "Canal", value: `<#${message.channelId}>`, inline: true },
        { name: "Conteudo", value: message.content || "Conteudo indisponivel" },
        { name: "ID do usuario", value: message.author?.id || "Conteudo indisponivel", inline: true },
        { name: "ID da mensagem", value: message.id || "Conteudo indisponivel", inline: true },
        { name: "Data", value: formatDateTime(new Date()) }
      ]);
    });

    client.on("messageUpdate", async (oldMessage, newMessage) => {
      if (!newMessage.guildId || newMessage.author?.bot) return;
      if ((oldMessage.content || "") === (newMessage.content || "")) return;
      const config = await loadModerationConfig(newMessage.guildId);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      await sendModerationLog(newMessage.guild, config, "Mensagem editada", [
        { name: "Usuario", value: `<@${newMessage.author.id}>`, inline: true },
        { name: "Canal", value: `<#${newMessage.channelId}>`, inline: true },
        { name: "Antes", value: oldMessage.content || "Conteudo indisponivel" },
        { name: "Depois", value: newMessage.content || "Conteudo indisponivel" },
        { name: "ID do usuario", value: newMessage.author.id, inline: true },
        { name: "ID da mensagem", value: newMessage.id, inline: true },
        { name: "Data", value: formatDateTime(new Date()) }
      ]);
    });

    client.on("guildBanAdd", async ban => {
      const config = await loadModerationConfig(ban.guild.id);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      await sendModerationLog(ban.guild, config, "Membro banido", [
        { name: "Usuario", value: `<@${ban.user.id}>`, inline: true },
        { name: "ID do usuario", value: ban.user.id, inline: true },
        { name: "Data", value: formatDateTime(new Date()) }
      ]);
    });

    client.on("guildBanRemove", async ban => {
      const config = await loadModerationConfig(ban.guild.id);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      await sendModerationLog(ban.guild, config, "Membro desbanido", [
        { name: "Usuario", value: `<@${ban.user.id}>`, inline: true },
        { name: "ID do usuario", value: ban.user.id, inline: true },
        { name: "Data", value: formatDateTime(new Date()) }
      ]);
    });

    client.on("channelCreate", async channel => {
      if (!channel.guild) return;
      const config = await loadModerationConfig(channel.guild.id);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      await sendModerationLog(channel.guild, config, "Canal criado", [
        { name: "Canal", value: `${channel.name || channel.id}`, inline: true },
        { name: "ID", value: channel.id, inline: true }
      ]);
    });

    client.on("channelDelete", async channel => {
      if (!channel.guild) return;
      const config = await loadModerationConfig(channel.guild.id);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      await sendModerationLog(channel.guild, config, "Canal deletado", [
        { name: "Canal", value: `${channel.name || channel.id}`, inline: true },
        { name: "ID", value: channel.id, inline: true }
      ]);
    });

    client.on("channelUpdate", async (oldChannel, newChannel) => {
      if (!newChannel.guild) return;
      const config = await loadModerationConfig(newChannel.guild.id);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      await sendModerationLog(newChannel.guild, config, "Canal editado", [
        { name: "Antes", value: oldChannel.name || oldChannel.id, inline: true },
        { name: "Depois", value: newChannel.name || newChannel.id, inline: true },
        { name: "ID", value: newChannel.id, inline: true }
      ]);
    });

    client.on("guildMemberUpdate", async (oldMember, newMember) => {
      const config = await loadModerationConfig(newMember.guild.id);
      if (!config || config.moderacaoLogsEnabled !== true) return;
      const oldRoles = new Set(oldMember.roles.cache.keys());
      const newRoles = new Set(newMember.roles.cache.keys());
      const added = [...newRoles].filter(roleId => !oldRoles.has(roleId));
      const removed = [...oldRoles].filter(roleId => !newRoles.has(roleId));
      if (!added.length && !removed.length) return;
      await sendModerationLog(newMember.guild, config, "Cargo adicionado/removido", [
        { name: "Usuario", value: `<@${newMember.user.id}>`, inline: true },
        { name: "Adicionados", value: added.map(roleId => `<@&${roleId}>`).join(", ") || "Nenhum" },
        { name: "Removidos", value: removed.map(roleId => `<@&${roleId}>`).join(", ") || "Nenhum" }
      ]);
    });

    client.on("guildMemberAdd", async member => {
      console.log("[Boas-vindas] membro entrou", member.guild.id, member.user.username);
      await handleGuildMemberAdd(member);
    });

    client.on("guildMemberRemove", async member => {
      await handleGuildMemberRemove(member);
    });

    await client.login(process.env.DISCORD_BOT_TOKEN);
    return client;
  } catch (err) {
    client = null;
    console.error("Erro ao iniciar bot Clan Cidio:", err);
    return null;
  } finally {
    starting = false;
  }
}

if (require.main === module) {
  startClanDiscordBot();
}

module.exports = {
  startClanDiscordBot
};
