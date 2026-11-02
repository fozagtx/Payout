import {
  createFormats,
  studioTheme,
  type AgDataSourcesDefinition,
  type AgFieldDefinition,
  type AgFormat,
  type AgReportState,
  type AgWidgetLayoutState,
} from "ag-studio";

export type AnalyticsData = {
  licenseKey: string | null;
  orders: {
    id: string;
    date: string;
    status: string;
    statusGroup: string;
    currency: string;
    total: number;
    refunded: number;
    net: number;
    disputed: number;
    disputeStatus: string | null;
    merchant: string;
    itemCount: number;
  }[];
  items: { orderId: string; title: string; merchant: string; quantity: number; unitPrice: number; lineTotal: number }[];
  refunds: { orderId: string; date: string; amount: number; reason: string }[];
  watches: { id: string; title: string; startPrice: number | null; lastPrice: number | null; change: number | null; inStock: boolean | null; alert: string | null; date: string }[];
};

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide ? { hide } : {}) }));

const USD_FORMATS = createFormats({
  overrides: {
    currencyFormat: {
      formatOptions: {
        format: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }),
      },
    },
  },
});

const sum = (id: string) => ({ id, aggregation: "sum" as const });

export function buildStudioData(data: AnalyticsData): AgDataSourcesDefinition {
  return {
    formats: USD_FORMATS,
    description:
      "Your PayPal Sandbox orders, refunds, disputes, and Channel3 price watches.",
    sources: [
      {
        id: "orders",
        description: "One row per PayPal checkout. Revenue is total for Paid, Partially refunded and Refunded orders; net is total minus refunded.",
        data: data.orders,
        fields: fields([
            ["id", "Order ID", "textFormat"],
            ["date", "Order date", "dateFormat"],
            ["status", "PayPal status", "textFormat", true],
            ["statusGroup", "Status", "textFormat"],
            ["currency", "Currency", "textFormat"],
            ["total", "Order total", "currencyFormat"],
            ["refunded", "Refunded", "currencyFormat"],
            ["net", "Net revenue", "currencyFormat"],
            ["disputed", "Disputed orders", "integerFormat"],
            ["disputeStatus", "Dispute status", "textFormat"],
            ["merchant", "Store", "textFormat"],
            ["itemCount", "Items", "integerFormat"],
          ]),
      },
      {
        id: "items",
        name: "Order items",
        description: "Line items of each order, priced from Channel3 when the checkout was created.",
        data: data.items,
        fields: fields([
          ["orderId", "Order ID", "textFormat", true],
          ["title", "Product", "textFormat"],
          ["merchant", "Store", "textFormat"],
          ["quantity", "Quantity", "integerFormat"],
          ["unitPrice", "Unit price", "currencyFormat"],
          ["lineTotal", "Line total", "currencyFormat"],
        ]),
      },
      {
        id: "refunds",
        description: "Each PayPal refund, full or partial, with the reason picked in the refund dialog.",
        data: data.refunds,
        fields: fields([
          ["orderId", "Order ID", "textFormat", true],
          ["date", "Refund date", "dateFormat"],
          ["amount", "Refund amount", "currencyFormat"],
          ["reason", "Refund reason", "textFormat"],
        ]),
      },
      {
        id: "watches",
        name: "Price watches",
        description: "Products you watch through Channel3 product subscriptions.",
        data: data.watches,
        fields: fields([
          ["id", "Watch ID", "textFormat", true],
          ["title", "Product", "textFormat"],
          ["startPrice", "Price when watched", "currencyFormat"],
          ["lastPrice", "Latest price", "currencyFormat"],
          ["change", "Price change", "currencyFormat"],
          ["inStock", "In stock", "booleanFormat"],
          ["alert", "Latest alert", "textFormat"],
          ["date", "Watched since", "dateFormat"],
        ]),
      },
    ],
    relationships: [
      { id: "items-order", source: { tableId: "items", fieldId: "orderId" }, target: { tableId: "orders", fieldId: "id" }, type: "many-to-one" },
      { id: "refunds-order", source: { tableId: "refunds", fieldId: "orderId" }, target: { tableId: "orders", fieldId: "id" }, type: "many-to-one" },
    ],
    expressions: [
      {
        id: "refundRate",
        name: "Refund rate",
        description: "Refunded amount as a share of order totals.",
        format: "percentageFormat",
        isMeasure: true,
        expression: { operator: "divide", inputs: [sum("orders.refunded"), sum("orders.total")] },
      },
    ],
  };
}

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const countd = (id: string) => ({ id, aggregation: "countd" as const });
const kpi = (text: string, value: { id: string; aggregation?: "sum" | "countd" }) => ({
  type: "value" as const,
  dataMapping: { value: [value] },
  format: title(text),
});

