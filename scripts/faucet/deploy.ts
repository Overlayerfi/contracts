import { deploy_SepoliaFauct } from "../functions";

const USDC = "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8";
const USDT = "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0";
const OverlayerWrap_USDC = "0x8C83b8Eba7742275F00F49490CBA1e7DE77ca6Af";
const OverlayerWrap_USDT = "0xfd0E0c5132B1C0C59A413e52f97BC421592Ba460";

deploy_SepoliaFauct(USDC, USDT, OverlayerWrap_USDC, OverlayerWrap_USDT).catch((e) =>
  console.error(e)
);
