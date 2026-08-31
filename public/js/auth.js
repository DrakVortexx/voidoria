(function () {
  const authScreen = document.getElementById("auth-screen");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginMsg = document.getElementById("login-msg");
  const registerMsg = document.getElementById("register-msg");

  document.querySelectorAll(".tabs .tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.tab;
      loginForm.classList.toggle("active", which === "login");
      registerForm.classList.toggle("active", which === "register");
      loginMsg.textContent = "";
      registerMsg.textContent = "";
    });
  });

  const toggleButtons = function (disable) {
    const buttons = document.querySelectorAll("#auth-screen .btn");
    buttons.forEach((b) => (b.disabled = disable));
  };

  const setMsg = function (el, text, ok) {
    el.textContent = text;
    el.className = "form-msg" + (ok ? " ok" : "");
  };

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    toggleButtons(true);
    loginMsg.textContent = "";
    try {
      const data = await API.auth.login({
        login: document.getElementById("login-user").value,
        password: document.getElementById("login-pass").value,
      });
      window.VOIDORIA.user = data.user;
      window.VOIDORIA.isNew = data.isNew === true;
      if (data.isNew || (data.player && !data.player.appearance)) {
        window.VOIDORIA.goCustomize(data.user);
      } else {
        // Existing players land on their dashboard before entering the game
        window.VOIDORIA.showDashboard(data.user);
      }
    } catch (err) {
      setMsg(loginMsg, err.message);
    } finally {
      toggleButtons(false);
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    toggleButtons(true);
    registerMsg.textContent = "";
    try {
      const data = await API.auth.register({
        username: document.getElementById("reg-user").value,
        password: document.getElementById("reg-pass").value,
        confirmPassword: document.getElementById("reg-pass2").value,
      });
      window.VOIDORIA.user = data.user;
      window.VOIDORIA.isNew = true;
      // New accounts go straight to character customization
      window.VOIDORIA.goCustomize(data.user);
    } catch (err) {
      setMsg(registerMsg, err.message);
    } finally {
      toggleButtons(false);
    }
  });

  this.Auth = { show: () => { authScreen.style.display = "flex"; loginForm.querySelector("input").focus(); } };
})();
