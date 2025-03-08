import { deploy_SubscriptionConsumerSepolia } from "../functions";

const id =
  "51477430335615150123194640203854282915852363796710175046284213006020073475124";
deploy_SubscriptionConsumerSepolia(id)
  .then(() => console.log("Completed"))
  .catch((e) => console.error(e));
