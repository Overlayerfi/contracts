import { updateLendingTokenTransferer, UpdateLendingAllowedTransfererProps } from '../../functions';

const props: UpdateLendingAllowedTransfererProps = {
  transferer: "",
  contractAddress: ""
}

updateLendingTokenTransferer(props).catch(error => {
  console.log(error);
  console.log("🛑 Operation failed");
  process.exit(1);
});
