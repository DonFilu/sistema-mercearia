require("dotenv").config();
const axios = require("axios");

async function registerCommands() {
  const applicationId = process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!applicationId || !token) {
    throw new Error("Configure DISCORD_APPLICATION_ID ou DISCORD_CLIENT_ID e DISCORD_BOT_TOKEN.");
  }

  const commands = [
    {
      name: "avatar",
      description: "Mostra o avatar Roblox de um jogador.",
      options: [
        {
          name: "username",
          description: "Username do Roblox",
          type: 3,
          required: true
        }
      ]
    }
  ];

  await axios.put(
    `https://discord.com/api/v10/applications/${applicationId}/commands`,
    commands,
    {
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("Comandos Clan Cidio registrados com sucesso.");
}

registerCommands().catch(err => {
  console.error("Erro ao registrar comandos:", err.response?.data || err.message);
  process.exit(1);
});
