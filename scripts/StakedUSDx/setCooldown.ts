import { setCooldownStaking } from "../functions";

setCooldownStaking("0x9E7ef64F17E79366e70C1Fdc01E1A00323e1FCF8", 60).catch((err) => {
	console.error("Operation failed -> " + err);
})