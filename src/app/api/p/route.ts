import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

import chromium from "@sparticuz/chromium-min";
import puppeteer, { Browser } from "puppeteer-core";

const localExecutablePath =
  process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "linux"
    ? "/snap/bin/chromium"
    : "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const remoteExecutablePath =
  "https://github.com/Sparticuz/chromium/releases/download/v123.0.1/chromium-v123.0.1-pack.tar";

const isDev = process.env.NODE_ENV === "development";

const userAgent =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const urlStr = url.searchParams.get("url");
  if (!urlStr) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 }
    );
  }

  let browser: Browser | null = null;
  try {
    browser = await puppeteer.launch({
      ignoreDefaultArgs: ["--enable-automation"],
      args: isDev
        ? [
            "--disable-blink-features=AutomationControlled",
            "--disable-features=site-per-process",
            "-disable-site-isolation-trials",
          ]
        : [...chromium.args, "--disable-blink-features=AutomationControlled"],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: isDev
        ? localExecutablePath
        : await chromium.executablePath(remoteExecutablePath),
      headless: isDev ? false : "shell",
      debuggingPort: isDev ? 9222 : undefined,
    });

    const pages = await browser.pages();
    const page = pages[0];
    await page.setUserAgent(userAgent);
    await page.setViewport({ width: 1920, height: 1080 });
    const preloadFile = fs.readFileSync(
      path.join(process.cwd(), "/src/utils/preload.js"),
      "utf8"
    );
    await page.evaluateOnNewDocument(preloadFile);
    await page.goto(urlStr, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("page title", await page.title());
    const blob = await page.screenshot({ type: "png" });

    const headers = new Headers();

    headers.set("Content-Type", "image/png");
    headers.set("Content-Length", blob.length.toString());

    // or just use new Response ❗️
    return new NextResponse(blob, { status: 200, statusText: "OK", headers });
  } catch (err) {
    console.log(err);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
