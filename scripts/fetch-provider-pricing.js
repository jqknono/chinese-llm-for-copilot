#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const OUTPUT_FILE = path.resolve(__dirname, "..", "assets", "provider-pricing.json");

const PROVIDER_IDS = {
  ZHIPU: "zhipu-ai",
  KIMI: "kimi-ai",
  VOLCENGINE: "volcengine-ai",
  MINIMAX: "minimax-ai",
  ALIYUN: "aliyun-ai",
};

const COMMON_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  accept: "text/html,application/json;q=0.9,*/*;q=0.8",
};

const HTML_ENTITIES = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeHtml(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (match) => HTML_ENTITIES[match] || match)
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
}

function normalizeText(value) {
  return decodeHtml(decodeUnicodeLiteral(String(value || "")).replace(/\s+/g, " ")).trim();
}

function decodeUnicodeLiteral(value) {
  return String(value || "").replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}

function isPriceLike(text) {
  const value = normalizeText(text);
  if (!value) {
    return false;
  }
  if (/(免费|free|0\s*成本)/i.test(value)) {
    return true;
  }
  if (!/\d/.test(value)) {
    return false;
  }
  return /(¥|￥|元|首月|\/\s*[年月日次])/i.test(value);
}

function parsePriceText(text) {
  const value = normalizeText(text);
  if (!value) {
    return {
      amount: null,
      text: null,
      unit: null,
    };
  }
  if (/(免费|free|0\s*成本)/i.test(value)) {
    return {
      amount: 0,
      text: value,
      unit: null,
    };
  }
  const numberMatch = value.match(/([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)/);
  const amount = numberMatch ? Number(numberMatch[1].replace(/,/g, "")) : null;
  const unitMatch = value.match(/\/\s*([^\s)）]+)/);
  const unit = unitMatch ? unitMatch[1].trim() : null;
  return {
    amount: Number.isFinite(amount) ? amount : null,
    text: value,
    unit,
  };
}

