require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// --- IMPORTAÇÃO DO DISCORD.JS ---
const {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const app = express();

// --- CONFIGURAÇÃO DE ACESSO ---
const ID_DO_MEU_SERVIDOR = '1395161812969848893';
const COMANDANTE = 'don029033';
const EMOJI_APOIO = '💰';
const CANAL_APOIO_ID = '1404573733292605591';
const RECRUIT_CHANNEL_ID = process.env.RECRUIT_CHANNEL_ID;

const RECRUIT_ACCESS_ROLE_IDS = (process.env.RECRUIT_ACCESS_ROLE_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

// --- CONFIG ARENA ---
const ARENA_MIN_BET = 50;
const ARENA_MAX_BET = 1000;
const ARENA_MOVE_TIMEOUT_MS = 2 * 60 * 1000; // 2 min
const ARENA_HEARTBEAT_TIMEOUT_MS = 90 * 1000; // 90s

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('🟢 [DATABASE] Conectado com segurança!'))
    .catch(err => console.error('🔴 [DATABASE] Erro:', err));

// --- MODELOS ---
const UserSchema = new mongoose.Schema({
    discordId: String,
    username: String,
    avatar: String,
    coins: { type: Number, default: 50 },
    spins: { type: Number, default: 0 },
    bio: { type: String, default: "Soldado ALC" },
    online: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now },
    totalApoiado: { type: Number, default: 0 },

    // ARENA
    arenaWins: { type: Number, default: 0 },
    arenaLosses: { type: Number, default: 0 },
    arenaDraws: { type: Number, default: 0 },
    arenaPlayed: { type: Number, default: 0 },
    arenaLucro: { type: Number, default: 0 },
    arenaTotalWon: { type: Number, default: 0 }
});

const PostSchema = new mongoose.Schema({
    username: String,
    content: String,
    image: { type: String, default: "" },
    curtidas: { type: Number, default: 0 },
    apoioTotal: { type: Number, default: 0 },
    quemCurtiu: { type: Object, default: {} },
    date: { type: Date, default: Date.now }
});

