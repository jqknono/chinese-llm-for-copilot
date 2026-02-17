const DATA_PATH = "./provider-pricing.json";

const PROVIDER_LABELS = {
  "zhipu-ai": "智谱 z.ai",
  "kimi-ai": "Kimi",
  "volcengine-ai": "火山引擎",
  "minimax-ai": "MiniMax",
  "aliyun-ai": "阿里云通义千问",
};

const state = {
  data: null,
  unit: "all",
};

const unitFilterEl = document.querySelector("#unitFilter");
const reloadButtonEl = document.querySelector("#reloadButton");
const providerGridEl = document.querySelector("#providerGrid");
const errorBannerEl = document.querySelector("#errorBanner");
const generatedAtEl = document.querySelector("#generatedAt");
const providerCountEl = document.querySelector("#providerCount");
const planCountEl = document.querySelector("#planCount");

function formatDate(isoText) {
  if (!isoText) {
    return "--";
  }
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createElement(tagName, className, textContent) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined && textContent !== null) {
    element.textContent = textContent;
  }
  return element;
}

function setError(message) {
  if (!message) {
    errorBannerEl.classList.add("hidden");
    errorBannerEl.textContent = "";
    return;
  }
  errorBannerEl.classList.remove("hidden");
  errorBannerEl.textContent = message;
}

function normalizeUnit(unit) {
  return String(unit || "").trim() || "未标注";
}

function collectUnits(providers) {
  const units = new Set();
  for (const provider of providers) {
    for (const plan of provider.plans || []) {
      units.add(normalizeUnit(plan.unit));
    }
  }
  return [...units].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function refreshUnitOptions(providers) {
  const units = collectUnits(providers);
  if (state.unit !== "all" && !units.includes(state.unit)) {
    state.unit = "all";
  }
  const options = [{ value: "all", label: "全部" }, ...units.map((unit) => ({ value: unit, label: unit }))];
  unitFilterEl.replaceChildren();
  for (const option of options) {
    const optionEl = createElement("option", "", option.label);
    optionEl.value = option.value;
    if (option.value === state.unit) {
      optionEl.selected = true;
    }
    unitFilterEl.append(optionEl);
  }
}

function displayPrice(plan) {
  return plan.currentPriceText || (Number.isFinite(plan.currentPrice) ? `¥${plan.currentPrice}` : "价格待确认");
}

function renderProviders(data) {
  const providers = Array.isArray(data.providers) ? data.providers : [];
  const filteredProviders = providers
    .map((provider) => {
      const plans = (provider.plans || []).filter((plan) => {
        if (state.unit === "all") {
          return true;
        }
        return normalizeUnit(plan.unit) === state.unit;
      });
      return { ...provider, plans };
    })
    .filter((provider) => provider.plans.length > 0);

  providerGridEl.replaceChildren();

  if (filteredProviders.length === 0) {
    providerGridEl.append(createElement("article", "empty", "当前筛选条件下没有套餐数据。"));
    providerCountEl.textContent = "0";
    planCountEl.textContent = "0";
    return;
  }

  let totalPlans = 0;
  for (const provider of filteredProviders) {
    totalPlans += provider.plans.length;

    const card = createElement("article", "provider-card");
    const head = createElement("header", "provider-head");
    const title = createElement("h2", "provider-title", PROVIDER_LABELS[provider.provider] || provider.provider);
    const meta = createElement("p", "provider-meta", `更新：${formatDate(provider.fetchedAt)}`);
    head.append(title, meta);

    const planList = createElement("ul", "plan-list");
    for (const plan of provider.plans) {
      const item = createElement("li", "plan-item");
      const name = createElement("h3", "plan-name", plan.name || "未命名套餐");
      const priceRow = createElement("p", "price-row");
      const currentPrice = createElement("span", "price-now", displayPrice(plan));
      priceRow.append(currentPrice);

      const isDiscount =
        plan.originalPriceText &&
        plan.originalPriceText !== plan.currentPriceText &&
        String(plan.originalPriceText).trim() !== "";

      if (isDiscount) {
        priceRow.append(createElement("span", "price-before", plan.originalPriceText));
      }

      if (plan.unit) {
        priceRow.append(createElement("span", "unit-tag", normalizeUnit(plan.unit)));
      }

      item.append(name, priceRow);

      if (plan.notes) {
        item.append(createElement("p", "plan-notes", plan.notes));
      }

      planList.append(item);
    }

    card.append(head, planList);

    if (provider.sourceUrls && provider.sourceUrls.length > 0) {
      const sourceWrap = createElement("details", "sources");
      const summary = createElement("summary", "", `数据来源 (${provider.sourceUrls.length})`);
      const sourceList = createElement("ul", "source-list");
      for (const url of provider.sourceUrls) {
        const line = createElement("li");
        const link = createElement("a", "", url);
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        line.append(link);
        sourceList.append(line);
      }
      sourceWrap.append(summary, sourceList);
      card.append(sourceWrap);
    }

    providerGridEl.append(card);
  }

  providerCountEl.textContent = String(filteredProviders.length);
  planCountEl.textContent = String(totalPlans);
}

function renderFailures(data) {
  const failures = Array.isArray(data.failures) ? data.failures : [];
  if (failures.length === 0) {
    setError("");
    return;
  }
  setError(`抓取存在 ${failures.length} 个失败项：${failures.join("；")}`);
}

async function loadData() {
  setError("");
  reloadButtonEl.disabled = true;
  reloadButtonEl.textContent = "加载中...";
  try {
    const response = await fetch(DATA_PATH, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    state.data = data;
    generatedAtEl.textContent = formatDate(data.generatedAt);
    refreshUnitOptions(data.providers || []);
    renderProviders(data);
    renderFailures(data);
  } catch (error) {
    providerGridEl.replaceChildren();
    providerGridEl.append(createElement("article", "empty", "加载失败，请稍后重试。"));
    generatedAtEl.textContent = "--";
    providerCountEl.textContent = "0";
    planCountEl.textContent = "0";
    setError(`无法读取 ${DATA_PATH}：${error.message}`);
  } finally {
    reloadButtonEl.disabled = false;
    reloadButtonEl.textContent = "重新加载";
  }
}

unitFilterEl.addEventListener("change", (event) => {
  state.unit = event.target.value;
  if (state.data) {
    renderProviders(state.data);
  }
});

reloadButtonEl.addEventListener("click", () => {
  loadData();
});

loadData();