function dedupePlans(plans) {
  const seen = new Set();
  const result = [];
  for (const plan of plans) {
    const key = [
      String(plan.name || "").toLowerCase(),
      String(plan.currentPriceText || "").toLowerCase(),
      String(plan.originalPriceText || "").toLowerCase(),
      String(plan.notes || "").toLowerCase(),
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(plan);
  }
  return result;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: COMMON_HEADERS,
    ...options,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${url} -> ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error.message}`);
  }
}

function extractRows(html) {
  const rows = [];
  const matches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const match of matches) {
    const cells = [...match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => stripTags(cell[1]));
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  return rows;
}

function formatAmount(amount) {
  if (!Number.isFinite(amount)) {
    return null;
  }
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/\.?0+$/, "");
}

function asPlan({
  name,
  currentPriceText,
  currentPrice = null,
  originalPriceText = null,
  originalPrice = null,
  unit = null,
  notes = null,
}) {
  const current = parsePriceText(currentPriceText);
  const original = parsePriceText(originalPriceText);
  return {
    name: normalizeText(name),
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : current.amount,
    currentPriceText: current.text,
    originalPrice: Number.isFinite(originalPrice) ? originalPrice : original.amount,
    originalPriceText: original.text,
    unit: unit || current.unit || original.unit || null,
    notes: normalizeText(notes) || null,
  };
}

function absoluteUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function timeUnitLabel(value) {
  if (value === "TIME_UNIT_MONTH") {
    return "月";
  }
  if (value === "TIME_UNIT_YEAR") {
    return "年";
  }
  if (value === "TIME_UNIT_DAY") {
    return "日";
  }
  return null;
}

async function parseKimiCodingPlans() {
  const pageUrl = "https://www.kimi.com/code/zh";
  const apiUrl = "https://www.kimi.com/apiv2/kimi.gateway.order.v1.GoodsService/ListGoods";
  const payload = await fetchJson(apiUrl, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      origin: "https://www.kimi.com",
      referer: pageUrl,
    },
    body: "{}",
  });

  const plans = [];
  for (const goods of payload.goods || []) {
    const title = normalizeText(goods?.title || "");
    if (!title) {
      continue;
    }
    const unitLabel = timeUnitLabel(goods?.billingCycle?.timeUnit);
    const amounts = Array.isArray(goods?.amounts) ? goods.amounts : [];
    for (const amount of amounts) {
      const cents = Number(amount?.priceInCents);
      if (!Number.isFinite(cents)) {
        continue;
      }
      const yuan = cents / 100;
      const suffix = unitLabel ? `/${unitLabel}` : "";
      plans.push(
        asPlan({
          name: unitLabel ? `${title} (${unitLabel})` : title,
          currentPriceText: `¥${formatAmount(yuan)}${suffix}`,
          currentPrice: yuan,
          unit: unitLabel || null,
        }),
      );
    }
  }

  return {
    provider: PROVIDER_IDS.KIMI,
    sourceUrls: [pageUrl, apiUrl],
    fetchedAt: new Date().toISOString(),
    plans: dedupePlans(plans),
  };
}

async function parseZhipuCodingPlans() {
  const pageUrl = "https://bigmodel.cn/glm-coding";
  const html = await fetchText(pageUrl);
  const appPath = html.match(/\/js\/app\.[0-9a-f]+\.js/i)?.[0];
  if (!appPath) {
    throw new Error("Unable to locate Zhipu app script");
  }
  const appUrl = absoluteUrl(appPath, pageUrl);
  const appJs = await fetchText(appUrl);

  const pricingChunkHash = appJs.match(/"chunk-0d4f69d1"\s*:\s*"([0-9a-f]+)"/i)?.[1];
  if (!pricingChunkHash) {
    throw new Error("Unable to locate Zhipu coding pricing chunk");
  }
  const pricingChunkUrl = absoluteUrl(`/js/chunk-0d4f69d1.${pricingChunkHash}.js`, pageUrl);
  const pricingChunkText = await fetchText(pricingChunkUrl);
  const moduleStart = pricingChunkText.indexOf('"566a":function');
  if (moduleStart < 0) {
    throw new Error("Unable to locate Zhipu coding pricing module");
  }
  const nextModuleMatch = pricingChunkText.slice(moduleStart + 1).match(/},\"[0-9a-z]{4,6}\":function/i);
  const moduleEnd = nextModuleMatch ? moduleStart + 1 + nextModuleMatch.index : pricingChunkText.length;
  const moduleSection = pricingChunkText.slice(moduleStart, moduleEnd);

  const extractStringField = (body, key) => {
    const match = body.match(new RegExp(`${key}:"([^"]*)"`));
    return match ? match[1] : null;
  };
  const extractNumberField = (body, key) => {
    const match = body.match(new RegExp(`${key}:([0-9]+(?:\\.[0-9]+)?)`));
    return match ? Number(match[1]) : null;
  };

  const cardRegex = /Object\(i\["a"\]\)\(\{([\s\S]*?)\},n\.(lite|pro|max)\)/g;
  const cardItems = [];
  let cardMatch;
  while ((cardMatch = cardRegex.exec(moduleSection)) !== null) {
    const body = cardMatch[1];
    const productName = extractStringField(body, "productName");
    if (!productName || !/^GLM Coding (Lite|Pro|Max)$/.test(productName)) {
      continue;
    }
    cardItems.push({
      productId: extractStringField(body, "productId"),
      productName,
      salePrice: extractNumberField(body, "salePrice"),
      originalPrice: extractNumberField(body, "originalPrice"),
      renewAmount: extractNumberField(body, "renewAmount"),
      unit: extractStringField(body, "unit"),
      unitText: extractStringField(body, "unitText"),
      tagText: extractStringField(body, "tagText"),
      version: extractStringField(body, "version"),
    });
  }
  if (cardItems.length === 0) {
    throw new Error("Unable to parse Zhipu coding pricing cards");
  }

  const selectedCards = (() => {
    const v2Cards = cardItems.filter((item) => item.version === "v2");
    return v2Cards.length >= 3 ? v2Cards : cardItems;
  })();

  const unitOrder = { month: 0, quarter: 1, year: 2 };
  const tierOrder = { Lite: 0, Pro: 1, Max: 2 };
  const sortedCards = [...selectedCards]
    .filter((item) => item.productName && item.unitText && Number.isFinite(item.salePrice))
    .sort((left, right) => {
      const leftUnit = unitOrder[left.unit] ?? 99;
      const rightUnit = unitOrder[right.unit] ?? 99;
      if (leftUnit !== rightUnit) {
        return leftUnit - rightUnit;
      }
      const leftTier = left.productName.replace("GLM Coding ", "");
      const rightTier = right.productName.replace("GLM Coding ", "");
      return (tierOrder[leftTier] ?? 99) - (tierOrder[rightTier] ?? 99);
    });

  const renewLabelByUnit = {
    month: "下个月度续费金额",
    quarter: "下个季度续费金额",
    year: "下个年度续费金额",
  };
  const plans = [];
  const seen = new Set();
  for (const card of sortedCards) {
    const uniqueKey = `${card.productName}|${card.unit}`;
    if (seen.has(uniqueKey)) {
      continue;
    }
    seen.add(uniqueKey);
    const currentPriceText = `¥${formatAmount(card.salePrice)}/${card.unitText}`;
    const originalPriceText =
      Number.isFinite(card.originalPrice) && card.originalPrice > card.salePrice
        ? `¥${formatAmount(card.originalPrice)}/${card.unitText}`
        : null;
    const renewText = Number.isFinite(card.renewAmount)
      ? `${renewLabelByUnit[card.unit] || "续费金额"}：¥${formatAmount(card.renewAmount)}`
      : null;
    plans.push(
      asPlan({
        name: `${card.productName} (${card.unitText})`,
        currentPriceText,
        currentPrice: card.salePrice,
        originalPriceText,
        originalPrice: Number.isFinite(card.originalPrice) ? card.originalPrice : null,
        unit: card.unitText,
        notes: [card.tagText || "", renewText || ""].filter(Boolean).join("；"),
      }),
    );
  }
  if (plans.length === 0) {
    throw new Error("Unable to build Zhipu coding plans");
  }

  const docsUrl = "https://docs.bigmodel.cn/cn/coding-plan/overview";

  return {
    provider: PROVIDER_IDS.ZHIPU,
    sourceUrls: unique([pageUrl, appUrl, pricingChunkUrl, docsUrl]),
    fetchedAt: new Date().toISOString(),
    plans: dedupePlans(plans),
  };
}

