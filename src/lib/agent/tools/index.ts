import { getBalance } from "./get-balance";
import { getCalendarEvents } from "./get-calendar-events";
import { getTransactions } from "./get-transactions";
import { moveToSavings } from "./move-to-savings";
import { transferMoney } from "./transfer-money";
import type { Tool } from "./types";

// To add a tool: create a file in this folder with `defineTool`, then add it here.
// Planned (PROJECT_PLAN.md): get_budget_summary, create_investment_plan,
// get_stock_price, buy_stock, detect_life_moments, get_suggestions, update_address.
export const tools: Tool[] = [getBalance, getTransactions, transferMoney, moveToSavings, getCalendarEvents];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));
