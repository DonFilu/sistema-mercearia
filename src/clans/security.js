const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.MP_ACCESS_TOKEN ||
  "troque-este-segredo-em-producao";

const SESSION_COOKIE = "clan_session";
const STATE_COOKIE = "clan_oauth_state";

function createClanToken(id) {
  return jwt.sign({ sub: id.toString(), tipoSistema: "clan" }, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function cookieOptions(maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production";
  return [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

function setCookie(res, name, value, maxAgeSeconds) {
  const cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${cookieOptions(maxAgeSeconds)}`;
  const current = res.getHeader("Set-Cookie");

  if (!current) return res.setHeader("Set-Cookie", cookie);
  if (Array.isArray(current)) return res.setHeader("Set-Cookie", [...current, cookie]);
  return res.setHeader("Set-Cookie", [current, cookie]);
}

function clearCookie(res, name) {
  setCookie(res, name, "", 0);
}

function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || "";
}

function getState(req) {
  return parseCookies(req)[STATE_COOKIE] || "";
}

function setSession(res, accountId) {
  setCookie(res, SESSION_COOKIE, createClanToken(accountId), 7 * 24 * 60 * 60);
}

function setOAuthState(res, state) {
  setCookie(res, STATE_COOKIE, state, 10 * 60);
}

function clearOAuthState(res) {
  clearCookie(res, STATE_COOKIE);
}

function clearSession(res) {
  clearCookie(res, SESSION_COOKIE);
}

function hasValidClanSession(req) {
  try {
    const payload = verifyToken(getSessionToken(req));
    return payload.tipoSistema === "clan";
  } catch (err) {
    return false;
  }
}

module.exports = {
  SESSION_COOKIE,
  STATE_COOKIE,
  createClanToken,
  verifyToken,
  randomState,
  parseCookies,
  getSessionToken,
  getState,
  setSession,
  setOAuthState,
  clearOAuthState,
  clearSession,
  hasValidClanSession
};
