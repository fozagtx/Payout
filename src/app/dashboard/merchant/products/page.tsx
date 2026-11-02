import { PageHeading } from "../../PageHeading.js";
import { ProductsCard } from "./ProductsCard.js";

export default function Page() {
  return (
    <>
      <PageHeading title="Products" description="What your store sells. Add your own items, or search the catalog and hit Sell to list them at your price." />
      <ProductsCard />
    </>
  );
}
