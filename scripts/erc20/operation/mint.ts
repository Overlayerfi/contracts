import { mint, MintProps } from '../../functions';

const props: MintProps = {
  amountEth: '',
  contractAddress: ''
};

mint(props).catch((error) => {
  console.log(error);
  console.log('🛑 Operation failed');
  process.exit(1);
});
