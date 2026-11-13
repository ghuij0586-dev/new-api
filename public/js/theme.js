(function () {
  try {
    var theme = localStorage.getItem("gw.theme");
    if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