const RecruitSchema = new mongoose.Schema({
    nome: { type: String, default: "" },
    idade: { type: String, default: "" },
    nickRoblox: { type: String, default: "" },
    nickDiscord: { type: String, default: "" },
    nickCla: { type: String, default: "" },
    recrutadoPor: { type: String, default: "" },

    jaParticipouCla: { type: String, default: "" },
    porqueQuerEntrar: { type: String, default: "" },
    estiloDeJogo: { type: String, default: "" },
    disponibilidade: { type: String, default: "" },
    aceitouRegras: { type: String, default: "" },

    autorMensagemId: { type: String, default: "" },
    autorMensagemNome: { type: String, default: "" },
    discordUserId: { type: String, default: "" },

    estaNoServidor: { type: Boolean, default: false },
    saiuDoServidor: { type: Boolean, default: false },
    ativo: { type: Boolean, default: false },

    messageId: { type: String, default: "" },
    channelId: { type: String, default: "" },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const DuelSchema = new mongoose.Schema({
    gameType: {
        type: String,
        enum: ['tic_tac_toe', 'odd_even', 'rps'],
        required: true
    },

    status: {
        type: String,
        enum: ['pending', 'active', 'finished', 'cancelled'],
        default: 'pending'
    },

    challengerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    challengerUsername: { type: String, required: true },

    opponentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    opponentUsername: { type: String, required: true },

    pendingForUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    stakeChallenger: { type: Number, required: true },
    stakeOpponent: { type: Number, required: true },
    currentStake: { type: Number, required: true },
    pot: { type: Number, default: 0 },

    lockedCoins: { type: Boolean, default: false },

    currentTurnUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    winnerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    loserUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    finishReason: { type: String, default: "" },

    round: { type: Number, default: 1 },

    // jogo da velha
    board: {
        type: [String],
        default: ['', '', '', '', '', '', '', '', '']
    },
    challengerSymbol: { type: String, default: 'X' },
    opponentSymbol: { type: String, default: 'O' },

    // par ou ímpar
    oddEvenChoiceChallenger: { type: String, default: "" },
    oddEvenChoiceOpponent: { type: String, default: "" },
    oddEvenNumberChallenger: { type: Number, default: null },
    oddEvenNumberOpponent: { type: Number, default: null },

    // jokenpo
    rpsChoiceChallenger: { type: String, default: "" },
    rpsChoiceOpponent: { type: String, default: "" },

    // controle
    lastActionAt: { type: Date, default: Date.now },
    lastSeenChallengerAt: { type: Date, default: Date.now },
    lastSeenOpponentAt: { type: Date, default: Date.now },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

DuelSchema.index({ challengerUserId: 1, status: 1 });
DuelSchema.index({ opponentUserId: 1, status: 1 });
DuelSchema.index({ status: 1, updatedAt: -1 });

const User = mongoose.model('User', UserSchema);
const Post = mongoose.model('Post', PostSchema);
const Recruit = mongoose.model('Recruit', RecruitSchema);
const Duel = mongoose.model('Duel', DuelSchema);

// --- CONFIGURAÇÃO DO BOT ---
const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.User]
});

// --- HELPERS GERAIS ---
async function getGuildMemberByDiscordId(discordId) {
    try {
        const guild = await bot.guilds.fetch(ID_DO_MEU_SERVIDOR);
        const member = await guild.members.fetch(discordId);
        return member || null;
    } catch {
        return null;
    }
}

async function userHasRecruitAccess(user) {
    if (!user) return false;

    if (user.username === COMANDANTE) return true;
    if (RECRUIT_ACCESS_ROLE_IDS.length === 0) return false;

    const member = await getGuildMemberByDiscordId(user.discordId);
    if (!member) return false;

    return member.roles.cache.some(role => RECRUIT_ACCESS_ROLE_IDS.includes(role.id));
}

async function requireRecruitAccess(req, res, next) {
    const allowed = await userHasRecruitAccess(req.user);
    if (!allowed) {
        return res.status(403).json({ error: "Sem permissão" });
    }
    next();
}

function sanitizeText(value, max = 500) {
    return String(value || '').trim().slice(0, max);
}

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLine(line) {
    return String(line || '')
        .replace(/\*\*/g, '')
        .replace(/__+/g, '')
        .replace(/`/g, '')
        .replace(/\t/g, ' ')
        .replace(/[📛🎂🎮💬🛡️❓✔️]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseRecruitForm(text) {
    const lines = String(text || '')
        .split('\n')
        .map(normalizeLine)
        .filter(Boolean);

    const data = {
        nome: "",
        idade: "",
        nickRoblox: "",
        nickDiscord: "",
        nickCla: "",
        recrutadoPor: "",
        jaParticipouCla: "",
        porqueQuerEntrar: "",
        estiloDeJogo: "",
        disponibilidade: "",
        aceitouRegras: ""
    };

    const fieldMap = [
        { key: 'nome', labels: ['Nome'] },
        { key: 'idade', labels: ['Idade'] },
        { key: 'nickRoblox', labels: ['Nick no Roblox'] },
        { key: 'nickDiscord', labels: ['Nick no Discord'] },
        { key: 'nickCla', labels: ['Nick desejado no Clã', 'Nick desejado no Cla'] },
        { key: 'recrutadoPor', labels: ['Recrutado por (Qm mandou o link)', 'Recrutado por'] },
        { key: 'jaParticipouCla', labels: ['Já participou de algum clã anteriormente?', 'Ja participou de algum clã anteriormente?', 'Já participou de algum clã', 'Ja participou de algum clã'] },
        { key: 'porqueQuerEntrar', labels: ['Por que deseja entrar no nosso clã?', 'Por que deseja entrar no nosso cla?', 'Por que deseja entrar'] },
        { key: 'estiloDeJogo', labels: ['Qual seu estilo de jogo?'] },
        { key: 'disponibilidade', labels: ['Disponibilidade de horário', 'Disponibilidade de horario'] },
        { key: 'aceitouRegras', labels: ['Compromete-se a seguir as regras e respeitar os membros do clã?', 'Compromete-se a seguir as regras e respeitar os membros do cla?'] }
    ];

    function findFieldIndex(labels) {
        return lines.findIndex(line => {
            const lower = line.toLowerCase();
            return labels.some(label => lower.startsWith(label.toLowerCase()));
        });
    }

    function extractField(labels) {
        const idx = findFieldIndex(labels);
        if (idx === -1) return "";

        const current = lines[idx];

        const colonIndex = current.indexOf(':');
        if (colonIndex !== -1) {
            const inlineValue = current.slice(colonIndex + 1).trim();
            if (inlineValue) return inlineValue;
        }

        const questionIndex = current.indexOf('?');
        if (questionIndex !== -1) {
            const inlineValue = current.slice(questionIndex + 1).trim();
            if (inlineValue) return inlineValue;
        }

        const collected = [];
        for (let i = idx + 1; i < lines.length; i++) {
            const next = lines[i];

            const isNextField = fieldMap.some(field =>
                field.labels.some(label => next.toLowerCase().startsWith(label.toLowerCase()))
            );

            if (isNextField) break;
            if (next.includes('━━━━━━━━')) continue;
            if (next.startsWith('(Ex.:')) continue;
            if (
                next === '( ) Sim' ||
                next === '( ) Não' ||
                next === '( ) Nao' ||
                next === '(X) Sim' ||
                next === '(X) Não' ||
                next === '(X) Nao'
            ) continue;

            collected.push(next);
        }

        return collected.join(' ').trim();
    }

    for (const field of fieldMap) {
        data[field.key] = extractField(field.labels);
    }

    const textoLower = String(text || '').toLowerCase();
    if (textoLower.includes('(x) sim')) {
        data.aceitouRegras = 'Sim';
    } else if (textoLower.includes('(x) não') || textoLower.includes('(x) nao')) {
        data.aceitouRegras = 'Não';
    } else if (!data.aceitouRegras) {
        data.aceitouRegras = 'Não informado';
    }

    return data;
}

function isRecruitFormMessage(text) {
    const normalized = normalizeLine(text).toLowerCase();
    return normalized.includes('ficha de recrutamento') && normalized.includes('nick no roblox');
}

async function syncRecruitStatus(recruit) {
    try {
        if (!recruit?.discordUserId) return false;

        const member = await getGuildMemberByDiscordId(recruit.discordUserId);
        const estaNoServidor = !!member;

        recruit.estaNoServidor = estaNoServidor;
        recruit.saiuDoServidor = !estaNoServidor;
        recruit.ativo = estaNoServidor;
        recruit.updatedAt = new Date();

        await recruit.save();
        return true;
    } catch (err) {
        console.error(`🔴 Erro ao sincronizar recruit ${recruit?._id}:`, err);
        return false;
    }
}

async function syncAllRecruitsStatus() {
    try {
        const recruits = await Recruit.find({ discordUserId: { $ne: "" } });
        if (!recruits.length) return;

        console.log(`🛰️ [SYNC] Iniciando sync de ${recruits.length} recrutados...`);

        for (const recruit of recruits) {
            await syncRecruitStatus(recruit);
        }

        console.log(`✅ [SYNC] Sync finalizado.`);
    } catch (err) {
        console.error('🔴 Erro no sync geral dos recrutados:', err);
    }
}

// --- HELPERS ARENA ---
function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Faça login primeiro" });
    next();
}

function isValidGameType(gameType) {
    return ['tic_tac_toe', 'odd_even', 'rps'].includes(gameType);
}

function checkWinnerTicTacToe(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[b] === board[c]) {
            return board[a];
        }
    }

    return null;
}

function resetTicTacToeRound(duel) {
    duel.board = ['', '', '', '', '', '', '', '', ''];
    duel.round += 1;
    duel.currentTurnUserId = (duel.round % 2 === 0) ? duel.opponentUserId : duel.challengerUserId;
    duel.lastActionAt = new Date();
    duel.updatedAt = new Date();
}

function resetOddEvenRound(duel) {
    duel.oddEvenChoiceChallenger = "";
    duel.oddEvenChoiceOpponent = "";
    duel.oddEvenNumberChallenger = null;
    duel.oddEvenNumberOpponent = null;
    duel.round += 1;
    duel.lastActionAt = new Date();
    duel.updatedAt = new Date();
}

function resetRpsRound(duel) {
    duel.rpsChoiceChallenger = "";
    duel.rpsChoiceOpponent = "";
    duel.round += 1;
    duel.lastActionAt = new Date();
    duel.updatedAt = new Date();
}

async function getActiveOrPendingDuelForUser(userId) {
    return Duel.findOne({
        status: { $in: ['pending', 'active'] },
        $or: [
            { challengerUserId: userId },
            { opponentUserId: userId }
        ]
    });
}

function toArenaPublicDuel(duel, viewerUserId = null) {
    const viewerId = viewerUserId ? String(viewerUserId) : null;
    const isChallenger = viewerId && String(duel.challengerUserId) === viewerId;
    const isOpponent = viewerId && String(duel.opponentUserId) === viewerId;

    let yourSide = null;
    if (isChallenger) yourSide = 'challenger';
    if (isOpponent) yourSide = 'opponent';

    const yourTurn = duel.gameType === 'tic_tac_toe'
        ? !!viewerId && !!duel.currentTurnUserId && String(duel.currentTurnUserId) === viewerId
        : false;

    const youAlreadyPlayedOddEven = isChallenger
        ? (!!duel.oddEvenChoiceChallenger || duel.oddEvenNumberChallenger !== null)
        : isOpponent
            ? (!!duel.oddEvenChoiceOpponent || duel.oddEvenNumberOpponent !== null)
            : false;

    const opponentAlreadyPlayedOddEven = isChallenger
        ? (!!duel.oddEvenChoiceOpponent || duel.oddEvenNumberOpponent !== null)
        : isOpponent
            ? (!!duel.oddEvenChoiceChallenger || duel.oddEvenNumberChallenger !== null)
            : false;

    const youAlreadyPlayedRps = isChallenger
        ? !!duel.rpsChoiceChallenger
        : isOpponent
            ? !!duel.rpsChoiceOpponent
            : false;

    const opponentAlreadyPlayedRps = isChallenger
        ? !!duel.rpsChoiceOpponent
        : isOpponent
            ? !!duel.rpsChoiceChallenger
            : false;

    const waitingOpponent =
        duel.status === 'active' &&
        (
            (duel.gameType === 'odd_even' && youAlreadyPlayedOddEven && !opponentAlreadyPlayedOddEven) ||
            (duel.gameType === 'rps' && youAlreadyPlayedRps && !opponentAlreadyPlayedRps)
        );

    return {
        _id: duel._id,
        gameType: duel.gameType,
        status: duel.status,
        challengerUsername: duel.challengerUsername,
        opponentUsername: duel.opponentUsername,
        challengerUserId: duel.challengerUserId,
        opponentUserId: duel.opponentUserId,
        pendingForUserId: duel.pendingForUserId,
        stakeChallenger: duel.stakeChallenger,
        stakeOpponent: duel.stakeOpponent,
        currentStake: duel.currentStake,
        pot: duel.pot,
        round: duel.round,
        board: duel.board,
        currentTurnUserId: duel.currentTurnUserId,
        winnerUserId: duel.winnerUserId,
        loserUserId: duel.loserUserId,
        finishReason: duel.finishReason,
        yourSide,
        yourTurn,
        waitingOpponent,
        youAlreadyPlayedOddEven,
        opponentAlreadyPlayedOddEven,
        youAlreadyPlayedRps,
        opponentAlreadyPlayedRps,
        oddEvenReadyCount: [
            duel.oddEvenChoiceChallenger && duel.oddEvenNumberChallenger !== null,
            duel.oddEvenChoiceOpponent && duel.oddEvenNumberOpponent !== null
        ].filter(Boolean).length,
        rpsReadyCount: [
            !!duel.rpsChoiceChallenger,
            !!duel.rpsChoiceOpponent
        ].filter(Boolean).length,
        createdAt: duel.createdAt,
        updatedAt: duel.updatedAt
    };
}

async function finishDuel({
    duel,
    winnerUserId = null,
    loserUserId = null,
    finishReason = '',
    isDraw = false
}) {
    const sessionDb = await mongoose.startSession();

    try {
        await sessionDb.withTransaction(async () => {
            const duelDoc = await Duel.findById(duel._id).session(sessionDb);
            if (!duelDoc || duelDoc.status === 'finished' || duelDoc.status === 'cancelled') return;

            const challenger = await User.findById(duelDoc.challengerUserId).session(sessionDb);
            const opponent = await User.findById(duelDoc.opponentUserId).session(sessionDb);
            if (!challenger || !opponent) throw new Error('Jogadores não encontrados');

            duelDoc.status = 'finished';
            duelDoc.finishReason = finishReason || (isDraw ? 'empate' : 'finalizado');
            duelDoc.updatedAt = new Date();

            challenger.arenaPlayed += 1;
            opponent.arenaPlayed += 1;

            if (isDraw) {
                challenger.coins += duelDoc.stakeChallenger;
                opponent.coins += duelDoc.stakeOpponent;
                challenger.arenaDraws += 1;
                opponent.arenaDraws += 1;
                duelDoc.winnerUserId = null;
                duelDoc.loserUserId = null;
            } else {
                const winner = String(challenger._id) === String(winnerUserId) ? challenger : opponent;
                const loser = String(challenger._id) === String(loserUserId) ? challenger : opponent;

                winner.coins += duelDoc.pot;
                winner.arenaWins += 1;
                winner.arenaTotalWon += duelDoc.pot;
                winner.arenaLucro += (
                    duelDoc.pot -
                    (String(winner._id) === String(challenger._id)
                        ? duelDoc.stakeChallenger
                        : duelDoc.stakeOpponent)
                );

                loser.arenaLosses += 1;

                duelDoc.winnerUserId = winner._id;
                duelDoc.loserUserId = loser._id;
            }

            await challenger.save({ session: sessionDb });
            await opponent.save({ session: sessionDb });
            await duelDoc.save({ session: sessionDb });
        });
    } finally {
        await sessionDb.endSession();
    }
}

async function activateDuelWithLockedCoins(duelId) {
    const sessionDb = await mongoose.startSession();

    try {
        await sessionDb.withTransaction(async () => {
            const duel = await Duel.findById(duelId).session(sessionDb);
            if (!duel) throw new Error('Duelo não encontrado');
            if (duel.status !== 'pending') throw new Error('Duelo não está pendente');

            const challenger = await User.findById(duel.challengerUserId).session(sessionDb);
            const opponent = await User.findById(duel.opponentUserId).session(sessionDb);

            if (!challenger || !opponent) throw new Error('Jogadores não encontrados');
            if (challenger.coins < duel.currentStake) throw new Error(`${challenger.username} sem saldo suficiente`);
            if (opponent.coins < duel.currentStake) throw new Error(`${opponent.username} sem saldo suficiente`);

            challenger.coins -= duel.currentStake;
            opponent.coins -= duel.currentStake;

            duel.stakeChallenger = duel.currentStake;
            duel.stakeOpponent = duel.currentStake;
            duel.pot = duel.currentStake * 2;
            duel.lockedCoins = true;
            duel.status = 'active';
            duel.pendingForUserId = null;
            duel.currentTurnUserId = duel.challengerUserId;
            duel.lastActionAt = new Date();
            duel.lastSeenChallengerAt = new Date();
            duel.lastSeenOpponentAt = new Date();
            duel.updatedAt = new Date();

            await challenger.save({ session: sessionDb });
            await opponent.save({ session: sessionDb });
            await duel.save({ session: sessionDb });
        });
    } finally {
        await sessionDb.endSession();
    }
}

async function processArenaTimeouts() {
    try {
        const activeDuels = await Duel.find({ status: 'active' });

        for (const duel of activeDuels) {
            const now = Date.now();

            const challengerAway = now - new Date(duel.lastSeenChallengerAt).getTime() > ARENA_HEARTBEAT_TIMEOUT_MS;
            const opponentAway = now - new Date(duel.lastSeenOpponentAt).getTime() > ARENA_HEARTBEAT_TIMEOUT_MS;

            if (challengerAway && !opponentAway) {
                await finishDuel({
                    duel,
                    winnerUserId: duel.opponentUserId,
                    loserUserId: duel.challengerUserId,
                    finishReason: 'derrota_por_saida'
                });
                continue;
            }

            if (opponentAway && !challengerAway) {
                await finishDuel({
                    duel,
                    winnerUserId: duel.challengerUserId,
                    loserUserId: duel.opponentUserId,
                    finishReason: 'derrota_por_saida'
                });
                continue;
            }

            if (duel.gameType === 'tic_tac_toe' && duel.currentTurnUserId) {
                const inactiveTooLong = now - new Date(duel.lastActionAt).getTime() > ARENA_MOVE_TIMEOUT_MS;
                if (inactiveTooLong) {
                    const loserUserId = duel.currentTurnUserId;
                    const winnerUserId = String(loserUserId) === String(duel.challengerUserId)
                        ? duel.opponentUserId
                        : duel.challengerUserId;

                    await finishDuel({
                        duel,
                        winnerUserId,
                        loserUserId,
                        finishReason: 'tempo_esgotado'
                    });
                }
            }
        }
    } catch (err) {
        console.error('🔴 Erro ao processar timeouts da arena:', err);
    }
}

// --- BOT READY ---
bot.once('ready', async () => {
    console.log(`🐺 BOT ALC CONECTADO: ${bot.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('perfil')
            .setDescription('Consulta seu saldo de LC e status no Clã ALC')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log('✅ Comando /perfil registrado!');
    } catch (e) {
        console.error('🔴 Erro comandos:', e);
    }

    await syncAllRecruitsStatus();
    setInterval(syncAllRecruitsStatus, 5 * 60 * 1000);
    setInterval(processArenaTimeouts, 20 * 1000);
});

// --- SLASH COMMANDS ---
bot.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'perfil') return;

    try {
        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
            return interaction.reply({
                content: "❌ Soldado, faça login no site primeiro!",
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🪖 DOSSIÊ ALC - ${user.username}`)
            .setThumbnail(user.avatar || interaction.user.displayAvatarURL())
            .setColor('#00d4ff')
            .addFields(
                { name: '🪙 Saldo LC', value: `**${user.coins.toLocaleString()}**`, inline: true },
                { name: '🎰 Giros', value: `**${user.spins}**`, inline: true },
                { name: '🎖️ Prestígio', value: `**${user.totalApoiado || 0} LC**`, inline: true },
                { name: '🏆 Arena', value: `Vitórias: **${user.arenaWins || 0}** | Ganhos: **${user.arenaTotalWon || 0} LC**` },
                { name: '📜 Bio', value: user.bio || "Soldado do Clã ALC" }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } catch (err) {
        console.error(err);
    }
});

// --- APOIO POR REAÇÃO ---
bot.on('messageReactionAdd', async (reaction, discordUser) => {
    if (discordUser.bot || reaction.emoji.name !== EMOJI_APOIO) return;

    if (reaction.message.channel.id !== CANAL_APOIO_ID && reaction.message.channel.parentId !== CANAL_APOIO_ID) return;

    if (reaction.partial) await reaction.fetch();

    try {
        const doador = await User.findOne({ discordId: discordUser.id });
        const receptor = await User.findOne({ discordId: reaction.message.author.id });

        if (!doador || !receptor || doador.discordId === receptor.discordId) return;

        if (doador.coins >= 50) {
            doador.coins -= 50;
            doador.totalApoiado = (doador.totalApoiado || 0) + 50;
            receptor.coins += 50;

            await doador.save();
            await receptor.save();

            const msg = await reaction.message.channel.send(
                `🎖️ **APOIO!** <@${discordUser.id}> enviou **50 LC** para <@${reaction.message.author.id}>!`
            );

            setTimeout(() => msg.delete().catch(() => null), 10000);
        } else {
            await reaction.users.remove(discordUser.id).catch(() => null);
            discordUser.send("⚠️ Saldo insuficiente!").catch(() => null);
        }
    } catch (err) {
        console.error(err);
    }
});

// --- CAPTURA AUTOMÁTICA DE FICHAS ---
bot.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;
        if (!RECRUIT_CHANNEL_ID) return;
        if (message.channel.id !== RECRUIT_CHANNEL_ID) return;
        if (!isRecruitFormMessage(message.content)) return;

        const parsed = parseRecruitForm(message.content);
        const discordMention = message.mentions.users.first() || null;
        const discordUserId = discordMention?.id || "";

        if (discordUserId) {
            const existente = await Recruit.findOne({ discordUserId }).sort({ createdAt: -1 });
            if (existente) {
                existente.nome = parsed.nome || existente.nome;
                existente.idade = parsed.idade || existente.idade;
                existente.nickRoblox = parsed.nickRoblox || existente.nickRoblox;
                existente.nickDiscord = parsed.nickDiscord || existente.nickDiscord;
                existente.nickCla = parsed.nickCla || existente.nickCla;
                existente.recrutadoPor = parsed.recrutadoPor || existente.recrutadoPor;
                existente.jaParticipouCla = parsed.jaParticipouCla || existente.jaParticipouCla;
                existente.porqueQuerEntrar = parsed.porqueQuerEntrar || existente.porqueQuerEntrar;
                existente.estiloDeJogo = parsed.estiloDeJogo || existente.estiloDeJogo;
                existente.disponibilidade = parsed.disponibilidade || existente.disponibilidade;
                existente.aceitouRegras = parsed.aceitouRegras || existente.aceitouRegras;

                existente.autorMensagemId = message.author.id;
                existente.autorMensagemNome = message.author.username;
                existente.messageId = message.id;
                existente.channelId = message.channel.id;
                existente.updatedAt = new Date();

                await syncRecruitStatus(existente);

                console.log(`♻️ [RECRUIT] Ficha atualizada: ${existente.nome || 'Sem nome'} | ${existente._id}`);

                await message.delete().catch(() => null);
                await message.channel.send({
                    content: `♻️ Ficha de recrutamento de **${existente.nome || 'recrutado'}** atualizada no QG.`
                }).then(msg => setTimeout(() => msg.delete().catch(() => null), 6000)).catch(() => null);

                return;
            }
        }

        let estaNoServidor = false;
        if (discordMention) {
            const member = await getGuildMemberByDiscordId(discordMention.id);
            estaNoServidor = !!member;
        }

        const recruit = await Recruit.create({
            nome: parsed.nome,
            idade: parsed.idade,
            nickRoblox: parsed.nickRoblox,
            nickDiscord: parsed.nickDiscord,
            nickCla: parsed.nickCla,
            recrutadoPor: parsed.recrutadoPor,

            jaParticipouCla: parsed.jaParticipouCla,
            porqueQuerEntrar: parsed.porqueQuerEntrar,
            estiloDeJogo: parsed.estiloDeJogo,
            disponibilidade: parsed.disponibilidade,
            aceitouRegras: parsed.aceitouRegras,

            autorMensagemId: message.author.id,
            autorMensagemNome: message.author.username,
            discordUserId,

            estaNoServidor,
            saiuDoServidor: discordUserId ? !estaNoServidor : false,
            ativo: estaNoServidor,

            messageId: message.id,
            channelId: message.channel.id,
            updatedAt: new Date()
        });

        console.log(`📋 [RECRUIT] Ficha salva: ${recruit.nome || 'Sem nome'} | ${recruit._id}`);

        await message.delete().catch(() => null);

        await message.channel.send({
            content: `✅ Ficha de recrutamento de **${recruit.nome || 'recrutado'}** salva no QG com sucesso.`
        }).then(msg => {
            setTimeout(() => msg.delete().catch(() => null), 6000);
        }).catch(() => null);

    } catch (err) {
        console.error("🔴 Erro ao processar ficha de recrutamento:", err);
    }
});

// --- AUTH ---
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => User.findById(id).then(u => done(null, u)));

passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.CALLBACK_URL,
    scope: ['identify', 'guilds']
}, async (at, rt, profile, done) => {
    try {
        const estaNoServidor = profile.guilds.some(g => g.id === ID_DO_MEU_SERVIDOR);
        if (!estaNoServidor) return done(null, false);

        let user = await User.findOne({ discordId: profile.id });

        const avatarUrl = profile.avatar
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${Number(profile.discriminator || 0) % 5}.png`;

        if (!user) {
            user = await User.create({
                discordId: profile.id,
                username: profile.username,
                avatar: avatarUrl
            });
        } else {
            user.avatar = avatarUrl;
            user.username = profile.username;
            await user.save();
        }

        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || 'lobo-alc-segredo-eterno',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));

// --- ROTAS DE USUÁRIO ---
app.get('/api/me', async (req, res) => {
    if (!req.user) return res.json(null);

    const recruitAccess = await userHasRecruitAccess(req.user);

    res.json({
        ...req.user.toObject(),
        recruitAccess
    });
});

app.get('/api/membros', async (req, res) => {
    const membros = await User.find({}, 'username avatar coins bio online totalApoiado arenaWins arenaLosses arenaPlayed arenaTotalWon arenaLucro')
        .sort({ online: -1, coins: -1 });

    res.json(membros);
});

app.post('/api/heartbeat', async (req, res) => {
    if (!req.user) return res.status(401).send();

    await User.findByIdAndUpdate(req.user.id, {
        lastActive: new Date(),
        online: true
    });

    res.json({ success: true });
});

app.post('/api/update-bio', async (req, res) => {
    if (!req.user) return res.status(401).send();

    const bio = sanitizeText(req.body.bio, 150);
    if (bio.length > 150) {
        return res.status(400).json({ error: "Bio muito longa" });
    }

    await User.findByIdAndUpdate(req.user.id, { bio });
    res.json({ success: true });
});

// --- CASSINO ---
app.post('/api/casino/spin', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Não logado" });

    const user = await User.findById(req.user.id);
    const bet = parseInt(req.body.bet, 10);

    if (![10, 50, 100].includes(bet) || user.spins <= 0 || user.coins < bet) {
        return res.status(400).json({ error: "Erro" });
    }

    const icons = ['🐺', '🪙', '⚔️', '🛡️'];
    const result = [
        icons[Math.floor(Math.random() * 4)],
        icons[Math.floor(Math.random() * 4)],
        icons[Math.floor(Math.random() * 4)]
    ];

    user.spins -= 1;
    user.coins -= bet;

    let ganho = (result[0] === result[1] && result[1] === result[2]) ? bet * 7 : 0;

    user.coins += ganho;
    await user.save();

    res.json({
        success: true,
        result,
        ganho,
        coins: user.coins,
        spins: user.spins
    });
});

