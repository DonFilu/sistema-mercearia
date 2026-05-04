const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const HASH_PREFIX = "pbkdf2";
const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.MP_ACCESS_TOKEN ||
  "troque-este-segredo-em-producao";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const hash = crypto
    .pbkdf2Sync(String(password), salt, iterations, 32, "sha256")
    .toString("hex");

  return `${HASH_PREFIX}$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, saved) {
  if (!saved) return false;

  const parts = String(saved).split("$");

  if (parts[0] !== HASH_PREFIX || parts.length !== 4) {
    return String(password) === String(saved);
  }

  const [, iterations, salt, expected] = parts;
  const hash = crypto
    .pbkdf2Sync(String(password), salt, Number(iterations), 32, "sha256")
    .toString("hex");

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expected, "hex"));
}

function createClanToken(id) {
  return jwt.sign({ sub: id.toString(), tipoSistema: "clan" }, JWT_SECRET, { expiresIn: "7d" });
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  return type === "Bearer" && token ? token : null;
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createClanToken,
  getBearerToken,
  verifyToken
};
