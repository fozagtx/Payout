import { PageHeading } from "../../PageHeading.js";
import { MerchantOrdersCard } from "./MerchantOrdersCard.js";

export default function Page() {
  return <><PageHeading title="Orders" description="Every order buyers placed — pending refund requests first. You ship these orders." /><MerchantOrdersCard /></>;
}