app.post('/api/casino/buy-spin', async (req, res) => {
    if (!req.user) return res.status(401).send();

    const user = await User.findById(req.user.id);

    if (user.coins < 50) {
        return res.status(400).json({ error: "Saldo insuficiente" });
    }

    user.coins -= 50;
    user.spins += 1;
    await user.save();

    res.json({
        success: true,
        coins: user.coins,
        spins: user.spins
    });
});

// --- POSTS ---
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await Post.find().sort({ date: -1 }).limit(50).lean();

        const postsTratados = posts.map(p => ({
            ...p,
            curtidas: p.curtidas || 0,
            apoioTotal: p.apoioTotal || p.apoio || 0,
            quemCurtiu: p.quemCurtiu || {}
        }));

        res.json(postsTratados);
    } catch (err) {
        console.error("Erro ao carregar mural:", err);
        res.status(500).json({ error: "Erro ao buscar posts" });
    }
});

app.post('/api/posts', async (req, res) => {
    if (!req.user) return res.status(401).send();

    const content = sanitizeText(req.body.content, 500);
    const image = sanitizeText(req.body.image, 1000);

    if (!content && !image) {
        return res.status(400).json({ error: "Post vazio" });
    }

    let post;

    try {
        post = await Post.create({
            username: req.user.username,
            content,
            image,
            quemCurtiu: {},
            curtidas: 0,
            apoioTotal: 0
        });

        const CANAL_NOTIFICACAO_ID = '1395519629581090928';
        const URL_DO_SITE = 'https://alcsocial-production.up.railway.app/';

        const canal = await bot.channels.fetch(CANAL_NOTIFICACAO_ID).catch(() => null);

        if (canal) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('VER NO QG OFICIAL')
                    .setURL(URL_DO_SITE)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji('🐺')
            );

            const embedNotificacao = new EmbedBuilder()
                .setColor('#00d4ff')
                .setAuthor({ name: req.user.username, iconURL: req.user.avatar })
                .setDescription(content ? content.substring(0, 500) : "📢 Nova imagem publicada no mural!")
                .setFooter({ text: 'Clã ALC - Unidade de Elite' })
                .setTimestamp();

            if (image) embedNotificacao.setImage(image);

            await canal.send({
                content: `📢 **${req.user.username}** fez uma publicação, reaja ou apoie no QG!`,
                embeds: [embedNotificacao],
                components: [row]
            }).catch(() => console.log("Erro ao enviar para o Discord, mas o post foi salvo."));
        }

        res.json(post);
    } catch (err) {
        console.error("Erro ao criar post:", err);
        if (post) res.json(post);
        else res.status(500).json({ error: "Erro interno" });
    }
});

