import { deploy_OvaWhitelist } from "../functions";

deploy_OvaWhitelist("0xE6379d6EB7573734eD198cbc98D37769c40b4126")
  .then(() => console.log("Completed deployment of OvaWhitelist"))
  .catch((e) => console.error(e));
