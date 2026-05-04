require("dotenv").config();
const mongoose = require("mongoose");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} = require("discord.js");
const { ClanGuildConfig } = require("./models");
const { findRobloxUser, findRobloxAvatar } = require("./features");
const { registerConfiguredGuildCommands } = require("./registerCommands");

let client = null;
let starting = false;

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