app.delete('/api/posts/:id', async (req, res) => {
    if (!req.user) return res.status(401).send();

    const post = await Post.findById(req.params.id);

    if (post && (post.username === req.user.username || req.user.username === COMANDANTE)) {
        await Post.findByIdAndDelete(req.params.id);
        return res.json({ success: true });
    }

    res.status(403).send();
});

app.post('/api/posts/interact/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Faça login primeiro" });

    const { tipo } = req.body;

    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post não encontrado" });

        if (tipo === 'like') {
            const userId = req.user.username;
            if (!post.quemCurtiu) post.quemCurtiu = {};

            const count = post.quemCurtiu[userId] || 0;

            if (count < 5) {
                post.quemCurtiu[userId] = count + 1;
                post.curtidas += 1;
                post.markModified('quemCurtiu');
                await post.save();

                return res.json({ success: true, curtidas: post.curtidas });
            } else {
                return res.json({ success: false, error: "Limite de 5 curtidas atingido!" });
            }
        }

        if (tipo === 'apoio') {
            const doador = await User.findById(req.user.id);

            if (doador.username === post.username) {
                return res.json({ success: false, error: "Você não pode apoiar a si mesmo!" });
            }

            if (doador.coins >= 50) {
                doador.coins -= 50;
                doador.totalApoiado = (doador.totalApoiado || 0) + 50;
                await doador.save();

                await User.findOneAndUpdate(
                    { username: post.username },
                    { $inc: { coins: 50 } }
                );

                post.apoioTotal += 50;
                await post.save();

                return res.json({
                    success: true,
                    apoioTotal: post.apoioTotal,
                    novoSaldo: doador.coins
                });
            } else {
                return res.json({
                    success: false,
                    error: "Saldo insuficiente (50 LC necessários)"
                });
            }
        }

        return res.status(400).json({ success: false, error: "Tipo inválido" });
    } catch (err) {
        console.error("ERRO NA INTERAÇÃO:", err);
        res.status(500).json({ success: false, error: "Erro interno no servidor" });
    }
});

