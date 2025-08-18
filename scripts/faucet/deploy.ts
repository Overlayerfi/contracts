import { deploy_SepoliaFaucet } from "../functions";

const USDT = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0";
const OverlayerWrap_USDT = "0x1Ac7E198685e53cCc3599e1656E48Dd7E278EbbE";

deploy_SepoliaFaucet(USDT, OverlayerWrap_USDT).catch((e) => console.error(e));
