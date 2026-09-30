import { buyStock } from "./buy-stock";
import { createInvestmentPlan } from "./create-investment-plan";
import { detectLifeMomentsTool } from "./detect-life-moments";
import { getBalance } from "./get-balance";
import { getBudgetSummary } from "./get-budget-summary";
import { getCalendarEvents } from "./get-calendar-events";
import { getExchangeRate } from "./get-exchange-rate";
import { getPortfolio } from "./get-portfolio";
import { getStockPrice } from "./get-stock-price";
import { getTransactions } from "./get-transactions";
import { moveToSavings } from "./move-to-savings";
import { transferMoney } from "./transfer-money";
import type { Tool } from "./types";

// To add a tool: create a file in this folder with `defineTool`, then add it here.
// Planned: update_address, sell_stock.
export const tools: Tool[] = [
  // Understand
  getBalance,
  getTransactions,
  getBudgetSummary,
  getCalendarEvents,
  detectLifeMomentsTool,
  // Invest
  getStockPrice,
  getPortfolio,
  createInvestmentPlan,
  getExchangeRate,
  // Act (all create a pending action the user must confirm)
  transferMoney,
  moveToSavings,
  buyStock,
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
