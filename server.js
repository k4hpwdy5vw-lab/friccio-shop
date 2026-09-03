import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || "./data";
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const STORE_FILE = path.join(DATA_DIR, "store.json");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cambia-questa-password";
const JWT_SECRET = process.env.JWT_SECRET || "cambia-anche-questo-segreto";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "FRICCIOSHOP <onboarding@resend.dev>";

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function emptyStore() {
  return { users: [], products: [], interests: [] };
}
function loadStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      const s = emptyStore();
      fs.writeFileSync(STORE_FILE, JSON.stringify(s, null, 2));
      return s;
    }
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    return { ...emptyStore(), ...parsed };
  } catch {
    return emptyStore();
  }
}
function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}
function id() {
  return crypto.randomUUID();
}
function signUser(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: "user" }, JWT_SECRET, { expiresIn: "30d" });
}
function signAdmin() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const raw = req.headers.authorization || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Accesso richiesto." });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sessione scaduta. Accedi di nuovo." });
  }
}
function userOnly(req, res, next) {
  auth(req, res, () => {
    if (req.auth.role !== "user") return res.status(403).json({ error: "Accesso utente richiesto." });
    next();
  });
}
function adminOnly(req, res, next) {
  auth(req, res, () => {
    if (req.auth.role !== "admin") return res.status(403).json({ error: "Accesso admin richiesto." });
    next();
  });
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase().replace(/[^.a-z0-9]/g, "");
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext || ".jpg"}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(file.mimetype)) {
      return cb(new Error("Carica solo immagini."));
    }
    cb(null, true);
  }
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static("public"));

app.get("/api/status", (_, res) => {
  res.json({
    ok: true,
    emailReady: Boolean(OWNER_EMAIL && RESEND_API_KEY),
    storagePath: DATA_DIR
  });
});

app.get("/api/products", (_, res) => {
  const store = loadStore();
  res.json(store.products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post("/api/register", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  const email = String(req.body.email || "").trim().toLowerCase().slice(0, 160);
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Inserisci il tuo nome." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email non valida." });
  if (password.length < 6) return res.status(400).json({ error: "La password deve avere almeno 6 caratteri." });

  const store = loadStore();
  if (store.users.some(u => u.email === email)) return res.status(409).json({ error: "Questa email è già registrata." });

  const user = { id: id(), name, email, passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString() };
  store.users.push(user);
  saveStore(store);
  res.json({ token: signUser(user), user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const store = loadStore();
  const user = store.users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Email o password non corretti." });
  }
  res.json({ token: signUser(user), user: { id: user.id, name: user.name, email: user.email } });
});

app.get("/api/me", userOnly, (req, res) => {
  const store = loadStore();
  const user = store.users.find(u => u.id === req.auth.sub);
  if (!user) return res.status(404).json({ error: "Utente non trovato." });
  res.json({ id: user.id, name: user.name, email: user.email });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (!crypto.timingSafeEqual(Buffer.from(password.padEnd(ADMIN_PASSWORD.length, "\0").slice(0, ADMIN_PASSWORD.length)), Buffer.from(ADMIN_PASSWORD))) {
    return res.status(401).json({ error: "Password admin errata." });
  }
  res.json({ token: signAdmin() });
});

app.post("/api/admin/products", adminOnly, upload.single("image"), (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  const category = String(req.body.category || "Altro").trim().slice(0, 50);
  const price = String(req.body.price || "").trim().slice(0, 30);
  const sizes = String(req.body.sizes || "").trim().slice(0, 120);
  const description = String(req.body.description || "").trim().slice(0, 1000);

  if (!name) return res.status(400).json({ error: "Inserisci il nome dell'articolo." });
  if (!req.file) return res.status(400).json({ error: "Carica una foto." });

  const store = loadStore();
  const product = {
    id: id(),
    name,
    category,
    price,
    sizes,
    description,
    image: `/uploads/${req.file.filename}`,
    createdAt: new Date().toISOString()
  };
  store.products.push(product);
  saveStore(store);
  res.json(product);
});

app.delete("/api/admin/products/:id", adminOnly, (req, res) => {
  const store = loadStore();
  const index = store.products.findIndex(p => p.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Articolo non trovato." });

  const [product] = store.products.splice(index, 1);
  saveStore(store);
  if (product.image?.startsWith("/uploads/")) {
    const fp = path.join(UPLOAD_DIR, path.basename(product.image));
    try { fs.unlinkSync(fp); } catch {}
  }
  res.json({ ok: true });
});

async function sendInterestEmail({ user, product, note }) {
  if (!OWNER_EMAIL || !RESEND_API_KEY) {
    return { sent: false, reason: "Email non configurata" };
  }
  const safe = s => String(s || "").replace(/[<>]/g, "");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [OWNER_EMAIL],
      subject: `FRICCIOSHOP — interesse per ${safe(product.name)}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px">
          <h2>Nuovo cliente interessato 👀</h2>
          <p><b>Articolo:</b> ${safe(product.name)}</p>
          <p><b>Cliente:</b> ${safe(user.name)}</p>
          <p><b>Email:</b> ${safe(user.email)}</p>
          <p><b>Messaggio:</b> ${safe(note) || "Nessun messaggio"}</p>
          <hr>
          <p style="color:#666">Richiesta inviata da FRICCIOSHOP.</p>
        </div>`
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Invio email fallito: ${text}`);
  }
  return { sent: true };
}

app.post("/api/interests", userOnly, async (req, res) => {
  const productId = String(req.body.productId || "");
  const note = String(req.body.note || "").trim().slice(0, 500);
  const store = loadStore();
  const user = store.users.find(u => u.id === req.auth.sub);
  const product = store.products.find(p => p.id === productId);
  if (!user || !product) return res.status(404).json({ error: "Utente o articolo non trovato." });

  const interest = {
    id: id(),
    userId: user.id,
    productId: product.id,
    note,
    createdAt: new Date().toISOString()
  };
  store.interests.push(interest);
  saveStore(store);

  try {
    const result = await sendInterestEmail({ user, product, note });
    res.json({ ok: true, emailSent: result.sent });
  } catch (e) {
    res.status(502).json({ error: "Interesse salvato, ma l'email non è partita.", detail: e.message });
  }
});

app.get("/api/admin/interests", adminOnly, (req, res) => {
  const store = loadStore();
  const rows = store.interests
    .map(i => ({
      ...i,
      user: store.users.find(u => u.id === i.userId) || null,
      product: store.products.find(p => p.id === i.productId) || null
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Errore." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FRICCIOSHOP online sulla porta ${PORT}`);
});
