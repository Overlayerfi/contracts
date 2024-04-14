import {
  deployMintableTokenWithFixedMaxSupply,
  MintableAegisERC20WithFixedTotalSupplyProps,
} from "../../functions";

const props: MintableAegisERC20WithFixedTotalSupplyProps = {
  initialSupplyEth: "",
  maxSupplyEth: "",
  name: "",
  symbol: "",
};

deployMintableTokenWithFixedMaxSupply(props).catch((error) => {
  console.log(error);
  console.log("🛑 Deployment failed");
  process.exit(1);
});