// --- RECRUITS / FICHAS ---
app.get('/api/recruits', requireRecruitAccess, async (req, res) => {
    try {
        const q = sanitizeText(req.query.q || '', 100);
        const status = sanitizeText(req.query.status || 'todos', 50).toLowerCase();
        const recrutador = sanitizeText(req.query.recrutador || '', 100);

        const andFilters = [];

        if (q) {
            const qRegex = new RegExp(escapeRegex(q), 'i');
            andFilters.push({
                $or: [
                    { nome: qRegex },
                    { nickDiscord: qRegex },
                    { nickRoblox: qRegex },
                    { nickCla: qRegex },
                    { recrutadoPor: qRegex }
                ]
            });
        }

        if (recrutador) {
            const recrutadorRegex = new RegExp(escapeRegex(recrutador), 'i');
            andFilters.push({ recrutadoPor: recrutadorRegex });
        }

        if (status === 'no_servidor') {
            andFilters.push({ estaNoServidor: true });
        } else if (status === 'fora_servidor') {
            andFilters.push({ estaNoServidor: false });
        } else if (status === 'ativos') {
            andFilters.push({ ativo: true });
        } else if (status === 'inativos') {
            andFilters.push({ ativo: false });
        } else if (status === 'saiu_cla') {
            andFilters.push({ saiuDoServidor: true });
        }

        const filtro = andFilters.length > 0 ? { $and: andFilters } : {};

        const recruits = await Recruit.find(filtro)
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        res.json(recruits);
    } catch (err) {
        console.error("Erro ao buscar recruits:", err);
        res.status(500).json({ error: "Erro ao buscar fichas" });
    }
});

