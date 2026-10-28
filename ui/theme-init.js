/* Tema, ilk boyamadan önce uygulanır; böylece açılışta renk sıçraması olmaz. */
(() => {
  try {
    const saved = localStorage.getItem("macro-theme");
    const theme = saved === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
