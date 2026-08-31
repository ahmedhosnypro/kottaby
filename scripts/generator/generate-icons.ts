import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as sharpModule from "sharp";
import toIco from "to-ico";

const sharp = sharpModule.default;

const svgPath = process.argv[2] || "public/favicon.svg";
const icoSizes = [16, 32, 48, 256];
const pngSizes = [
  { size: 512, filename: "icon.png" },
  { size: 180, filename: "apple-icon.png" },
];

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function convertSvgToIco(svgBuffer: Buffer, outputDir: string): Promise<void> {
  const pngBuffers = await Promise.all(icoSizes.map(size => sharp(svgBuffer).resize(size, size).png().toBuffer()));
  const icoBuffer = await toIco(pngBuffers);
  const icoPath = resolve(outputDir, "favicon.ico");
  ensureDir(icoPath);
  writeFileSync(icoPath, icoBuffer);
  console.log(`Generated: ${icoPath}`);
}

async function convertSvgToPng(svgBuffer: Buffer, outputDir: string): Promise<void> {
  await Promise.all(
    pngSizes.map(async ({ size, filename }) => {
      const pngBuffer = await sharp(svgBuffer).resize(size, size).png().toBuffer();
      const pngPath = resolve(outputDir, filename);
      ensureDir(pngPath);
      writeFileSync(pngPath, pngBuffer);
      console.log(`Generated: ${pngPath}`);
    })
  );
}

export async function generateIcons(customSvgPath?: string): Promise<void> {
  const inputPath = customSvgPath ?? svgPath;
  const svgBuffer = readFileSync(inputPath);
  const appDir = resolve(process.cwd(), "app");

  await Promise.all([convertSvgToIco(svgBuffer, appDir), convertSvgToPng(svgBuffer, appDir)]);

  console.log("All icons generated successfully.");
}

if (import.meta.main) {
  void generateIcons();
}
