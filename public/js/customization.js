(function () {
  const screen = document.getElementById("customize-screen");
  const canvas = document.getElementById("avatar-preview");

  const DEFAULTS = {
    skinTone: "#e0ac69",
    hairStyle: "short",
    hairColor: "#3b2a1a",
    face: "default",
    shirtColor: "#2e7d9a",
    pantsColor: "#3f4c66",
    shoesColor: "#2b2b2b",
    accessory: "none",
  };

  let state = { ...DEFAULTS };

  function draw() {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f1428";
    ctx.fillRect(0, 0, W, H);

    const s = 5; // base pixel scale
    const cx = W / 2;
    const by = 310;

    const px = (x, y) => x * s;
    const py = (y) => y * s;

    // standing
    const ox = cx - 10 * s;

    // legs (pants + shoes)
    ctx.fillStyle = state.pantsColor;
    ctx.fillRect(ox + 3 * s, py(20), 4 * s, 6 * s);
    ctx.fillRect(ox + 9 * s, py(20), 4 * s, 6 * s);
    ctx.fillStyle = state.shoesColor;
    ctx.fillRect(ox + 3 * s, py(26), 4 * s, 2 * s);
    ctx.fillRect(ox + 9 * s, py(26), 4 * s, 2 * s);

    // torso (shirt)
    ctx.fillStyle = state.shirtColor;
    ctx.fillRect(ox + 2 * s, py(12), 12 * s, 8 * s);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(ox + 2 * s, py(12), 12 * s, 1.5 * s); // arm shadow top

    // arms
    ctx.fillStyle = state.shirtColor;
    ctx.fillRect(ox, py(12), 2 * s, 7 * s);
    ctx.fillRect(ox + 14 * s, py(12), 2 * s, 7 * s);
    ctx.fillStyle = state.skinTone;
    ctx.fillRect(ox, py(19), 2 * s, 2 * s);
    ctx.fillRect(ox + 14 * s, py(19), 2 * s, 2 * s);

    // head
    ctx.fillStyle = state.skinTone;
    ctx.fillRect(ox + 2 * s, py(4), 12 * s, 8 * s);

    // hair
    ctx.fillStyle = state.hairColor;
    if (state.hairStyle === "short" || state.hairStyle === "mohawk") {
      ctx.fillRect(ox + 2 * s, py(4), 12 * s, 2 * s);
    }
    if (state.hairStyle === "long") {
      ctx.fillRect(ox + 2 * s, py(4), 12 * s, 2 * s);
      ctx.fillRect(ox + 1 * s, py(5), 2 * s, 6 * s);
      ctx.fillRect(ox + 13 * s, py(5), 2 * s, 6 * s);
    }
    if (state.hairStyle === "mohawk") {
      ctx.fillRect(ox + 7 * s, py(2), 2 * s, 2 * s);
    }

    // face
    if (state.face === "scar") {
      ctx.strokeStyle = "#a33";
      ctx.beginPath(); ctx.moveTo(ox + 5 * s, py(8)); ctx.lineTo(ox + 7 * s, py(12)); ctx.stroke();
    } else if (state.face === "mask") {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(ox + 4 * s, py(9), 8 * s, 3 * s);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(ox + 5 * s, py(8), 1.4 * s, 1.6 * s);
      ctx.fillRect(ox + 9.6 * s, py(8), 1.4 * s, 1.6 * s);
    }

    // accessory
    if (state.accessory === "necklace") {
      ctx.strokeStyle = state.hairColor;
      ctx.beginPath(); ctx.moveTo(ox + 7 * s, py(6)); ctx.lineTo(ox + 8 * s, py(12)); ctx.stroke();
      ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(ox + 8 * s, py(12.5), 1.2 * s, 0, 7); ctx.fill();
    } else if (state.accessory === "crown") {
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(ox + 3 * s, py(4)); ctx.lineTo(ox + 4 * s, py(1)); ctx.lineTo(ox + 6 * s, py(3));
      ctx.lineTo(ox + 8 * s, py(0.5)); ctx.lineTo(ox + 10 * s, py(3)); ctx.lineTo(ox + 12 * s, py(1));
      ctx.lineTo(ox + 13 * s, py(4)); ctx.closePath(); ctx.fill();
    }
  }

  // Wire swatches
  document.querySelectorAll(".swatches").forEach((group) => {
    const target = group.dataset.target;
    group.addEventListener("click", (e) => {
      const btn = e.target.closest(".sw");
      if (!btn) return;
      state[target] = btn.dataset.v;
      group.querySelectorAll(".sw").forEach((s) => s.classList.toggle("sel", s === btn));
      if (target === "shirtColor" || target === "pantsColor" || target === "shoesColor") {
        const real = { shirtColor: "outfit-shirt", pantsColor: "outfit-pants", shoesColor: "outfit-shoes" };
        const inp = document.getElementById(real[target]);
        if (inp) inp.value = btn.dataset.v;
      }
      draw();
    });
  });

  // cbtns
  document.querySelectorAll(".cbtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const val = btn.dataset.v;
      state[field] = val;
      btn.parentElement.querySelectorAll(".cbtn").forEach((b) => b.classList.toggle("sel", b === btn));
      // accessory reset mines
      draw();
    });
  });

  // color inputs
  for (const [field, id] of [["shirtColor", "outfit-shirt"], ["pantsColor", "outfit-pants"], ["shoesColor", "outfit-shoes"]]) {
    document.getElementById(id).addEventListener("input", (e) => {
      state[field] = e.target.value;
      // sync matching swatch
      document.querySelector(`.swatches[data-target="${field}"] .sw[data-v="${e.target.value}"]`)?.classList.add("sel");
      draw();
    });
  }

  document.getElementById("avatar-random").addEventListener("click", () => {
    state = {
      ...DEFAULTS,
      skinTone: pick(["#e0ac69", "#f2c9a0", "#c68642", "#6b3a1f", "#5a3b8a"]),
      hairStyle: pick(["short", "long", "mohawk", "none"]),
      hairColor: pick(["#1a1a1a", "#3b2a1a", "#c9985b", "#e0d9c8", "#7b2d4e", "#25337a"]),
      face: pick(["default", "scar", "mask"]),
      shirtColor: pick(["#2e7d9a", "#7b5cf6", "#f87171", "#4ade80", "#fbbf24"]),
      pantsColor: pick(["#3f4c66", "#1f2937", "#57534e"]),
      shoesColor: "#2b2b2b",
      accessory: pick(["none", "necklace", "crown"]),
    };
    syncUI();
    draw();
  });

  function syncUI() {
    document.querySelectorAll(".swatches").forEach((g) => {
      const t = g.dataset.target;
      g.querySelectorAll(".sw").forEach((s) => s.classList.toggle("sel", state[t] === s.dataset.v));
    });
    document.querySelectorAll(".cbtn").forEach((b) => {
      b.classList.toggle("sel", state[b.dataset.field] === b.dataset.v);
    });
    document.getElementById("outfit-shirt").value = state.shirtColor;
    document.getElementById("outfit-pants").value = state.pantsColor;
    document.getElementById("outfit-shoes").value = state.shoesColor;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  this.Customize = {
    show: () => {
      screen.style.display = "flex";
      syncUI();
      draw();
    },
    getState: () => ({ ...state }),
  };
})();
