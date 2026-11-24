const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const selfsigned = require("selfsigned");

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const production = process.env.NODE_ENV === "production";
const dataDirectory = process.env.DATA_DIRECTORY || path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
  "MinhaColecao"
);
const accountsPath = path.join(dataDirectory, "contas.json");
const collectionPath = path.join(dataDirectory, "colecao.json");
const caKeyPath = path.join(dataDirectory, "autoridade.key");
const caCertPath = path.join(dataDirectory, "autoridade.crt");
const scrypt = promisify(crypto.scrypt);
const sessions = new Map();
const loginAttempts = new Map();
const lockCollection = (() => {
  let queue = Promise.resolve();
  return async () => {
    const previous = queue;
    let release;
    queue = new Promise(resolve => {
      release = resolve;
    });
    await previous;
    return release;
  };
})();
const lockAccounts = (() => {
  let queue = Promise.resolve();
  return async () => {
    const previous = queue;
    let release;
    queue = new Promise(resolve => {
      release = resolve;
    });
    await previous;
    return release;
  };
})();
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp"
};
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const passwordIterations = 15 * 60 * 1000;

let accounts = {};
let collection = { revision: 0, quantities: {} };
let ca;

function jsonResponse(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(value));
}

function errorResponse(response, status, message) {
  jsonResponse(response, status, { error: message });
}

function getSession(request) {
  const cookie = request.headers.cookie || "";
  const token = cookie
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith("__Host-minhaColecao="))
    ?.slice("__Host-minhaColecao=".length);
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireSession(request, response) {
  const session = getSession(request);
  if (!session) {
    errorResponse(response, 401, "Entre na sua conta para acessar a coleção.");
    return null;
  }
  return session;
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin || !request.headers.host) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.host === request.headers.host;
  } catch {
    return false;
  }
}