app.get('/api/recruits/:id', requireRecruitAccess, async (req, res) => {
    try {
        const recruit = await Recruit.findById(req.params.id).lean();

        if (!recruit) {
            return res.status(404).json({ error: "Ficha não encontrada" });
        }

        res.json(recruit);
    } catch (err) {
        console.error("Erro ao abrir recruit:", err);
        res.status(500).json({ error: "Erro ao abrir ficha" });
    }
});

// =============================
// ======== ARENA API =========
// =============================

app.get('/api/arena/ranking', requireAuth, async (req, res) => {
    try {
        const ranking = await User.find(
            {},
            'username avatar arenaWins arenaLosses arenaDraws arenaPlayed arenaLucro arenaTotalWon'
        )
            .sort({ arenaTotalWon: -1, arenaWins: -1, arenaLucro: -1, username: 1 })
            .limit(20)
            .lean();

        const rankingTratado = ranking.map((u, index) => ({
            posicao: index + 1,
            username: u.username,
            avatar: u.avatar,
            arenaWins: u.arenaWins || 0,
            arenaLosses: u.arenaLosses || 0,
            arenaDraws: u.arenaDraws || 0,
            arenaPlayed: u.arenaPlayed || 0,
            arenaLucro: u.arenaLucro || 0,
            arenaTotalWon: u.arenaTotalWon || 0,
            arenaWinRate: (u.arenaPlayed || 0) > 0
                ? Math.round(((u.arenaWins || 0) / u.arenaPlayed) * 100)
                : 0
        }));

        res.json(rankingTratado);
    } catch (err) {
        console.error('Erro ao carregar ranking da arena:', err);
        res.status(500).json({ error: 'Erro ao carregar ranking' });
    }
});

app.get('/api/arena/state', requireAuth, async (req, res) => {
    try {
        const duel = await Duel.findOne({
            status: { $in: ['pending', 'active'] },
            $or: [
                { challengerUserId: req.user.id },
                { opponentUserId: req.user.id }
            ]
        }).lean();

        res.json({
            duel: duel ? toArenaPublicDuel(duel, req.user.id) : null
        });
    } catch (err) {
        console.error('Erro ao buscar estado da arena:', err);
        res.status(500).json({ error: 'Erro ao buscar estado da arena' });
    }
});

app.get('/api/arena/duels', requireAuth, async (req, res) => {
    try {
        const duels = await Duel.find({
            status: { $in: ['pending', 'active'] },
            $or: [
                { challengerUserId: req.user.id },
                { opponentUserId: req.user.id }
            ]
        }).sort({ updatedAt: -1 });

        res.json(duels.map(d => toArenaPublicDuel(d, req.user.id)));
    } catch (err) {
        console.error('Erro ao carregar duelos:', err);
        res.status(500).json({ error: 'Erro ao carregar duelos' });
    }
});

app.post('/api/arena/duels', requireAuth, async (req, res) => {
    try {
        const gameType = sanitizeText(req.body.gameType, 50);
        const opponentUsername = sanitizeText(req.body.opponentUsername, 100);
        const currentStake = parseInt(req.body.stake, 10);

        if (!isValidGameType(gameType)) {
            return res.status(400).json({ error: 'Jogo inválido' });
        }

        if (!opponentUsername) {
            return res.status(400).json({ error: 'Escolha um adversário' });
        }

        if (
            Number.isNaN(currentStake) ||
            currentStake < ARENA_MIN_BET ||
            currentStake > ARENA_MAX_BET
        ) {
            return res.status(400).json({ error: `Aposta deve ser entre ${ARENA_MIN_BET} e ${ARENA_MAX_BET} LC` });
        }

        const challenger = await User.findById(req.user.id);
        if (!challenger) return res.status(404).json({ error: 'Jogador não encontrado' });

        const opponent = await User.findOne({ username: opponentUsername });
        if (!opponent) return res.status(404).json({ error: 'Adversário não encontrado' });

        if (String(opponent._id) === String(challenger._id)) {
            return res.status(400).json({ error: 'Você não pode desafiar a si mesmo' });
        }

        if (!opponent.online) {
            return res.status(400).json({ error: 'Adversário precisa estar online' });
        }

        if (challenger.coins < currentStake) {
            return res.status(400).json({ error: 'Saldo insuficiente para criar o duelo' });
        }

        if (opponent.coins < currentStake) {
            return res.status(400).json({ error: 'O adversário não tem saldo suficiente para essa aposta' });
        }

        const challengerExisting = await getActiveOrPendingDuelForUser(challenger._id);
        if (challengerExisting) {
            return res.status(400).json({ error: 'Você já possui um duelo pendente ou ativo' });
        }

        const opponentExisting = await getActiveOrPendingDuelForUser(opponent._id);
        if (opponentExisting) {
            return res.status(400).json({ error: 'O adversário já possui um duelo pendente ou ativo' });
        }

        const duel = await Duel.create({
            gameType,
            status: 'pending',
            challengerUserId: challenger._id,
            challengerUsername: challenger.username,
            opponentUserId: opponent._id,
            opponentUsername: opponent.username,
            pendingForUserId: opponent._id,
            stakeChallenger: currentStake,
            stakeOpponent: currentStake,
            currentStake,
            pot: 0,
            board: ['', '', '', '', '', '', '', '', ''],
            currentTurnUserId: challenger._id,
            lastActionAt: new Date(),
            lastSeenChallengerAt: new Date(),
            lastSeenOpponentAt: new Date(),
            updatedAt: new Date()
        });

        res.json({
            success: true,
            duel: toArenaPublicDuel(duel, req.user.id)
        });
    } catch (err) {
        console.error('Erro ao criar duelo:', err);
        res.status(500).json({ error: 'Erro ao criar duelo' });
    }
});

app.post('/api/arena/duels/:id/respond', requireAuth, async (req, res) => {
    try {
        const action = sanitizeText(req.body.action, 30).toLowerCase();
        const newStake = parseInt(req.body.newStake, 10);

        const duel = await Duel.findById(req.params.id);
        if (!duel) return res.status(404).json({ error: 'Duelo não encontrado' });
        if (duel.status !== 'pending') return res.status(400).json({ error: 'Esse duelo não está mais pendente' });

        const meId = String(req.user.id);
        const challengerId = String(duel.challengerUserId);
        const opponentId = String(duel.opponentUserId);

        if (![challengerId, opponentId].includes(meId)) {
            return res.status(403).json({ error: 'Sem acesso a esse duelo' });
        }

        const currentUser = await User.findById(req.user.id);
        const otherUserId = meId === challengerId ? duel.opponentUserId : duel.challengerUserId;
        const otherUser = await User.findById(otherUserId);

        if (!currentUser || !otherUser) {
            return res.status(404).json({ error: 'Jogador não encontrado' });
        }

        if (action === 'cancel') {
            if (meId !== challengerId) {
                return res.status(403).json({ error: 'Só quem criou pode cancelar' });
            }

            duel.status = 'cancelled';
            duel.finishReason = 'cancelado';
            duel.updatedAt = new Date();
            await duel.save();

            return res.json({ success: true, duel: toArenaPublicDuel(duel, req.user.id) });
        }

        if (!duel.pendingForUserId || String(duel.pendingForUserId) !== meId) {
            return res.status(400).json({ error: 'Não é sua vez de responder' });
        }

        if (action === 'refuse') {
            duel.status = 'cancelled';
            duel.finishReason = 'recusado';
            duel.updatedAt = new Date();
            await duel.save();

            return res.json({ success: true, duel: toArenaPublicDuel(duel, req.user.id) });
        }

        if (action === 'increase') {
            if (
                Number.isNaN(newStake) ||
                newStake < ARENA_MIN_BET ||
                newStake > ARENA_MAX_BET
            ) {
                return res.status(400).json({ error: `Aposta deve ser entre ${ARENA_MIN_BET} e ${ARENA_MAX_BET} LC` });
            }

            if (newStake <= duel.currentStake) {
                return res.status(400).json({ error: 'O aumento precisa ser maior que a aposta atual' });
            }

            if (currentUser.coins < newStake) {
                return res.status(400).json({ error: 'Você não tem saldo para propor esse aumento' });
            }

            if (otherUser.coins < newStake) {
                return res.status(400).json({ error: 'O outro jogador não tem saldo para esse valor' });
            }

            duel.currentStake = newStake;
            duel.pendingForUserId = otherUser._id;
            duel.updatedAt = new Date();
            duel.lastActionAt = new Date();
            await duel.save();

            return res.json({ success: true, duel: toArenaPublicDuel(duel, req.user.id) });
        }

        if (action === 'accept') {
            if (currentUser.coins < duel.currentStake) {
                return res.status(400).json({ error: 'Você não tem saldo suficiente para aceitar' });
            }

            if (otherUser.coins < duel.currentStake) {
                return res.status(400).json({ error: 'O outro jogador não tem saldo suficiente agora' });
            }

            await activateDuelWithLockedCoins(duel._id);

            const duelAtivado = await Duel.findById(duel._id);
            return res.json({ success: true, duel: toArenaPublicDuel(duelAtivado, req.user.id) });
        }

        return res.status(400).json({ error: 'Ação inválida' });
    } catch (err) {
        console.error('Erro ao responder duelo:', err);
        res.status(500).json({ error: err.message || 'Erro ao responder duelo' });
    }
});

