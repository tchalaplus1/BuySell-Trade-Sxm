const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "BuySellTradeSxm.Logo.png");
const BG = "#FBF7EF";

const androidIcons = [
  ["mipmap-mdpi/ic_launcher.png", 48],
  ["mipmap-mdpi/ic_launcher_round.png", 48],
  ["mipmap-mdpi/ic_launcher_foreground.png", 108],
  ["mipmap-hdpi/ic_launcher.png", 72],
  ["mipmap-hdpi/ic_launcher_round.png", 72],
  ["mipmap-hdpi/ic_launcher_foreground.png", 162],
  ["mipmap-xhdpi/ic_launcher.png", 96],
  ["mipmap-xhdpi/ic_launcher_round.png", 96],
  ["mipmap-xhdpi/ic_launcher_foreground.png", 216],
  ["mipmap-xxhdpi/ic_launcher.png", 144],
  ["mipmap-xxhdpi/ic_launcher_round.png", 144],
  ["mipmap-xxhdpi/ic_launcher_foreground.png", 324],
  ["mipmap-xxxhdpi/ic_launcher.png", 192],
  ["mipmap-xxxhdpi/ic_launcher_round.png", 192],
  ["mipmap-xxxhdpi/ic_launcher_foreground.png", 432]
];

const androidSplashes = [
  ["drawable/splash.png", 2732],
  ["drawable-port-mdpi/splash.png", 320],
  ["drawable-port-hdpi/splash.png", 480],
  ["drawable-port-xhdpi/splash.png", 720],
  ["drawable-port-xxhdpi/splash.png", 960],
  ["drawable-port-xxxhdpi/splash.png", 1280],
  ["drawable-land-mdpi/splash.png", 320],
  ["drawable-land-hdpi/splash.png", 480],
  ["drawable-land-xhdpi/splash.png", 720],
  ["drawable-land-xxhdpi/splash.png", 960],
  ["drawable-land-xxxhdpi/splash.png", 1280]
];

const iosAssets = [
  ["AppIcon.appiconset/AppIcon-512@2x.png", 1024],
  ["Splash.imageset/splash-2732x2732.png", 2732],
  ["Splash.imageset/splash-2732x2732-1.png", 2732],
  ["Splash.imageset/splash-2732x2732-2.png", 2732]
];

async function render(page, outFile, size, mode) {
  const source = fs.readFileSync(SOURCE).toString("base64");
  const dataUrl = `data:image/png;base64,${source}`;
  const png = await page.evaluate(async ({ dataUrl, size, mode, bg }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    const scale = mode === "splash" ? 0.28 : 0.88;
    const draw = Math.round(size * scale);
    const x = Math.round((size - draw) / 2);
    const y = Math.round((size - draw) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, draw, draw);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { dataUrl, size, mode, bg: BG });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.from(png, "base64"));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    for (const [rel, size] of androidIcons) {
      await render(page, path.join(ROOT, "android/app/src/main/res", rel), size, "icon");
    }
    for (const [rel, size] of androidSplashes) {
      await render(page, path.join(ROOT, "android/app/src/main/res", rel), size, "splash");
    }
    for (const [rel, size] of iosAssets) {
      await render(page, path.join(ROOT, "ios/App/App/Assets.xcassets", rel), size, rel.includes("Splash") ? "splash" : "icon");
    }
  } finally {
    await browser.close();
  }
  console.log("Generated Capacitor app icons and splash screens.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