function parseMinimaxOriginalPrice(priceText, currentText) {
  const originalMatch = priceText.match(/原价\s*([¥￥]?\s*[0-9]+(?:\.[0-9]+)?(?:\s*\/\s*[年月])?)/i);
  if (!originalMatch) {
    return null;
  }
  let original = normalizeText(originalMatch[1]);
  if (!/\/\s*[年月]/.test(original)) {
    const unitMatch = currentText.match(/\/\s*([年月])/);
    if (unitMatch) {
      original = `${original} /${unitMatch[1]}`;
    }
  }
  return original;
}

async function parseMinimaxCodingPlans() {
  const pageUrl = "https://platform.minimaxi.com/docs/guides/pricing-coding-plan";
  const html = await fetchText(pageUrl);
  const buyUrl = html.match(/https:\/\/platform\.minimaxi\.com\/subscribe\/coding-plan/)?.[0] || null;
  const rows = extractRows(html);
  const plans = [];
  for (let index = 0; index < rows.length; index += 1) {
    const headerRow = rows[index];
    const priceRow = rows[index + 1];
    const usageRow = rows[index + 2];
    if (!headerRow || !priceRow) {
      continue;
    }
    if (headerRow[0] !== "套餐类型" || priceRow[0] !== "价格") {
      continue;
    }

    for (let column = 1; column < headerRow.length; column += 1) {
      const rawName = normalizeText(headerRow[column] || "");
      const rawPriceCell = normalizeText(priceRow[column] || "");
      if (!rawName || !rawPriceCell || !isPriceLike(rawPriceCell)) {
        continue;
      }
      const currentText = normalizeText(rawPriceCell.replace(/\(\s*原价[^)）]+\)/g, ""));
      const originalText = parseMinimaxOriginalPrice(rawPriceCell, currentText);
      plans.push(
        asPlan({
          name: rawName,
          currentPriceText: currentText,
          originalPriceText: originalText,
          notes: usageRow && usageRow[column] ? `用量: ${normalizeText(usageRow[column])}` : null,
        }),
      );
    }
  }

  return {
    provider: PROVIDER_IDS.MINIMAX,
    sourceUrls: unique([pageUrl, buyUrl]),
    fetchedAt: new Date().toISOString(),
    plans: dedupePlans(plans),
  };
}

