require("dotenv").config();
const mongoose = require("mongoose");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder
} = require("discord.js");
const { ClanGuildConfig } = require("./models");
const {
  findRobloxUser,
  findRobloxAvatar,
  chooseDailyQuestion,
  DEFAULT_CHAMADAS_MESSAGE,
  DEFAULT_CHAMADAS_END_MESSAGE
} = require("./features");
const { registerConfiguredGuildCommands } = require("./registerCommands");
const { createWelcomeImageBuffer } = require("./welcomeImage");

let client = null;
let starting = false;
let chamadasTimer = null;
const modoToscoRuntimeState = new Map();

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

    const avatarUrl = await findRobloxAvatar(user.id);
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

    if (avatarUrl) embed.setImage(avatarUrl);

    await interaction.editReply({ embeds: [embed] });
    console.log("editReply enviado");
  } catch (err) {
    console.error("Erro completo no /avatar:", err);
    await safeEditReply(interaction, {
      content: "Erro ao buscar avatar, tente novamente."
    });
  }
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

async function handleGuildMemberAdd(member) {
  console.log("Novo membro detectado para Boas-vindas:", {
    guildId: member.guild?.id || null,
    userId: member.user?.id || null
  });

  if (!member.guild?.id || mongoose.connection.readyState !== 1) return;

  try {
    const config = await ClanGuildConfig.findOne({ guildId: member.guild.id });

    if (!config || config.boasVindasEnabled !== true) {
      console.log("Boas-vindas ignorado: funcao desativada ou sem config.", {
        guildId: member.guild.id
      });
      return;
    }

    if (!config.boasVindasChannelId) {
      console.log("Boas-vindas ignorado: canal nao configurado.", {
        guildId: member.guild.id
      });
      return;
    }

    const channel = await member.guild.channels.fetch(config.boasVindasChannelId);

    if (!channel || typeof channel.send !== "function") {
      console.log("Boas-vindas erro: canal invalido ou sem envio.", {
        guildId: member.guild.id,
        channelId: config.boasVindasChannelId
      });
      return;
    }

    const imageBuffer = createWelcomeImageBuffer(member, config);
    const attachment = new AttachmentBuilder(imageBuffer, {
      name: "boas-vindas.svg"
    });
    console.log("Imagem Boas-vindas gerada:", {
      guildId: member.guild.id,
      userId: member.user.id
    });

    await channel.send({
      content: "Seja bem-vindo(a)!!",
      files: [attachment]
    });
    console.log("Mensagem Boas-vindas enviada:", {
      guildId: member.guild.id,
      channelId: config.boasVindasChannelId,
      userId: member.user.id
    });
  } catch (err) {
    console.error("Erro em Boas-vindas:", {
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
    hour12: false
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    timeKey: `${values.hour}:${values.minute}`
  };
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
  if (mongoose.connection.readyState !== 1) return;

  const { dateKey, timeKey } = saoPauloNowParts();
  const configs = await ClanGuildConfig.find({
    chamadasEnabled: true
  });

  for (const config of configs) {
    try {
      if (!config.chamadasChannelId) continue;

      if (config.chamadasTimeStart === timeKey && config.chamadasLastStartDate !== dateKey) {
        const question = chooseDailyQuestion(config.chamadasQuestions || [], config.chamadasLastQuestion);
        console.log("Pergunta escolhida para Chamadas:", {
          guildId: config.guildId,
          question: question || null
        });

        await sendChannelMessage(discordClient, config.chamadasChannelId, buildChamadaMessage(config, question));
        config.chamadasLastQuestion = question || config.chamadasLastQuestion || null;
        config.chamadasLastStartDate = dateKey;
        await config.save();
        console.log("Chamada enviada:", { guildId: config.guildId, channelId: config.chamadasChannelId });
      }

      if (config.chamadasTimeEnd === timeKey && config.chamadasLastEndDate !== dateKey) {
        const endMessage = config.chamadasEndMessage || DEFAULT_CHAMADAS_END_MESSAGE;
        await sendChannelMessage(discordClient, config.chamadasChannelId, endMessage);
        config.chamadasLastEndDate = dateKey;
        await config.save();
        console.log("Encerramento de chamada enviado:", {
          guildId: config.guildId,
          channelId: config.chamadasChannelId
        });
      }
    } catch (err) {
      console.error("Erro no agendamento de Chamadas:", {
        guildId: config.guildId,
        channelId: config.chamadasChannelId,
        erro: err.message
      });
    }
  }
}

function startChamadasScheduler(discordClient) {
  if (chamadasTimer) return;

  console.log("Agendador de Chamadas iniciado.");
  setTimeout(() => runChamadasTick(discordClient).catch(err => {
    console.error("Erro no primeiro tick de Chamadas:", err);
  }), 5000);

  chamadasTimer = setInterval(() => {
    runChamadasTick(discordClient).catch(err => {
      console.error("Erro no tick de Chamadas:", err);
    });
  }, 60000);
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
    await registerConfiguredGuildCommands();

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
      ]
    });

    client.once("ready", () => {
      console.log(`Bot Clan Cidio online como ${client.user.tag}`);
      console.log("Listeners Clan Cidio registrados. Intents: Guilds, GuildMessages, GuildMembers.");
      startChamadasScheduler(client);
    });

    client.on("interactionCreate", async interaction => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== "avatar") return;

      await handleAvatarCommand(interaction);
    });

    client.on("messageCreate", async message => {
      console.log("messageCreate recebido pelo bot Clan Cidio.");
      await handleModoToscoMessage(message);
    });

    client.on("guildMemberAdd", async member => {
      await handleGuildMemberAdd(member);
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
