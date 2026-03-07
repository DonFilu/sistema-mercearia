const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://don029033:maiqui029033@alcsocial.yz115xh.mongodb.net/garo_online";

mongoose.connect(MONGO_URI)
.then(() => console.log("🟢 Mongo conectado"))
.catch(err => console.log("❌ Erro Mongo:", err));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Servidor rodando na porta " + PORT);
});