export const initialReport: AgReportState = {
  pages: [
    {
      id: "overview",
      widgets: {
        "kpi-revenue": kpi("Revenue", sum("orders.total")),
        "kpi-net": kpi("Net after refunds", sum("orders.net")),
        "kpi-orders": kpi("Orders", countd("orders.id")),
        "kpi-refund-rate": kpi("Refund rate", { id: "refundRate" }),
        "kpi-disputes": kpi("Disputed orders", sum("orders.disputed")),
        "revenue-by-store": {
          type: "column-chart-grouped",
          dataMapping: { categoryKey: [{ id: "orders.merchant" }], valueKey: [sum("orders.total"), sum("orders.refunded")] },
          format: title("Revenue and refunds by store"),
        },
        "orders-by-status": {
          type: "donut-chart",
          dataMapping: { categoryKey: [{ id: "orders.statusGroup" }], valueKey: [countd("orders.id")] },
          format: {
            ...title("Orders by status"),
            style: {
              theme: {
                common: {
                  legend: { enabled: true, position: "right" },
                },
              },
            },
          },
        },
        "revenue-by-day": {
          type: "line-chart",
          dataMapping: { categoryKey: [{ id: "orders.date" }], valueKey: [sum("orders.total"), sum("orders.net")] },
          format: title("Revenue by day"),
        },
        "refunds-by-reason": {
          type: "bar-chart-grouped",
          dataMapping: { categoryKey: [{ id: "refunds.reason" }], valueKey: [sum("refunds.amount")] },
          format: title("Refunds by reason"),
        },
        "orders-grid": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "orders.date" },
              { id: "orders.id" },
              { id: "orders.merchant" },
              { id: "orders.statusGroup" },
              sum("orders.total"),
              sum("orders.refunded"),
              { id: "orders.disputeStatus" },
            ],
          },
          format: title("All orders"),
        },
      },
      widgetLayout: {
        "kpi-revenue": at(0, 0, 4, 7),
        "kpi-net": at(4, 0, 4, 7),
        "kpi-orders": at(8, 0, 4, 7),
        "kpi-refund-rate": at(12, 0, 4, 7),
        "kpi-disputes": at(16, 0, 4, 7),
        "revenue-by-store": at(0, 7, 14, 17),
        "orders-by-status": at(14, 7, 10, 17),
        "revenue-by-day": at(0, 24, 14, 17),
        "refunds-by-reason": at(14, 24, 10, 17),
        "orders-grid": at(0, 41, 24, 20),
      },
    },
    {
      id: "watches",
      widgets: {
        "kpi-watching": kpi("Products watched", countd("watches.id")),
        "watches-grid": {
          type: "grid",
          dataMapping: {
            cols: [
              { id: "watches.title" },
              sum("watches.startPrice"),
              sum("watches.lastPrice"),
              sum("watches.change"),
              { id: "watches.inStock" },
              { id: "watches.alert" },
              { id: "watches.date" },
            ],
          },
          format: title("Price watches"),
        },
      },
      widgetLayout: {
        "kpi-watching": at(0, 0, 8, 7),
        "watches-grid": at(0, 7, 24, 20),
      },
    },
  ],
  selectedPageId: "overview",
  panels: { filters: { collapsed: true } },
};

const FONT = '"Geist", ui-sans-serif, system-ui, sans-serif';
const line = (color: string) => ({ width: 1, color });
const CHART_COLORS = ["#2d2b28", "#a9875b", "#ecdfc8", "#55524c", "#8b867c", "#3f7ee8", "#ffc439", "#ddd5c6", "#1c1b19", "#003087"];

export const payoutTheme = studioTheme.withParams({
  fontFamily: FONT,
  fontSize: 14,
  textColor: "#2d2b28",
  foregroundColor: "#2d2b28",
  subtleTextColor: "#8b867c",
  backgroundColor: "#ffffff",
  borderColor: "#ebe5d9",
  accentColor: "#a9875b",
  iconColor: "#55524c",
  rowHoverColor: "#f5efe3",
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: "#fbf9f3",
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: "#fbf9f3",
  studioCanvasPadding: 4,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: FONT,
  studioWidgetBackgroundColor: "#ffffff",
  studioWidgetBorder: line("#ebe5d9"),
  studioWidgetBorderRadius: 16,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: FONT,
  studioWidgetTitleFontSize: 14,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: "#1c1b19",
  studioWidgetSubtitleTextColor: "#8b867c",
  studioWidgetCaptionTextColor: "#8b867c",
  studioWidgetResizeBorderColor: "#a9875b",
  studioPanelContainerBackgroundColor: "#ffffff",
  studioPanelContainerBorder: line("#ebe5d9"),
  studioPanelDividerColor: "#ebe5d9",
  studioPanelDividerActiveColor: "#a9875b",
  studioPanelHeaderFontFamily: FONT,
  studioPanelHeaderFontWeight: 600,
  studioToggleButtonActiveBackgroundColor: "#ecdfc8",
  studioToggleButtonActiveBorderColor: "#a9875b",
  studioToggleButtonActiveColor: "#1c1b19",
  gridFontFamily: FONT,
  gridFontSize: 13,
  gridCellTextColor: "#2d2b28",
  gridHeaderBackgroundColor: "#fbf9f3",
  gridHeaderTextColor: "#8b867c",
  gridHeaderFontWeight: 600,
  gridRowHeight: 38,
  gridRowBorder: line("#f1ece2"),
  gridHeaderRowBorder: line("#ebe5d9"),
  gridRowHoverColor: "#f5efe3",
  gridWrapperBorder: false,
  chartFontFamily: FONT,
  chartTextColor: "#2d2b28",
  chartSubtleTextColor: "#8b867c",
  chartAxisLineColor: "#ebe5d9",
  chartGridLineColor: "#f1ece2",
  ...Object.fromEntries(
    CHART_COLORS.flatMap((color, index) => [
      [`chartPaletteFills${index + 1}Color`, color],
      [`chartPaletteStrokes${index + 1}Color`, color],
    ])
  ),
});