app.post('/api/arena/duels/:id/heartbeat', requireAuth, async (req, res) => {
    try {
        const duel = await Duel.findById(req.params.id);
        if (!duel) return res.status(404).json({ error: 'Duelo não encontrado' });
        if (duel.status !== 'active') return res.json({ success: true });

        const meId = String(req.user.id);

        if (String(duel.challengerUserId) === meId) {
            duel.lastSeenChallengerAt = new Date();
        } else if (String(duel.opponentUserId) === meId) {
            duel.lastSeenOpponentAt = new Date();
        } else {
            return res.status(403).json({ error: 'Sem acesso' });
        }

        duel.updatedAt = new Date();
        await duel.save();

        res.json({ success: true });
    } catch (err) {
        console.error('Erro no heartbeat da arena:', err);
        res.status(500).json({ error: 'Erro no heartbeat da arena' });
    }
});

app.post('/api/arena/duels/:id/forfeit', requireAuth, async (req, res) => {
    try {
        const duel = await Duel.findById(req.params.id);
        if (!duel) return res.status(404).json({ error: 'Duelo não encontrado' });
        if (duel.status !== 'active') return res.status(400).json({ error: 'Duelo não está ativo' });

        const meId = String(req.user.id);
        if (![String(duel.challengerUserId), String(duel.opponentUserId)].includes(meId)) {
            return res.status(403).json({ error: 'Sem acesso' });
        }

        const winnerUserId = meId === String(duel.challengerUserId) ? duel.opponentUserId : duel.challengerUserId;
        const loserUserId = req.user.id;

        await finishDuel({
            duel,
            winnerUserId,
            loserUserId,
            finishReason: 'desistencia'
        });

        const duelFinal = await Duel.findById(duel._id);
        res.json({ success: true, duel: toArenaPublicDuel(duelFinal, req.user.id) });
    } catch (err) {
        console.error('Erro ao desistir do duelo:', err);
        res.status(500).json({ error: 'Erro ao desistir do duelo' });
    }
});