function checkOrigin(request, response) {
  if (isSameOrigin(request)) return true;
  errorResponse(response, 403, "Origem da solicitação inválida.");
  return false;
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", chunk => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > 64 * 1024) {
        tooLarge = true;
        reject(Object.assign(new Error("A solicitação excedeu o tamanho permitido."), { status: 413 }));
        request.resume();
      }
    });
    request.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("O conteúdo da solicitação não é um JSON válido."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

async function writeJsonFile(filePath, data) {
  const temporaryPath = `${filePath}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
}

async function loadJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function loadKnownImages() {
  const gamesPath = path.join(root, "catalogos", "jogos.json");
  const games = JSON.parse((await fs.readFile(gamesPath, "utf8")).replace(/^\uFEFF/, ""));
  if (!Array.isArray(games)) throw new Error("A lista de jogos está inválida.");

  const catalogs = await Promise.all(games.map(async game => {
    const catalogPath = path.resolve(root, game.catalogo);
    if (!catalogPath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`O caminho do catálogo de ${game.nome} está fora do projeto.`);
    }
    const catalog = JSON.parse((await fs.readFile(catalogPath, "utf8")).replace(/^\uFEFF/, ""));
    if (!Array.isArray(catalog)) throw new Error(`O catálogo de ${game.nome} está inválido.`);
    return catalog;
  }));
  return new Set(catalogs.flatMap(catalog => catalog.map(card => card.imagem)));
}

function getClientAddress(request) {
  return (request.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

function checkRateLimit(request, response, action, limit) {
  const key = `${getClientAddress(request)}:${action}`;
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter(timestamp => now - timestamp < passwordIterations);
  loginAttempts.set(key, attempts);
  if (attempts.length >= limit) {
    jsonResponse(response, 429, { error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, {
      "Retry-After": "900"
    });
    return false;
  }
  return true;
}

function recordRateLimit(request, action) {
  const key = `${getClientAddress(request)}:${action}`;
  const attempts = loginAttempts.get(key) || [];
  attempts.push(Date.now());
  loginAttempts.set(key, attempts);
}

function createSession(response, username) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { username, expiresAt: Date.now() + sessionLifetime });
  response.setHeader(
    "Set-Cookie",
    `__Host-minhaColecao=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionLifetime / 1000}`
  );
}

async function createLocalCertificates(addresses) {
  let caPrivateKey;
  try {
    [caPrivateKey, ca] = await Promise.all([
      fs.readFile(caKeyPath, "utf8"),
      fs.readFile(caCertPath, "utf8")
    ]);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const notBeforeDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notAfterDate = new Date();
    notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
    const generatedCa = await selfsigned.generate(
      [{ name: "commonName", value: "Minha Colecao - Autoridade Local" }],
      {
        keyType: "ec",
        curve: "P-256",
        algorithm: "sha256",
        notBeforeDate,
        notAfterDate,
        extensions: [
          { name: "basicConstraints", cA: true, critical: true },
          { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true }
        ]
      }
    );
    caPrivateKey = generatedCa.private;
    ca = generatedCa.cert;
    await fs.writeFile(caKeyPath, caPrivateKey, { mode: 0o600 });
    await fs.writeFile(caCertPath, ca, { mode: 0o644 });
  }

  const notBeforeDate = new Date(Date.now() - 5 * 60 * 1000);
  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 2);
  const altNames = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
    ...addresses.map(ip => ({ type: 7, ip }))
  ];
  const certificate = await selfsigned.generate(
    [{ name: "commonName", value: "Minha Colecao Local" }],
    {
      keyType: "ec",
      curve: "P-256",
      algorithm: "sha256",
      notBeforeDate,
      notAfterDate,
      ca: { key: caPrivateKey, cert: ca },
      extensions: [
        { name: "basicConstraints", cA: false, critical: true },
        { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
        { name: "extKeyUsage", serverAuth: true },
        { name: "subjectAltName", altNames }
      ]
    }
  );

  return { key: certificate.private, cert: certificate.cert };
}

function addSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}

async function handleApi(request, response, pathname) {
  if (request.method === "GET" && pathname === "/api/session") {
    const session = getSession(request);
    jsonResponse(response, 200, session
      ? { authenticated: true, username: session.username, localCertificate: !production }
      : { authenticated: false, localCertificate: !production });
    return;
  }

  if (request.method === "POST" && (pathname === "/api/register" || pathname === "/api/login")) {
    if (!checkOrigin(request, response) || !checkRateLimit(request, response, pathname, 8)) return;
    let body;
    try {
      body = await parseJsonBody(request);
    } catch (error) {
      errorResponse(response, error.status || 400, error.message);
      return;
    }

    if (!body || typeof body !== "object" || typeof body.username !== "string" || typeof body.password !== "string") {
      errorResponse(response, 400, "Informe usuário e senha.");
      return;
    }

    const username = body.username.trim();
    const normalizedUsername = username.toLowerCase();
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      errorResponse(response, 400, "O usuário deve ter de 3 a 32 caracteres: letras, números, hífen ou sublinhado.");
      return;
    }
    if (body.password.length < 12 || body.password.length > 128) {
      errorResponse(response, 400, "A senha deve ter entre 12 e 128 caracteres.");
      return;
    }

    if (pathname === "/api/register") {
      recordRateLimit(request, pathname);
      const salt = crypto.randomBytes(16);
      const hash = await scrypt(body.password, salt, 64);
      const release = await lockAccounts();
      try {
        if (accounts[normalizedUsername]) {
          errorResponse(response, 409, "Esse usuário já existe. Escolha outro nome.");
          return;
        }
        accounts[normalizedUsername] = {
          username,
          salt: salt.toString("hex"),
          hash: hash.toString("hex")
        };
        await writeJsonFile(accountsPath, accounts);
      } catch (error) {
        delete accounts[normalizedUsername];
        console.error("Não foi possível salvar a nova conta.", error);
        errorResponse(response, 500, "Não foi possível salvar a conta.");
        return;
      } finally {
        release();
      }
    } else {
      const account = accounts[normalizedUsername];
      const salt = account ? Buffer.from(account.salt, "hex") : Buffer.alloc(16);
      const expectedHash = account ? Buffer.from(account.hash, "hex") : Buffer.alloc(64);
      const actualHash = await scrypt(body.password, salt, 64);
      if (!account || !crypto.timingSafeEqual(actualHash, expectedHash)) {
        recordRateLimit(request, pathname);
        errorResponse(response, 401, "Usuário ou senha incorretos.");
        return;
      }
      loginAttempts.delete(`${getClientAddress(request)}:${pathname}`);
    }

    createSession(response, accounts[normalizedUsername].username);
    jsonResponse(response, 200, { authenticated: true, username: accounts[normalizedUsername].username });
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    if (!checkOrigin(request, response)) return;
    const cookie = request.headers.cookie || "";
    const token = cookie
      .split(";")
      .map(part => part.trim())
      .find(part => part.startsWith("__Host-minhaColecao="))
      ?.slice("__Host-minhaColecao=".length);
    if (token) sessions.delete(token);
    jsonResponse(response, 200, { authenticated: false }, {
      "Set-Cookie": "__Host-minhaColecao=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
    });
    return;
  }

  if (pathname === "/api/collection" && request.method === "GET") {
    if (!requireSession(request, response)) return;
    jsonResponse(response, 200, collection);
    return;
  }

  if (pathname === "/api/collection" && request.method === "PUT") {
    if (!checkOrigin(request, response) || !requireSession(request, response)) return;

    let body;
    try {
      body = await parseJsonBody(request);
    } catch (error) {
      errorResponse(response, error.status || 400, error.message);
      return;
    }

    if (!body || typeof body !== "object" || !Number.isSafeInteger(body.revision) || !body.quantities || typeof body.quantities !== "object" || Array.isArray(body.quantities)) {
      errorResponse(response, 400, "Os dados da coleção estão inválidos.");
      return;
    }

    let knownImages;
    try {
      knownImages = await loadKnownImages();
    } catch (error) {
      console.error("Não foi possível carregar os catálogos para validar a coleção.", error);
      errorResponse(response, 500, "Não foi possível validar as cartas do catálogo.");
      return;
    }

    const normalizedQuantities = {};
    for (const [image, quantity] of Object.entries(body.quantities)) {
      if (!knownImages.has(image) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) {
        errorResponse(response, 400, "A coleção contém uma carta ou quantidade inválida.");
        return;
      }
      normalizedQuantities[image] = quantity;
    }

    const release = await lockCollection();
    try {
      if (body.revision !== collection.revision) {
        jsonResponse(response, 409, {
          error: "A coleção foi alterada em outro aparelho. Recarregue a página antes de salvar."
        });
        return;
      }

      const updatedCollection = {
        revision: collection.revision + 1,
        quantities: normalizedQuantities
      };
      await writeJsonFile(collectionPath, updatedCollection);
      collection = updatedCollection;
      jsonResponse(response, 200, collection);
    } catch (error) {
      console.error("Não foi possível salvar a coleção.", error);
      errorResponse(response, 500, "Não foi possível salvar a coleção.");
    } finally {
      release();
    }
    return;
  }

  errorResponse(response, 404, "Rota não encontrada.");
}

async function handleRequest(request, response) {
  addSecurityHeaders(response);

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "https://localhost").pathname);
  } catch {
    errorResponse(response, 400, "Endereço inválido.");
    return;
  }

  if (pathname.startsWith("/api/")) {
    await handleApi(request, response, pathname);
    return;
  }

  if (!production && pathname === "/autoridade-local.crt" && request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": 'attachment; filename="minha-colecao-local.crt"',
      "Cache-Control": "no-store"
    });
    response.end(ca);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Método não permitido.");
    return;
  }

  const filePath = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403);
    response.end("Acesso negado.");
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404);
      response.end("Não encontrado.");
      return;
    }
    console.error(`Não foi possível ler ${pathname}.`, error);
    response.writeHead(500);
    response.end("Erro ao ler o arquivo.");
  }
}

async function main() {
  if (production && !process.env.DATA_DIRECTORY) {
    throw new Error("Defina DATA_DIRECTORY para um volume persistente antes de iniciar em produção.");
  }
  if (production && !path.isAbsolute(dataDirectory)) {
    throw new Error("DATA_DIRECTORY deve ser um caminho absoluto.");
  }

  await fs.mkdir(dataDirectory, { recursive: true });
  [accounts, collection] = await Promise.all([
    loadJsonFile(accountsPath, {}),
    loadJsonFile(collectionPath, { revision: 0, quantities: {} })
  ]);
  await loadKnownImages();

  const addresses = production ? [] : [...new Set(Object.values(os.networkInterfaces())
    .flat()
    .filter(address => address && address.family === "IPv4" && !address.internal)
    .map(address => address.address))];
  const handle = (request, response) => {
    handleRequest(request, response).catch(error => {
      console.error("Erro não tratado ao processar uma solicitação.", error);
      if (!response.headersSent) errorResponse(response, 500, "Ocorreu um erro interno.");
      else response.destroy(error);
    });
  };
  let server;
  if (production) {
    server = http.createServer(handle);
  } else {
    const tlsCertificate = await createLocalCertificates(addresses);
    server = https.createServer({
      key: tlsCertificate.key,
      cert: tlsCertificate.cert,
      minVersion: "TLSv1.2"
    }, handle);
  }

  for (const token of sessions.keys()) sessions.delete(token);
  setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }
    for (const [key, timestamps] of loginAttempts) {
      const recent = timestamps.filter(timestamp => now - timestamp < passwordIterations);
      if (recent.length) loginAttempts.set(key, recent);
      else loginAttempts.delete(key);
    }
  }, 60 * 60 * 1000).unref();

  server.on("error", error => {
    console.error(`Não foi possível iniciar o servidor: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, "0.0.0.0", () => {
    if (production) {
      console.log(`Projeto disponível atrás do proxy HTTPS na porta ${port}.`);
      console.log(`Os dados compartilhados ficam em: ${dataDirectory}`);
      return;
    }

    console.log(`Projeto disponível por HTTPS na porta ${port}:`);
    if (addresses.length === 0) console.log(`  https://localhost:${port}`);
    for (const address of addresses) console.log(`  https://${address}:${port}`);
    console.log(`Instale este certificado nos aparelhos antes de entrar: ${caCertPath}`);
    console.log("Na página de acesso, use o link para baixar o certificado e veja as instruções de instalação.");
    console.log(`Os dados compartilhados ficam em: ${dataDirectory}`);
    console.log("O cadastro está aberto para os dispositivos que alcançam este servidor na rede.");
  });
}

main().catch(error => {
  console.error("Não foi possível preparar o servidor e os dados da coleção.", error);
  process.exitCode = 1;
});
