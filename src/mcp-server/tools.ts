import { z } from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  createExpense,
  listExpenses,
  listCategories,
  getExpenseStats,
  processReceipt,
  parseCFDI,
  CFDIParseError,
  createIncome,
  listIncome,
  checkDuplicateUuid,
  getIncomeSummary,
} from "@/lib/services";
import { resolveUserId } from "./auth";

export function registerTools(server: McpServer) {
  // ── create_expense ──────────────────────────────────────────────────────
  server.registerTool(
    "create_expense",
    {
      title: "Create Expense",
      description:
        "Create a new expense entry. Requires amount, description, and categoryId. Optionally accepts date (YYYY-MM-DD), receipt URL, and OCR text.",
      inputSchema: z.object({
        amount: z.number().positive().describe("Expense amount (must be > 0)"),
        description: z.string().min(1).describe("Short description of the expense"),
        categoryId: z.string().min(1).describe("Category ID (use list_categories to get valid IDs)"),
        date: z.string().optional().describe("Date in YYYY-MM-DD format (defaults to today)"),
        receipt: z.string().optional().describe("Receipt image URL"),
        ocrText: z.string().optional().describe("OCR extracted text from receipt"),
      }),
    },
    async ({ amount, description, categoryId, date, receipt, ocrText }) => {
      try {
        const userId = await resolveUserId();
        const expense = await createExpense({
          amount,
          description,
          categoryId,
          userId,
          date,
          receipt,
          ocrText,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(expense, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to create expense" }),
            },
          ],
        };
      }
    }
  );

  // ── list_categories ─────────────────────────────────────────────────────
  server.registerTool(
    "list_categories",
    {
      title: "List Categories",
      description: "Get all available expense categories with their IDs, names, icons, and colors.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const categories = await listCategories();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(categories, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to list categories" }),
            },
          ],
        };
      }
    }
  );

  // ── list_expenses ───────────────────────────────────────────────────────
  server.registerTool(
    "list_expenses",
    {
      title: "List Expenses",
      description:
        "Query expenses with optional filters. Month and year must be provided together. Returns expenses ordered by date (newest first).",
      inputSchema: z.object({
        month: z.number().int().min(1).max(12).optional().describe("Month (1-12)"),
        year: z.number().int().min(2000).max(2100).optional().describe("Year (2000-2100)"),
        categoryId: z.string().optional().describe("Filter by category ID"),
      }),
    },
    async ({ month, year, categoryId }) => {
      try {
        // Validate month/year pair
        if ((month && !year) || (!month && year)) {
          return {
            isError: true,
            content: [
              { type: "text" as const, text: JSON.stringify({ error: "month and year must be provided together" }) },
            ],
          };
        }

        const userId = await resolveUserId();
        const expenses = await listExpenses({ userId, month, year, categoryId });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: expenses.length, expenses }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to list expenses" }),
            },
          ],
        };
      }
    }
  );

  // ── get_summary ─────────────────────────────────────────────────────────
  server.registerTool(
    "get_summary",
    {
      title: "Get Expense Summary",
      description:
        "Get monthly spending summary with totals, breakdown by category, daily/weekly trends, budget alerts, and recent expenses. Defaults to current month.",
      inputSchema: z.object({
        month: z.number().int().min(1).max(12).optional().describe("Month (1-12, defaults to current)"),
        year: z.number().int().min(2000).max(2100).optional().describe("Year (defaults to current)"),
      }),
    },
    async ({ month, year }) => {
      try {
        const userId = await resolveUserId();
        const stats = await getExpenseStats({ userId, month, year });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to get summary" }),
            },
          ],
        };
      }
    }
  );

  // ── process_receipt ─────────────────────────────────────────────────────
  server.registerTool(
    "process_receipt",
    {
      title: "Process Receipt",
      description:
        "Send a receipt image (base64-encoded) for OCR analysis. Returns extracted amount, description, suggested category, and date. Optionally uploads to Cloudinary.",
      inputSchema: z.object({
        imageBase64: z.string().min(1).describe("Base64-encoded receipt image"),
        mimeType: z.string().optional().describe("Image MIME type (defaults to image/jpeg)"),
      }),
    },
    async ({ imageBase64, mimeType }) => {
      try {
        const imageBuffer = Buffer.from(imageBase64, "base64");
        const result = await processReceipt({
          imageBuffer,
          mimeType: mimeType || "image/jpeg",
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: error instanceof Error ? error.message : "Failed to process receipt",
              }),
            },
          ],
        };
      }
    }
  );

  // ── upload_cfdi ─────────────────────────────────────────────────────────
  server.registerTool(
    "upload_cfdi",
    {
      title: "Upload CFDI",
      description:
        "Parse a CFDI XML (base64-encoded) and optionally create an income record. When confirm=false, returns a preview and duplicate check without saving. When confirm=true (default), parses and creates the income record.",
      inputSchema: z.object({
        xml_base64: z.string().min(1).describe("Base64-encoded CFDI XML content"),
        confirm: z.boolean().default(true).describe("If false, only parse and preview (no record created). If true, parse and save income."),
      }),
    },
    async ({ xml_base64, confirm }) => {
      try {
        const userId = await resolveUserId();
        const xmlString = Buffer.from(xml_base64, "base64").toString("utf-8");

        let parsed;
        try {
          parsed = parseCFDI(xmlString);
        } catch (parseError) {
          if (parseError instanceof CFDIParseError) {
            return {
              isError: true,
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ error: parseError.message, code: parseError.code }),
                },
              ],
            };
          }
          throw parseError;
        }

        // Always check for duplicate UUID (global — UUID is unique across all users)
        const duplicate = await checkDuplicateUuid(parsed.uuid);

        if (!confirm) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    preview: parsed,
                    isDuplicate: !!duplicate,
                    duplicateRecord: duplicate || null,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (duplicate) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "CFDI ya registrado",
                  code: "DUPLICATE_UUID",
                  existingRecord: duplicate,
                }),
              },
            ],
          };
        }

        const { suggestedIncome } = parsed;
        const income = await createIncome({
          ...suggestedIncome,
          cfdiUuid: parsed.uuid,
          cfdiXml: xmlString,
          userId,
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ income, parsed }, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to upload CFDI" }),
            },
          ],
        };
      }
    }
  );

  // ── create_income ────────────────────────────────────────────────────────
  server.registerTool(
    "create_income",
    {
      title: "Create Income",
      description:
        "Create a manual income record (no XML required). Use for cash deposits or income that doesn't have a CFDI. bankDeposit equals amount; despensa is 0.",
      inputSchema: z.object({
        amount: z.number().positive().describe("Total income amount (must be > 0)"),
        description: z.string().min(1).describe("Short description of the income"),
        source: z.enum(["NOMINA", "FACTURA", "OTRO"]).optional().describe("Income source type (defaults to OTRO)"),
        date: z.string().optional().describe("Date in YYYY-MM-DD format (defaults to today)"),
        employer: z.string().optional().describe("Employer or payer name"),
      }),
    },
    async ({ amount, description, source, date, employer }) => {
      try {
        const userId = await resolveUserId();
        const income = await createIncome({
          amount,
          bankDeposit: amount,
          despensa: 0,
          description,
          source,
          date,
          employer,
          userId,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(income, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to create income" }),
            },
          ],
        };
      }
    }
  );

  // ── list_income ──────────────────────────────────────────────────────────
  server.registerTool(
    "list_income",
    {
      title: "List Income",
      description:
        "Query income records with optional filters. Month and year must be provided together. Returns income ordered by date (newest first) with totals.",
      inputSchema: z.object({
        month: z.number().int().min(1).max(12).optional().describe("Month (1-12)"),
        year: z.number().int().min(2000).max(2100).optional().describe("Year (2000-2100)"),
        source: z.enum(["NOMINA", "FACTURA", "OTRO"]).optional().describe("Filter by income source"),
      }),
    },
    async ({ month, year, source }) => {
      try {
        if ((month && !year) || (!month && year)) {
          return {
            isError: true,
            content: [
              { type: "text" as const, text: JSON.stringify({ error: "month and year must be provided together" }) },
            ],
          };
        }

        const userId = await resolveUserId();
        const result = await listIncome({ userId, month, year, source });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ count: result.incomes.length, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to list income" }),
            },
          ],
        };
      }
    }
  );

  // ── get_income_summary ───────────────────────────────────────────────────
  server.registerTool(
    "get_income_summary",
    {
      title: "Get Income Summary",
      description:
        "Get yearly income summary with totals, breakdown by source, and monthly breakdown. Only months with records are included.",
      inputSchema: z.object({
        year: z.number().int().min(2000).max(2100).describe("Year (required)"),
      }),
    },
    async ({ year }) => {
      try {
        const userId = await resolveUserId();
        const summary = await getIncomeSummary({ userId, year });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: error instanceof Error ? error.message : "Failed to get income summary" }),
            },
          ],
        };
      }
    }
  );
}
