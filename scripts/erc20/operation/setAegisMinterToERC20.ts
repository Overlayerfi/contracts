import { setMinter, SetMinterProps } from '../../functions';

const props: SetMinterProps = {
  minter: "",
  contractAddress: ""
}

setMinter(props).catch(error => {
  console.log(error);
  console.log("🛑 Operation failed");
  process.exit(1);
});
