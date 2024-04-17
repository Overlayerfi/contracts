import { giveAllowanceERC20, GiveAllowanceErc20Props } from '../../functions';

const props: GiveAllowanceErc20Props = {
  key: '',
  contractAddress: '',
  dest: ''
};

giveAllowanceERC20(props).catch((error) => {
  console.log(error);
  console.log('🛑 Operation failed');
  process.exit(1);
});
