module.exports = async (browser) => {
  const page = (await browser.pages())[0] || (await browser.newPage());
  await page.goto("http://127.0.0.1:4174/viper/", { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(() => {
    const s = document.getElementById("splash");
    if (s) s.classList.add("hide");
  });
};
