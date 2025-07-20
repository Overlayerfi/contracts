import { deploy_SepoliaFaucet } from "../functions";

const USDT = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0";
const OverlayerWrap_USDT = "0x99116761257760775aa535C120284eFaEfe28467";

deploy_SepoliaFaucet(USDT, OverlayerWrap_USDT).catch(
  (e) => console.error(e)
);
