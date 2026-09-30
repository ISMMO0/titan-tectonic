import { getBalance } from "./get-balance";
import { getPortfolio } from "./get-portfolio";
import { getExchangeRate } from "./get-exchange-rate";
import { buyStock } from "./buy-stock";
import { detectMoments, getSuggestions } from "./detect-life-moments";
import { getBudgetSummary } from "./get-budget-summary";
import { createInvestmentPlan } from "./create-investment-plan";
import { getStockPrice } from "./get-stock-price";
import { getCalendarEvents } from "./get-calendar-events";
import { getTransactions } from "./get-transactions";
import { moveToSavings } from "./move-to-savings";
import { transferMoney } from "./transfer-money";
import type { Tool } from "./types";

// To add a tool: create a file in this folder with `defineTool`, then add it here.
// update_address remains future work.
export const tools: Tool[] = [
  getPortfolio,
  getExchangeRate,
  buyStock,
  detectMoments,
  getSuggestions,
  getBalance,
  getTransactions,
  transferMoney,
  moveToSavings,
  getCalendarEvents,
  getBudgetSummary,
  createInvestmentPlan,
  getStockPrice,
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