app.post('/api/arena/duels/:id/move', requireAuth, async (req, res) => {
    try {
        const duel = await Duel.findById(req.params.id);
        if (!duel) return res.status(404).json({ error: 'Duelo não encontrado' });
        if (duel.status !== 'active') return res.status(400).json({ error: 'Duelo não está ativo' });

        const meId = String(req.user.id);
        const isChallenger = meId === String(duel.challengerUserId);
        const isOpponent = meId === String(duel.opponentUserId);

        if (!isChallenger && !isOpponent) {
            return res.status(403).json({ error: 'Sem acesso a esse duelo' });
        }

        if (duel.gameType === 'tic_tac_toe') {
            const index = parseInt(req.body.index, 10);

            if (String(duel.currentTurnUserId) !== meId) {
                return res.status(400).json({ error: 'Não é sua vez' });
            }

            if (Number.isNaN(index) || index < 0 || index > 8) {
                return res.status(400).json({ error: 'Jogada inválida' });
            }

            if (duel.board[index]) {
                return res.status(400).json({ error: 'Essa casa já está ocupada' });
            }

            duel.board[index] = isChallenger ? duel.challengerSymbol : duel.opponentSymbol;
            duel.currentTurnUserId = isChallenger ? duel.opponentUserId : duel.challengerUserId;
            duel.lastActionAt = new Date();
            duel.updatedAt = new Date();

            const winnerSymbol = checkWinnerTicTacToe(duel.board);

            if (winnerSymbol) {
                await duel.save();

                const winnerUserId = winnerSymbol === duel.challengerSymbol ? duel.challengerUserId : duel.opponentUserId;
                const loserUserId = String(winnerUserId) === String(duel.challengerUserId)
                    ? duel.opponentUserId
                    : duel.challengerUserId;

                await finishDuel({
                    duel,
                    winnerUserId,
                    loserUserId,
                    finishReason: 'vitoria_tic_tac_toe'
                });

                const duelFinal = await Duel.findById(duel._id);
                return res.json({ success: true, duel: toArenaPublicDuel(duelFinal, req.user.id) });
            }

            const isDraw = duel.board.every(Boolean);
            if (isDraw) {
                resetTicTacToeRound(duel);
                await duel.save();
                return res.json({
                    success: true,
                    roundReset: true,
                    message: 'Empate. Novo tabuleiro iniciado.',
                    duel: toArenaPublicDuel(duel, req.user.id)
                });
            }

            await duel.save();
            return res.json({ success: true, duel: toArenaPublicDuel(duel, req.user.id) });
        }

        if (duel.gameType === 'odd_even') {
            const parity = sanitizeText(req.body.parity, 20).toLowerCase();
            const number = parseInt(req.body.number, 10);

            if (!['par', 'impar'].includes(parity)) {
                return res.status(400).json({ error: 'Escolha par ou impar' });
            }

            if (Number.isNaN(number) || number < 0 || number > 10) {
                return res.status(400).json({ error: 'Escolha um número de 0 a 10' });
            }

            if (isChallenger) {
                if (duel.oddEvenChoiceChallenger || duel.oddEvenNumberChallenger !== null) {
                    return res.status(400).json({ error: 'Você já fez sua jogada nesta rodada' });
                }

                duel.oddEvenChoiceChallenger = parity;
                duel.oddEvenNumberChallenger = number;
                duel.lastSeenChallengerAt = new Date();
            } else {
                if (duel.oddEvenChoiceOpponent || duel.oddEvenNumberOpponent !== null) {
                    return res.status(400).json({ error: 'Você já fez sua jogada nesta rodada' });
                }

                duel.oddEvenChoiceOpponent = parity;
                duel.oddEvenNumberOpponent = number;
                duel.lastSeenOpponentAt = new Date();
            }

            duel.lastActionAt = new Date();
            duel.updatedAt = new Date();

            const bothReady =
                duel.oddEvenChoiceChallenger &&
                duel.oddEvenChoiceOpponent &&
                duel.oddEvenNumberChallenger !== null &&
                duel.oddEvenNumberOpponent !== null;

            if (!bothReady) {
                await duel.save();
                return res.json({
                    success: true,
                    waiting: true,
                    message: 'Sua escolha foi registrada. Aguardando o outro jogador.',
                    duel: toArenaPublicDuel(duel, req.user.id)
                });
            }

            const challengerChoice = duel.oddEvenChoiceChallenger;
            const opponentChoice = duel.oddEvenChoiceOpponent;
            const challengerNumber = duel.oddEvenNumberChallenger;
            const opponentNumber = duel.oddEvenNumberOpponent;

            if (challengerChoice === opponentChoice) {
                resetOddEvenRound(duel);
                await duel.save();
                return res.json({
                    success: true,
                    roundReset: true,
                    message: 'Os dois escolheram a mesma opção. Nova rodada.',
                    reveal: {
                        challengerChoice,
                        opponentChoice,
                        challengerNumber,
                        opponentNumber
                    },
                    duel: toArenaPublicDuel(duel, req.user.id)
                });
            }

            const total = challengerNumber + opponentNumber;
            const resultado = total % 2 === 0 ? 'par' : 'impar';

            await duel.save();

            const winnerUserId = challengerChoice === resultado
                ? duel.challengerUserId
                : duel.opponentUserId;

            const loserUserId = String(winnerUserId) === String(duel.challengerUserId)
                ? duel.opponentUserId
                : duel.challengerUserId;

            await finishDuel({
                duel,
                winnerUserId,
                loserUserId,
                finishReason: 'vitoria_odd_even'
            });

            const duelFinal = await Duel.findById(duel._id);

            const viewerIsWinner = String(winnerUserId) === String(req.user.id);
            const yourChoice = isChallenger ? challengerChoice : opponentChoice;
            const opponentChoiceView = isChallenger ? opponentChoice : challengerChoice;
            const yourNumber = isChallenger ? challengerNumber : opponentNumber;
            const opponentNumberView = isChallenger ? opponentNumber : challengerNumber;

            return res.json({
                success: true,
                total,
                resultado,
                reveal: {
                    yourChoice,
                    opponentChoice: opponentChoiceView,
                    yourNumber,
                    opponentNumber: opponentNumberView
                },
                resultText: viewerIsWinner
                    ? `Você escolheu ${yourChoice} com ${yourNumber}, o adversário escolheu ${opponentChoiceView} com ${opponentNumberView}. Deu ${resultado} (${total}). Você venceu!`
                    : `Você escolheu ${yourChoice} com ${yourNumber}, o adversário escolheu ${opponentChoiceView} com ${opponentNumberView}. Deu ${resultado} (${total}). Você perdeu!`,
                duel: toArenaPublicDuel(duelFinal, req.user.id)
            });
        }

        if (duel.gameType === 'rps') {
            const choice = sanitizeText(req.body.choice, 20).toLowerCase();

            if (!['pedra', 'papel', 'tesoura'].includes(choice)) {
                return res.status(400).json({ error: 'Escolha pedra, papel ou tesoura' });
            }

            if (isChallenger) {
                if (duel.rpsChoiceChallenger) {
                    return res.status(400).json({ error: 'Você já fez sua jogada nesta rodada' });
                }

                duel.rpsChoiceChallenger = choice;
                duel.lastSeenChallengerAt = new Date();
            } else {
                if (duel.rpsChoiceOpponent) {
                    return res.status(400).json({ error: 'Você já fez sua jogada nesta rodada' });
                }

                duel.rpsChoiceOpponent = choice;
                duel.lastSeenOpponentAt = new Date();
            }

            duel.lastActionAt = new Date();
            duel.updatedAt = new Date();

            const bothReady = duel.rpsChoiceChallenger && duel.rpsChoiceOpponent;
            if (!bothReady) {
                await duel.save();
                return res.json({
                    success: true,
                    waiting: true,
                    message: 'Sua escolha foi registrada. Aguardando o outro jogador.',
                    duel: toArenaPublicDuel(duel, req.user.id)
                });
            }

            const challengerChoice = duel.rpsChoiceChallenger;
            const opponentChoice = duel.rpsChoiceOpponent;

            if (challengerChoice === opponentChoice) {
                resetRpsRound(duel);
                await duel.save();
                return res.json({
                    success: true,
                    roundReset: true,
                    message: `Empate. Os dois escolheram ${challengerChoice}. Nova rodada.`,
                    reveal: {
                        challengerChoice,
                        opponentChoice
                    },
                    duel: toArenaPublicDuel(duel, req.user.id)
                });
            }

            const vence = {
                pedra: 'tesoura',
                papel: 'pedra',
                tesoura: 'papel'
            };

            await duel.save();

            const winnerUserId = vence[challengerChoice] === opponentChoice
                ? duel.challengerUserId
                : duel.opponentUserId;

            const loserUserId = String(winnerUserId) === String(duel.challengerUserId)
                ? duel.opponentUserId
                : duel.challengerUserId;

            await finishDuel({
                duel,
                winnerUserId,
                loserUserId,
                finishReason: 'vitoria_rps'
            });

            const duelFinal = await Duel.findById(duel._id);

            const viewerIsWinner = String(winnerUserId) === String(req.user.id);
            const yourChoice = isChallenger ? challengerChoice : opponentChoice;
            const opponentChoiceView = isChallenger ? opponentChoice : challengerChoice;

            return res.json({
                success: true,
                reveal: {
                    yourChoice,
                    opponentChoice: opponentChoiceView
                },
                resultText: viewerIsWinner
                    ? `Você escolheu ${yourChoice}, o adversário escolheu ${opponentChoiceView}. Você venceu!`
                    : `Você escolheu ${yourChoice}, o adversário escolheu ${opponentChoiceView}. Você perdeu!`,
                duel: toArenaPublicDuel(duelFinal, req.user.id)
            });
        }

        return res.status(400).json({ error: 'Jogo inválido' });
    } catch (err) {
        console.error('Erro ao registrar jogada:', err);
        res.status(500).json({ error: 'Erro ao registrar jogada' });
    }
});

// --- ADMIN ---
app.post('/api/admin/add-coins', async (req, res) => {
    if (!req.user || req.user.username !== COMANDANTE) {
        return res.status(403).send();
    }

    const targetUser = sanitizeText(req.body.targetUser, 100);
    const qtd = parseInt(req.body.qtd, 10);

    if (!targetUser || Number.isNaN(qtd)) {
        return res.status(400).json({ success: false, error: "Dados inválidos" });
    }

    const userAlvo = await User.findOneAndUpdate(
        { username: targetUser },
        { $inc: { coins: qtd } },
        { new: true }
    );

    res.json({
        success: !!userAlvo,
        newBalance: userAlvo?.coins
    });
});

// --- CLEANUP ---
setInterval(async () => {
    const tempoLimite = new Date(Date.now() - 120000);

    await User.updateMany(
        { lastActive: { $lt: tempoLimite }, online: true },
        { $set: { online: false } }
    );
}, 60000);

app.get('/auth/discord', passport.authenticate('discord'));

app.get(
    '/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
);

app.get('/logout', (req, res) => req.logout(() => res.redirect('/')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🐺 QG ALC ONLINE - SISTEMA PROTEGIDO`);
    bot.login(process.env.DISCORD_TOKEN).catch(console.error);
});