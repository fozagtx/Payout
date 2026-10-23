import type { Catalog, Product, SearchOptions } from "../services.js";

/**
 * A built-in catalog used when no CHANNEL3_API_KEY is set, so the whole flow
 * (search → canvas → PayPal sandbox) works for anyone trying the app.
 */

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`;

export const DEMO_PRODUCTS: readonly Product[] = [
  {
    id: "demo_wireless_headphones",
    title: "Wireless Over-Ear Headphones",
    brand: "Sonora",
    description: "Bluetooth headphones with active noise cancelling, 30-hour battery and plush memory-foam ear cushions.",
    imageUrl: img("photo-1505740420928-5e560c06d30e"),
    priceCents: 12_999,
    compareAtCents: 15_999,
    currency: "USD",
    merchant: "sonora-audio.example",
    merchantUrl: "https://sonora-audio.example/products/over-ear",
    inStock: true,
  },
  {
    id: "demo_true_wireless_earbuds",
    title: "True Wireless Earbuds",
    brand: "Sonora",
    description: "Compact in-ear earbuds with charging case, sweat resistant, ideal headphones for workouts.",
    imageUrl: img("photo-1590658268037-6bf12165a8df"),
    priceCents: 7_999,
    currency: "USD",
    merchant: "sonora-audio.example",
    merchantUrl: "https://sonora-audio.example/products/earbuds",
    inStock: true,
  },
  {
    id: "demo_portable_speaker",
    title: "Portable Bluetooth Speaker",
    brand: "Sonora",
    description: "Waterproof speaker with 360° sound and a 12-hour battery for the beach or the backyard.",
    imageUrl: img("photo-1608043152269-423dbba4e7e1"),
    priceCents: 5_999,
    currency: "USD",
    merchant: "sonora-audio.example",
    merchantUrl: "https://sonora-audio.example/products/speaker",
    inStock: true,
  },
  {
    id: "demo_minimalist_watch",
    title: "Minimalist Analog Watch",
    brand: "Halden",
    description: "Stainless steel case, sapphire glass and a genuine leather strap. Water resistant to 50 m.",
    imageUrl: img("photo-1523275335684-37898b6baf30"),
    priceCents: 18_900,
    currency: "USD",
    merchant: "halden.example",
    merchantUrl: "https://halden.example/watches/classic",
    inStock: true,
  },
  {
    id: "demo_red_sneakers",
    title: "Classic Red Sneakers",
    brand: "Stride",
    description: "Lightweight everyday running shoes with breathable mesh and a cushioned sole.",
    imageUrl: img("photo-1542291026-7eec264c27ff"),
    priceCents: 9_500,
    compareAtCents: 11_000,
    currency: "USD",
    merchant: "stride-shoes.example",
    merchantUrl: "https://stride-shoes.example/p/classic-red",
    inStock: true,
  },
  {
    id: "demo_trail_running_shoes",
    title: "Trail Running Shoes",
    brand: "Stride",
    description: "Grippy outsole and a rock plate for technical trails. Running shoes built for mud and miles.",
    imageUrl: img("photo-1606107557195-0e29a4b5b4aa"),
    priceCents: 13_400,
    currency: "USD",
    merchant: "stride-shoes.example",
    merchantUrl: "https://stride-shoes.example/p/trail",
    inStock: false,
  },
  {
    id: "demo_instant_camera",
    title: "Instant Film Camera",
    brand: "Lumo",
    description: "Retro instant camera that prints credit-card-sized photos in seconds. Includes a 10-shot film pack.",
    imageUrl: img("photo-1526170375885-4d8ecf77b99f"),
    priceCents: 8_999,
    currency: "USD",
    merchant: "lumo-camera.example",
    merchantUrl: "https://lumo-camera.example/instant",
    inStock: true,
  },
  {
    id: "demo_polarized_sunglasses",
    title: "Polarized Sunglasses",
    brand: "Coastline",
    description: "UV400 polarized lenses in a lightweight acetate frame. Comes with a hard case.",
    imageUrl: img("photo-1572635196237-14b3f281503f"),
    priceCents: 4_500,
    compareAtCents: 6_000,
    currency: "USD",
    merchant: "coastline.example",
    merchantUrl: "https://coastline.example/sunglasses/polarized",
    inStock: true,
  },
  {
    id: "demo_canvas_backpack",
    title: "Everyday Canvas Backpack",
    brand: "Fieldwork",
    description: "Water-resistant waxed canvas backpack with a padded 15-inch laptop sleeve.",
    imageUrl: img("photo-1553062407-98eeb64c6a62"),
    priceCents: 7_400,
    currency: "USD",
    merchant: "fieldwork.example",
    merchantUrl: "https://fieldwork.example/bags/everyday",
    inStock: true,
  },
  {
    id: "demo_mechanical_keyboard",
    title: "Compact Mechanical Keyboard",
    brand: "Keyforge",
    description: "75% wireless mechanical keyboard with hot-swappable tactile switches and white backlight.",
    imageUrl: img("photo-1587829741301-dc798b83add3"),
    priceCents: 11_900,
    currency: "USD",
    merchant: "keyforge.example",
    merchantUrl: "https://keyforge.example/k75",
    inStock: true,
  },
  {
    id: "demo_desk_lamp",
    title: "Adjustable LED Desk Lamp",
    brand: "Lumen & Co",
    description: "Dimmable desk lamp with adjustable arm, warm-to-cool color temperature and USB charging port.",
    imageUrl: img("photo-1507473885765-e6ed057f782c"),
    priceCents: 3_999,
    currency: "USD",
    merchant: "lumenco.example",
    merchantUrl: "https://lumenco.example/desk-lamp",
    inStock: true,
  },
  {
    id: "demo_ceramic_mug",
    title: "Stoneware Coffee Mug, 12 oz",
    brand: "Kiln House",
    description: "Hand-glazed ceramic coffee mug. Dishwasher and microwave safe.",
    imageUrl: img("photo-1514228742587-6b1558fcca3d"),
    priceCents: 1_800,
    currency: "USD",
    merchant: "kilnhouse.example",
    merchantUrl: "https://kilnhouse.example/mugs/stoneware",
    inStock: true,
  },
  {
    id: "demo_insulated_bottle",
    title: "Insulated Water Bottle, 24 oz",
    brand: "Fieldwork",
    description: "Double-wall stainless steel bottle keeps drinks cold for 24 hours or hot for 12.",
    imageUrl: img("photo-1602143407151-7111542de6e8"),
    priceCents: 2_900,
    currency: "USD",
    merchant: "fieldwork.example",
    merchantUrl: "https://fieldwork.example/bottles/24oz",
    inStock: true,
  },
];

/** "Shoes" also matches "shoe", "headphones" matches "headphone". */
function wordMatches(haystack: string, word: string) {
  if (haystack.includes(word)) return true;
  return word.length > 3 && word.endsWith("s") && haystack.includes(word.slice(0, -1));
}

export function createDemoCatalog(products: readonly Product[] = DEMO_PRODUCTS): Catalog {
  return {
    async search(query: string, options: SearchOptions = {}) {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const limit = Math.min(12, Math.max(1, Math.floor(options.limit ?? 8)));
      return products
        .filter((product) => {
          const haystack = `${product.title} ${product.brand ?? ""} ${product.description ?? ""}`.toLowerCase();
          return words.every((word) => wordMatches(haystack, word));
        })
        .filter((product) => options.maxPriceCents === undefined || product.priceCents <= options.maxPriceCents)
        .filter((product) => options.minPriceCents === undefined || product.priceCents >= options.minPriceCents)
        .slice(0, limit)
        .map((product) => ({ ...product }));
    },
    async get(productId: string) {
      const product = products.find((p) => p.id === productId);
      return product ? { ...product } : undefined;
    },
  };
}
