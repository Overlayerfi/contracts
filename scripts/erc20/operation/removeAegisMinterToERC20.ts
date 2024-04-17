import { removeMinter, RemoveMinterProps } from '../../functions';

const props: RemoveMinterProps = {
  minter: '',
  contractAddress: ''
};

removeMinter(props).catch((error) => {
  console.log(error);
  console.log('🛑 Operation failed');
  process.exit(1);
});
