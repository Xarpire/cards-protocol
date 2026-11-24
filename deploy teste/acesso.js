const authForm = document.getElementById("formAcesso");
const authTitle = document.getElementById("tituloAcesso");
const authMessage = document.getElementById("mensagemAcesso");
const authSubmit = document.getElementById("btnEnviarAcesso");
const authPassword = document.getElementById("senha");
const passwordHint = document.getElementById("dicaSenha");
const loginTab = document.getElementById("abaEntrar");
const registerTab = document.getElementById("abaCriar");
let authMode = "login";

function getReturnPath() {
  const requestedPath = new URLSearchParams(location.search).get("voltar") || "/colecao.html";
  const parsedPath = new URL(requestedPath, location.origin);
  if (parsedPath.origin !== location.origin || !["/", "/colecao.html"].includes(parsedPath.pathname)) {
    return "/colecao.html";
  }
  return parsedPath.pathname === "/" && new URLSearchParams(location.search).get("salvar") === "1"
    ? "/?salvar=1"
    : parsedPath.pathname;
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === "register";
  authTitle.textContent = registering ? "Criar conta" : "Entrar na coleção";
  authSubmit.textContent = registering ? "Criar conta" : "Entrar";
  authPassword.autocomplete = registering ? "new-password" : "current-password";
  passwordHint.textContent = registering ? "Use uma senha com pelo menos 12 caracteres." : "Use a senha da sua conta.";
  loginTab.classList.toggle("ativa", !registering);
  registerTab.classList.toggle("ativa", registering);
  authMessage.textContent = "";
}

async function checkExistingSession() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) throw new Error("Não foi possível verificar o acesso.");
    const session = await response.json();
    document.querySelector(".instrucoes-certificado").hidden = session.localCertificate === false;
    if (session.authenticated) location.replace(getReturnPath());
  } catch (error) {
    authMessage.textContent = `${error.message} Verifique a conexão HTTPS e tente novamente.`;
  }
}

loginTab.addEventListener("click", () => setAuthMode("login"));
registerTab.addEventListener("click", () => setAuthMode("register"));

authForm.addEventListener("submit", async event => {
  event.preventDefault();
  authSubmit.disabled = true;
  authMessage.textContent = authMode === "register" ? "Criando conta..." : "Verificando acesso...";
  try {
    const response = await fetch(`/api/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: authForm.elements.username.value,
        password: authForm.elements.password.value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir o acesso.");
    location.replace(getReturnPath());
  } catch (error) {
    authMessage.textContent = error.message;
    authSubmit.disabled = false;
  }
});

setAuthMode("login");
checkExistingSession();
