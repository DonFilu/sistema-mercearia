require("dotenv").config();
const mongoose = require("mongoose");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
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

let client = null;
let starting = false;
let chamadasTimer = null;

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
      intents: [GatewayIntentBits.Guilds]
    });

    client.once("ready", () => {
      console.log(`Bot Clan Cidio online como ${client.user.tag}`);
      startChamadasScheduler(client);
    });

    client.on("interactionCreate", async interaction => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== "avatar") return;

      await handleAvatarCommand(interaction);
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