async function parseAliyunCodingPlans() {
  const pageUrl = "https://www.aliyun.com/benefit/scene/codingplan";
  const html = await fetchText(pageUrl);
  const entryUrl = html.match(/https:\/\/cloud-assets\.alicdn\.com\/lowcode\/entry\/prod\/[^"'\s]+\.js/)?.[0];
  if (!entryUrl) {
    throw new Error("Unable to locate Aliyun entry script");
  }
  const entryJs = await fetchText(entryUrl);
  const buyUrl =
    entryJs.match(/https:\/\/common-buy\.aliyun\.com\/\?commodityCode=sfm_codingplan_public_cn#\/buy/)?.[0] || null;

  const plans = [];
  const planRegex = /"?title"?\s*:\s*"\s*(Lite[^"]*|Pro[^"]*)"[\s\S]{0,800}?"?desc"?\s*:\s*"([^"]+)"/g;
  let match;
  while ((match = planRegex.exec(entryJs)) !== null) {
    const planName = normalizeText(match[1]);
    const descRaw = decodeUnicodeLiteral(match[2]).replace(/<br\s*\/?>/gi, "；").replace(/<\/br>/gi, "；");
    const descText = normalizeText(stripTags(descRaw));
    const firstMonthPrice = descText.match(/([0-9]+(?:\.[0-9]+)?)\s*元\s*\/\s*首月/);
    const discountOff = descText.match(/下单立减\s*([0-9]+(?:\.[0-9]+)?)\s*元/);
    if (!firstMonthPrice && !/首月|下单立减/.test(descText)) {
      continue;
    }
    plans.push(
      asPlan({
        name: planName,
        currentPriceText: firstMonthPrice ? `${firstMonthPrice[1]}元/首月` : descText,
        notes: [descText, discountOff ? `下单立减${discountOff[1]}元` : ""].filter(Boolean).join("；"),
      }),
    );
  }

  if (plans.length === 0) {
    throw new Error("Unable to parse Aliyun coding plans");
  }

  return {
    provider: PROVIDER_IDS.ALIYUN,
    sourceUrls: unique([pageUrl, entryUrl, buyUrl]),
    fetchedAt: new Date().toISOString(),
    plans: dedupePlans(plans),
  };
}

function parseVolcPlanFromBundle(bundleText, configurationCode) {
  const marker = `configurationCode:"${configurationCode}"`;
  const index = bundleText.indexOf(marker);
  if (index < 0) {
    return null;
  }
  const snippet = bundleText.slice(Math.max(0, index - 4500), index + 2600);
  const decoded = decodeUnicodeLiteral(snippet);
  const isLite = configurationCode.includes("Lite");

  const originalPriceText = decoded.match(/originalAmount:"([^"]+)"/)?.[1] || null;
  const discountRaw = decoded.match(/discountAmount:"([^"]+)"/)?.[1] || null;
  const primaryBtnText = decoded.match(/primaryBtnText:"([^"]+)"/)?.[1] || null;
  const buyUrl = snippet.match(/fastBuyMobileUrl:"([^"]+)"/)?.[1] || null;
  const tags =
    decoded
      .match(/tags:\[([^\]]+)\]/)?.[1]
      ?.match(/"([^"]+)"/g)
      ?.map((item) => normalizeText(item.replace(/"/g, ""))) || [];
  const freeHint = /0\s*成本|免费体验/.test(decoded);

  let currentPriceText = null;
  if (discountRaw) {
    currentPriceText = /元|¥|￥/.test(discountRaw) ? discountRaw : `${discountRaw}元/月`;
  } else if (freeHint) {
    currentPriceText = "0 成本试错";
  }

  if (!currentPriceText && !originalPriceText && !buyUrl) {
    return null;
  }

  return asPlan({
    name: isLite ? "Coding Plan Lite 月套餐" : "Coding Plan Pro 月套餐",
    currentPriceText: currentPriceText || "活动页查看",
    originalPriceText: originalPriceText || null,
    unit: "月",
    notes: [
      primaryBtnText ? `按钮: ${primaryBtnText}` : "",
      tags.length > 0 ? `标签: ${tags.join(" / ")}` : "",
      buyUrl ? `购买: ${buyUrl}` : "",
    ]
      .filter(Boolean)
      .join("；"),
  });
}

function volcBundleId(url) {
  const match = String(url).match(/fes2_app_(\d+)\//);
  return match ? Number(match[1]) : 0;
}

async function parseVolcengineCodingPlans() {
  const pageUrl = "https://www.volcengine.com/activity/codingplan";
  const garrUrl = `${pageUrl}/garrmodlistv3`;
  const payload = await fetchJson(garrUrl);
  const rawBundleUrls = unique(
    (payload?.data || [])
      .map((item) => item?.source_url)
      .filter(Boolean)
      .map((url) => (url.startsWith("//") ? `https:${url}` : url)),
  );
  const candidates = rawBundleUrls
    .map((url) => url.replace("/bundles/js/main.js", "/index.js"))
    .sort((left, right) => volcBundleId(right) - volcBundleId(left));

  const fallbackCandidates = [
    "https://lf6-cdn2-tos.bytegoofy.com/gftar/toutiao/fe_arch/fes2_app_1761224550685339/1.0.0.151/index.js",
  ];

  let bestPlans = [];
  let bestSourceUrl = null;
  let bestScore = -1;
  for (const candidate of unique([...candidates.slice(0, 30), ...fallbackCandidates])) {
    let bundleText;
    try {
      bundleText = await fetchText(candidate);
    } catch {
      continue;
    }
    const lite = parseVolcPlanFromBundle(bundleText, "Coding_Plan_Lite_monthly");
    const pro = parseVolcPlanFromBundle(bundleText, "Coding_Plan_Pro_monthly");
    const plans = [lite, pro].filter(Boolean);
    if (plans.length === 0) {
      continue;
    }
    const score = plans.reduce(
      (total, plan) =>
        total +
        (plan.currentPriceText ? 1 : 0) +
        (plan.originalPriceText ? 1 : 0) +
        (/0\s*成本/.test(plan.currentPriceText || "") ? 1 : 0),
      0,
    );
    if (plans.length >= 2) {
      if (score > bestScore) {
        bestScore = score;
        bestPlans = plans;
        bestSourceUrl = candidate;
      }
      if (score >= 4) {
        break;
      }
    }
  }

  if (bestPlans.length === 0) {
    throw new Error("Unable to parse Volcengine coding plan bundle");
  }

  return {
    provider: PROVIDER_IDS.VOLCENGINE,
    sourceUrls: unique([pageUrl, garrUrl, bestSourceUrl]),
    fetchedAt: new Date().toISOString(),
    plans: dedupePlans(bestPlans),
  };
}

async function main() {
  const providers = [];
  const failures = [];
  const tasks = [
    parseZhipuCodingPlans,
    parseKimiCodingPlans,
    parseVolcengineCodingPlans,
    parseMinimaxCodingPlans,
    parseAliyunCodingPlans,
  ];

  for (const task of tasks) {
    try {
      const data = await task();
      providers.push({
        ...data,
        plans: (data.plans || []).filter((plan) => plan.name && (plan.currentPriceText || plan.notes)),
      });
    } catch (error) {
      failures.push(error.message);
      console.warn(`[pricing] ${task.name} failed: ${error.message}`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    providers,
    failures,
  };

  const outputText = `${JSON.stringify(output, null, 2)}\n`;

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, outputText, "utf8");

  const summary = providers.map((provider) => `${provider.provider}: ${provider.plans.length}`).join(", ");
  console.log(`[pricing] wrote ${OUTPUT_FILE}`);
  console.log(`[pricing] plans -> ${summary}`);
  if (failures.length > 0) {
    console.log(`[pricing] failures -> ${failures.length}`);
  }
}

main().catch((error) => {
  console.error("[pricing] fatal:", error);
  process.exit(1);
});
